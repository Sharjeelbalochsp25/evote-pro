#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const PROJECT_ID = 'evotepro-7deff';
const RELEASE_SCRIPT = path.join(process.cwd(), 'tools', 'runReleaseSafe.mjs');

function run(cmd, opts = {}) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }) };
  } catch (e) {
    return { ok: false, out: e.stdout ? String(e.stdout) : '', err: e.stderr ? String(e.stderr) : String(e.message) };
  }
}

function log(message) {
  console.log(`[release-check] ${message}`);
}

function fail(message, details = '') {
  if (details) {
    console.error(details);
  }
  throw new Error(message);
}

function audit(line) {
  fs.appendFileSync('DEPLOYMENT_AUDIT.md', `${new Date().toISOString()} ${line}\n`, 'utf8');
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

function authMode() {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'service-account' : 'firebase-cli';
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
  const docPath = `projects/${PROJECT_ID}/databases/(default)/documents/publicElections/${encodeURIComponent(publicCode)}/invites/${encodeURIComponent(token)}`;
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

function parseDirtyPaths(porcelain) {
  return porcelain.trim().split('\n').filter(Boolean).map((line) => line.slice(3));
}

function requireNoUnexpectedGitMutation(baseline, label) {
  const current = run('git status --porcelain');
  if (!current.ok) fail(`${label}: failed to read git status after stage`);
  const currentStatus = current.out.trim();
  if (currentStatus !== baseline.status) {
    fail(`${label}: unexpected git mutation detected`);
  }
  const head = run('git rev-parse HEAD');
  if (!head.ok) fail(`${label}: failed to read HEAD after stage`);
  if (head.out.trim() !== baseline.head) {
    fail(`${label}: HEAD changed unexpectedly`);
  }
}

async function main() {
  const autoStash = process.argv.includes('--auto-stash');
  log(`mode=checklist auto-stash=${autoStash}`);

  const baselineStatus = run('git status --porcelain');
  if (!baselineStatus.ok) fail('git status failed');
  const baselineHead = run('git rev-parse HEAD');
  if (!baselineHead.ok) fail('git rev-parse HEAD failed');
  const baselineStash = run('git stash list');
  if (!baselineStash.ok) fail('git stash list failed');
  const dirtyPaths = parseDirtyPaths(baselineStatus.out);
  const isDirty = dirtyPaths.length > 0;

  log(`git status summary: ${isDirty ? 'dirty' : 'clean'}`);
  console.log(baselineStatus.out.trim() || 'clean');

  if (isDirty && !autoStash) {
    fail('dirty git state without auto-stash enabled');
  }

  const wrapperSource = fs.readFileSync(RELEASE_SCRIPT, 'utf8');
  if (!wrapperSource.includes('finally') || !wrapperSource.includes('git stash apply') || !wrapperSource.includes('git stash drop')) {
    fail('stash restore logic missing in wrapper');
  }

  let stashRef = null;
  let stashCreated = false;
  const preflightOnlyStatus = { status: baselineStatus.out.trim(), head: baselineHead.out.trim(), stash: baselineStash.out.trim() };

  try {
    if (autoStash && isDirty) {
      log('stashing tracked and untracked changes');
      const stash = run('git stash push -u -m "auto-stash pre-deploy"');
      if (!stash.ok) fail('failed to create auto-stash', stash.err || stash.out);
      const afterStash = run('git stash list');
      if (!afterStash.ok) fail('failed to verify stash creation');
      const baselineList = baselineStash.out.trim().split('\n').filter(Boolean);
      const afterList = afterStash.out.trim().split('\n').filter(Boolean);
      const newEntry = afterList.find((line) => !baselineList.includes(line)) || afterList[0];
      stashRef = newEntry ? newEntry.split(':')[0] : null;
      if (!stashRef) fail('unable to determine created stash ref');
      stashCreated = true;
      log(`stash created: ${stashRef}`);
      audit(`STASH_CREATED ${stashRef}`);
      requireNoUnexpectedGitMutation(preflightOnlyStatus, 'post-stash');
    }

    if (!process.env.PROD_TEST_PUBLIC_CODE || !process.env.PROD_TEST_TOKEN) {
      fail('PROD_TEST_PUBLIC_CODE and PROD_TEST_TOKEN must be set before release verification');
    }

    const publicCode = process.env.PROD_TEST_PUBLIC_CODE;
    const token = process.env.PROD_TEST_TOKEN;
    const selectedAuthMode = authMode();
    if (selectedAuthMode === 'service-account') {
      log('auth validation: service-account mode only');
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) fail('service-account mode selected but GOOGLE_APPLICATION_CREDENTIALS is missing');
    } else {
      log('auth validation: firebase-cli mode only');
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) fail('firebase-cli mode required but GOOGLE_APPLICATION_CREDENTIALS is set');
    }

    const inviteState = await validateInvite(publicCode, token);
    if (!inviteState.ok) {
      if (inviteState.reason === 'missing') fail(`QA invite document not found for ${publicCode}/${token}`);
      if (inviteState.reason === 'http_error') fail(`QA invite validation failed with HTTP ${inviteState.status}`);
      fail(`Unable to validate invite: ${JSON.stringify(inviteState)}`);
    }
    if (inviteState.used) fail(`QA token ${token} has already been used.`);
    if (inviteState.revoked) fail(`QA token ${token} is revoked.`);
    log('auth and preflight validation passed');

    log('dry-run verification: invoking runReleaseSafe.mjs --dry-run');
    const dryRunBefore = {
      status: run('git status --porcelain').out.trim(),
      head: run('git rev-parse HEAD').out.trim(),
    };
    const dryRun = run(`node "${RELEASE_SCRIPT}" --dry-run`, { env: process.env, cwd: process.cwd() });
    if (!dryRun.ok) {
      fail('dry-run validation failed', dryRun.err || dryRun.out);
    }
    if (!dryRun.out.includes('[runReleaseSafe] dry-run summary')) {
      fail('dry-run output did not include the expected summary');
    }
    if (dryRun.out.includes('Running: npm run build') || dryRun.out.includes('running deployment workflow') || dryRun.out.includes('Deploying')) {
      fail('dry-run output suggested build or deploy execution');
    }
    const dryRunAfter = {
      status: run('git status --porcelain').out.trim(),
      head: run('git rev-parse HEAD').out.trim(),
    };
    if (dryRunBefore.status !== dryRunAfter.status || dryRunBefore.head !== dryRunAfter.head) {
      fail('dry-run caused unexpected git mutation');
    }
    log('dry-run verification passed (no build, deploy, or git mutation detected)');

    log('dependency integrity check: npm ci --ignore-scripts');
    const ci = run('npm ci --ignore-scripts');
    if (!ci.ok) fail('npm ci integrity check failed', ci.err || ci.out);
    requireNoUnexpectedGitMutation(preflightOnlyStatus, 'post-npm-ci');

    log('build check: npm run build');
    const build = run('npm run build');
    if (!build.ok) fail('build failed', build.err || build.out);
    requireNoUnexpectedGitMutation(preflightOnlyStatus, 'post-build');

    log('smoke test: npm run smoke:prod');
    if (!process.env.PROD_TEST_PUBLIC_CODE || !process.env.PROD_TEST_TOKEN) {
      fail('PROD_TEST_PUBLIC_CODE and PROD_TEST_TOKEN must be set before smoke testing');
    }
    const smoke = run('npm run smoke:prod');
    if (!smoke.ok) fail('smoke test failed', smoke.err || smoke.out);
    requireNoUnexpectedGitMutation(preflightOnlyStatus, 'post-smoke');

    log('pre-deploy simulation complete; no actual deploy step executed by checklist');
    console.log('Would be ready to run: node tools/runReleaseSafe.mjs --auto-stash');
    console.log('Would be ready to run: node tools/prodReleaseAndDeploy.mjs');

    console.log('\n=== CHECKLIST RESULT ===');
    console.log('PASS');
    console.log(`Auth mode: ${selectedAuthMode}`);
    console.log(`Git state: ${isDirty ? 'dirty (auto-stashed for the run)' : 'clean'}`);
    console.log('Rollback readiness: confirmed by stash restore logic check and post-run git state comparisons');
    console.log('Readiness state: GO for deployment');
    audit(`GO checklist_passed auth=${selectedAuthMode} dirty=${isDirty}`);
  } finally {
    if (stashCreated) {
      log(`restoring stash ${stashRef}`);
      const apply = run(`git stash apply "${stashRef}"`);
      if (!apply.ok) {
        console.error('[release-check] CRITICAL: failed to restore stash');
        console.error(apply.err || apply.out);
        audit(`CRITICAL stash_restore_failed ${stashRef}`);
        process.exit(1);
      }
      const drop = run(`git stash drop "${stashRef}"`);
      if (!drop.ok) {
        console.error('[release-check] CRITICAL: failed to drop restored stash');
        console.error(drop.err || drop.out);
        audit(`CRITICAL stash_drop_failed ${stashRef}`);
        process.exit(1);
      }
      const afterRestore = run('git stash list');
      if (!afterRestore.ok) fail('failed to verify stash state after restore');
      if (afterRestore.out.includes(stashRef)) {
        fail('stash still present after restore path executed');
      }
      log('stash restored successfully');
      audit(`GO stash_restored ${stashRef}`);
    }
  }
}

main().catch((err) => {
  console.error('\n=== CHECKLIST RESULT ===');
  console.log('FAIL');
  console.error(err?.message || 'unexpected failure');
  console.log('Readiness state: NO-GO for deployment');
  audit(`NO-GO checklist_failed ${err?.message || 'unexpected failure'}`);
  process.exit(1);
});
