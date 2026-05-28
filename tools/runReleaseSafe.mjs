#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function sh(cmd, opts = {}) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }) };
  } catch (e) {
    return { ok: false, out: e.stdout ? String(e.stdout) : '', err: e.stderr ? String(e.stderr) : String(e.message) };
  }
}

function log(msg) {
  console.log(`[runReleaseSafe] ${msg}`);
}

function audit(line) {
  try {
    if (process.env.NO_AUDIT === '1' || process.env.NO_AUDIT === 'true') return;
    fs.appendFileSync('DEPLOYMENT_AUDIT.md', `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch (e) {
    console.error('[runReleaseSafe] audit write failed', e?.message || e);
  }
}

function fail(message) {
  console.error(`\n=== NO-GO ===\n${message}`);
  audit(`NO-GO ${message}`);
  process.exit(1);
}

function parseDirtyPaths(porcelain) {
  return porcelain.trim().split('\n').filter(Boolean).map((line) => line.slice(3));
}

function loadCliToken() {
  const cliConfigPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cliConfigPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(cliConfigPath, 'utf8'));
    const token = config?.tokens?.access_token;
    const expiresAt = Number(config?.tokens?.expires_at || 0);
    if (!token || !expiresAt || expiresAt <= Date.now() + 60_000) return null;
    return token;
  } catch {
    return null;
  }
}

async function loadServiceAccountToken() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token?.token || null;
}

async function getAccessToken() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    log('auth mode selected: service-account');
    const token = await loadServiceAccountToken();
    if (!token) fail('service-account auth requested but no OAuth token could be obtained');
    return token;
  }

  log('auth mode selected: firebase-cli');
  const token = loadCliToken();
  if (!token) fail('firebase-cli auth requested but no valid login cache was found');
  return token;
}

async function validateInvite(publicCode, token) {
  const accessToken = await getAccessToken();
  log('preflight: validating QA invite');
  const docPath = `projects/evotepro-7deff/databases/(default)/documents/publicElections/${encodeURIComponent(publicCode)}/invites/${encodeURIComponent(token)}`;
  const resp = await fetch(`https://firestore.googleapis.com/v1/${docPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) return { ok: false, reason: 'missing' };
  if (!resp.ok) return { ok: false, reason: 'http_error', status: resp.status, text: await resp.text() };
  const body = await resp.json();
  const fields = body.fields || {};
  return {
    ok: true,
    used: fields.used?.booleanValue === true,
    revoked: fields.revoked?.booleanValue === true,
    raw: body,
  };
}

const autoStash = process.argv.includes('--auto-stash');
const dryRun = process.argv.includes('--dry-run');
const repoRoot = process.cwd();
const releaseScriptPath = path.join(repoRoot, 'tools', 'prodReleaseAndDeploy.mjs');

log(`mode=${dryRun ? 'dry-run' : 'release'}`);
log(`auto-stash=${autoStash}`);
log('detecting git state');
const status = sh('git status --porcelain');
if (!status.ok) fail('git status failed');

const dirtyPaths = parseDirtyPaths(status.out);
const isDirty = dirtyPaths.length > 0;
const releaseScriptDirty = dirtyPaths.some((entry) => entry.replaceAll('"', '') === 'tools/prodReleaseAndDeploy.mjs');
log(`git dirty=${isDirty}`);
if (releaseScriptDirty) {
  log('release script is dirty');
}

if (dryRun) {
  log('dry-run requested: no git modifications, build, or deploy will occur');
  log('dry-run requested: auto-stash is ignored to preserve no-side-effect behavior');
  if (!process.env.PROD_TEST_PUBLIC_CODE || !process.env.PROD_TEST_TOKEN) {
    fail('PROD_TEST_PUBLIC_CODE and PROD_TEST_TOKEN must be set for dry-run preflight');
  }
  const invite = await validateInvite(process.env.PROD_TEST_PUBLIC_CODE, process.env.PROD_TEST_TOKEN);
  if (!invite.ok) {
    if (invite.reason === 'missing') fail(`QA invite document not found for ${process.env.PROD_TEST_PUBLIC_CODE}/${process.env.PROD_TEST_TOKEN}`);
    if (invite.reason === 'http_error') fail(`QA invite validation failed with HTTP ${invite.status}`);
    fail(`Unable to validate invite: ${JSON.stringify(invite)}`);
  }
  if (invite.used) fail(`QA token ${process.env.PROD_TEST_TOKEN} has already been used.`);
  if (invite.revoked) fail(`QA token ${process.env.PROD_TEST_TOKEN} is revoked.`);
  log('preflight: invite validation passed');
  log('dry-run summary: would run npm run build, npm run smoke:prod, then firebase deploy --only hosting,firestore:rules');
  audit('GO dry_run_preflight_passed');
  process.exit(0);
}

if (isDirty && !autoStash) {
  fail('repository has uncommitted changes. Re-run with --auto-stash or use --dry-run');
}

let stashRef = null;
let stashCreated = false;
if (autoStash && isDirty) {
  if (releaseScriptDirty) {
    fail('tools/prodReleaseAndDeploy.mjs is dirty; auto-stash cannot safely remove the original release script while executing it directly');
  }

  log('stashing tracked and untracked changes');
  const before = sh('git stash list');
  if (!before.ok) fail('git stash list failed before stash creation');

  const stash = sh('git stash push -u -m "auto-stash pre-deploy"');
  if (!stash.ok) fail('git stash push failed');

  const after = sh('git stash list');
  if (!after.ok) fail('git stash list failed after stash creation');

  const beforeList = before.out.trim().split('\n').filter(Boolean);
  const afterList = after.out.trim().split('\n').filter(Boolean);
  const newEntry = afterList.find((line) => !beforeList.includes(line)) || afterList[0];
  stashRef = newEntry ? newEntry.split(':')[0] : null;
  if (!stashRef) fail('unable to determine created stash ref');

  stashCreated = true;
  log(`stash created: ${stashRef}`);
  audit(`STASH_CREATED ${stashRef}`);
}

const env = { ...process.env };
let workflowError = null;
try {
  log('running deployment workflow');
  // If we auto-stashed, suppress audit writes in the child process
  if (autoStash) env.NO_AUDIT = env.NO_AUDIT || '1';
  execSync(`node "${releaseScriptPath}"`, { stdio: 'inherit', cwd: repoRoot, env });
} catch (e) {
  workflowError = e;
  console.error('[runReleaseSafe] deployment workflow failed');
  audit('NO-GO deploy_script_failed');
} finally {
  if (stashCreated) {
    log(`restoring stash ${stashRef}`);
    const apply = sh(`git stash apply "${stashRef}"`);
    if (!apply.ok) {
      console.error('[runReleaseSafe] CRITICAL: failed to restore stash');
      console.error(apply.err || apply.out);
      audit(`CRITICAL stash_restore_failed ${stashRef}`);
      process.exit(1);
    }
    const drop = sh(`git stash drop "${stashRef}"`);
    if (!drop.ok) {
      console.error('[runReleaseSafe] CRITICAL: failed to drop restored stash');
      console.error(drop.err || drop.out);
      audit(`CRITICAL stash_drop_failed ${stashRef}`);
      process.exit(1);
    }
    log('stash restored successfully');
    audit(`GO stash_restored ${stashRef}`);
  }
}

if (workflowError) {
  process.exit(1);
}

log('release workflow completed successfully');
audit('GO release_workflow_completed');
