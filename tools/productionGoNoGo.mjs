#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

function run(cmd, opts = {}) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }) };
  } catch (e) {
    return { ok: false, out: e.stdout ? String(e.stdout) : '', err: e.stderr ? String(e.stderr) : String(e.message) };
  }
}

function log(msg) { console.log(`[productionGoNoGo] ${msg}`); }

function audit(line) {
  try {
    if (process.env.NO_AUDIT === '1' || process.env.NO_AUDIT === 'true') return;
    fs.appendFileSync('DEPLOYMENT_AUDIT.md', `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch (e) {
    console.error('[productionGoNoGo] audit write failed', e?.message || e);
  }
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
  const auth = new GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token?.token || null;
}

async function getAccessToken() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    log('auth mode: service-account');
    const t = await loadServiceAccountToken();
    if (!t) throw new Error('service-account auth requested but no OAuth token obtained');
    return t;
  }
  log('auth mode: firebase-cli');
  const t = loadCliToken();
  if (!t) throw new Error('firebase-cli auth requested but no valid login cache found');
  return t;
}

function parseDirty(out) {
  return out.trim().split('\n').filter(Boolean).map((l) => l.slice(3));
}

const autoStash = process.argv.includes('--auto-stash');
log(`auto-stash=${autoStash}`);

const status = run('git status --porcelain');
if (!status.ok) {
  console.error('git status failed');
  process.exit(1);
}
const dirtyPaths = parseDirty(status.out);
const isDirty = dirtyPaths.length > 0;

if (isDirty && !autoStash) {
  console.error('NO-GO: repository is dirty; re-run with --auto-stash to allow safe self-healing');
  process.exit(1);
}

let stashRef = null;
let stashCreated = false;
let workflowError = null;

try {
  if (autoStash && isDirty) {
    log('creating stash (tracked + untracked)');
    const before = run('git stash list');
    if (!before.ok) throw new Error('git stash list failed');
    const s = run('git stash push -u -m "auto-stash productionGoNoGo"');
    if (!s.ok) throw new Error('git stash push failed');
    const after = run('git stash list');
    if (!after.ok) throw new Error('git stash list failed after stash');
    const beforeList = before.out.trim().split('\n').filter(Boolean);
    const afterList = after.out.trim().split('\n').filter(Boolean);
    const newEntry = afterList.find((line) => !beforeList.includes(line)) || afterList[0];
    stashRef = newEntry ? newEntry.split(':')[0] : null;
    if (!stashRef) throw new Error('unable to determine created stash ref');
    stashCreated = true;
    log(`stash created: ${stashRef}`);
    audit(`STASH_CREATED ${stashRef}`);
  }

  // When running with auto-stash, suppress audit writes in child processes
  if (autoStash) process.env.NO_AUDIT = process.env.NO_AUDIT || '1';

  // Basic auth validation
  try {
    await getAccessToken();
  } catch (e) {
    throw new Error(`Auth validation failed: ${e.message}`);
  }

  // Self-healing: if node_modules missing, attempt a single npm ci repair
  if (!fs.existsSync('node_modules')) {
    log('node_modules missing: attempting npm ci repair');
    const ci = run('npm ci --ignore-scripts');
    if (!ci.ok) {
      log('npm ci failed during repair attempt');
      // Try one more time as a safe-repair
      const ci2 = run('npm ci --ignore-scripts');
      if (!ci2.ok) throw new Error('npm ci repair attempt failed');
    }
    log('npm ci repair completed');
    audit('GO npm_ci_repair_applied');
  }

  // Validate QA invite if provided
  if (!process.env.PROD_TEST_PUBLIC_CODE || !process.env.PROD_TEST_TOKEN) {
    throw new Error('PROD_TEST_PUBLIC_CODE and PROD_TEST_TOKEN must be set for production go/no-go validation');
  }
  const publicCode = process.env.PROD_TEST_PUBLIC_CODE;
  const token = process.env.PROD_TEST_TOKEN;
  log('validating QA invite');
  const accessToken = await getAccessToken();
  const docPath = `projects/evotepro-7deff/databases/(default)/documents/publicElections/${encodeURIComponent(publicCode)}/invites/${encodeURIComponent(token)}`;
  const resp = await fetch(`https://firestore.googleapis.com/v1/${docPath}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 404) throw new Error('QA invite document not found');
  if (!resp.ok) throw new Error(`QA invite validation HTTP error ${resp.status}`);
  const body = await resp.json();
  const used = body.fields?.used?.booleanValue === true;
  const revoked = body.fields?.revoked?.booleanValue === true;
  if (used) throw new Error('QA token already used');
  if (revoked) throw new Error('QA token revoked');

  log('validation passed: GO');
  audit('GO production_go_no_go_pass');
  console.log('PASS');
} catch (err) {
  workflowError = err;
  console.error('\n=== NO-GO ===');
  console.error(err?.message || 'unexpected failure');
  audit(`NO-GO ${err?.message || 'unexpected failure'}`);
  console.log('NO-GO');
} finally {
  if (stashCreated) {
    log(`restoring stash ${stashRef}`);
    const apply = run(`git stash apply "${stashRef}"`);
    if (!apply.ok) {
      console.error('[productionGoNoGo] CRITICAL: failed to restore stash');
      console.error(apply.err || apply.out);
      audit(`CRITICAL stash_restore_failed ${stashRef}`);
      process.exit(1);
    }
    const drop = run(`git stash drop "${stashRef}"`);
    if (!drop.ok) {
      console.error('[productionGoNoGo] CRITICAL: failed to drop restored stash');
      console.error(drop.err || drop.out);
      audit(`CRITICAL stash_drop_failed ${stashRef}`);
      process.exit(1);
    }
    log('stash restored successfully');
    audit(`GO stash_restored ${stashRef}`);
  }
  if (workflowError) process.exit(1);
}
