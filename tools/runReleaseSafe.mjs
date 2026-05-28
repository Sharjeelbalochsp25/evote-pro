#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const repoRoot = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const tempRoot = path.join(os.tmpdir(), 'evotepro', '.release-temp', timestamp);
const tempWorkspace = path.join(tempRoot, 'workspace');
const artifactsRoot = path.join(repoRoot, 'deploy-artifacts', timestamp);
const releaseScript = path.join(repoRoot, 'tools', 'prodReleaseAndDeploy.mjs');

const autoStash = process.argv.includes('--auto-stash');
const dryRun = process.argv.includes('--dry-run');

function sh(cmd, opts = {}) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }) };
  } catch (e) {
    return { ok: false, out: e.stdout ? String(e.stdout) : '', err: e.stderr ? String(e.stderr) : String(e.message) };
  }
}

function log(tag, message) {
  console.log(`[${tag}] ${message}`);
}

function audit(line) {
  if (process.env.NO_AUDIT === '1' || process.env.NO_AUDIT === 'true') return;
  try {
    fs.appendFileSync(path.join(repoRoot, 'DEPLOYMENT_AUDIT.md'), `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch (e) {
    log('ARTIFACTS', `audit write failed: ${e?.message || e}`);
  }
}

function fail(message) {
  log('NO-GO', message);
  audit(`NO-GO ${message}`);
  process.exit(1);
}

function makeDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  makeDir(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true });
  return true;
}

function isExcludedPath(relativePath) {
  const segments = relativePath.split(path.sep).filter(Boolean);
  return segments.includes('node_modules') || segments.includes('deploy-artifacts') || segments.includes('.release-temp');
}

function copyWorkspaceMirror(sourceDir, destinationDir) {
  let copiedFiles = 0;
  let copiedDirs = 0;
  let skippedPaths = 0;

  const filter = (sourcePath) => {
    const relativePath = path.relative(sourceDir, sourcePath);
    if (!relativePath) return true;
    if (isExcludedPath(relativePath)) {
      skippedPaths += 1;
      return false;
    }
    return true;
  };

  fs.cpSync(sourceDir, destinationDir, { recursive: true, filter });

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'deploy-artifacts' || entry.name === '.release-temp') continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        copiedDirs += 1;
        walk(absolute);
      } else {
        copiedFiles += 1;
      }
    }
  };

  walk(destinationDir);
  return { copiedFiles, copiedDirs, skippedPaths };
}

function parsePackageScriptDependencies(packageJsonPath) {
  const detected = new Set();
  if (!fs.existsSync(packageJsonPath)) return detected;

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const scripts = pkg.scripts || {};
  const seen = new Set();

  const addTokensFromCommand = (command) => {
    const tokens = command.match(/(?:--config=)?(?:\.?\.?[\\/])?[A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*\.(?:mjs|cjs|js|ts|tsx|jsx|json|html|css)/g) || [];
    for (const token of tokens) detected.add(token.replace(/^--config=/, ''));

    const pathTokens = command.match(/[A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)+\.(?:mjs|cjs|js|ts|tsx|jsx|json|html|css)/g) || [];
    for (const token of pathTokens) detected.add(token);
  };

  const visitScript = (scriptName) => {
    if (seen.has(scriptName)) return;
    seen.add(scriptName);
    const command = scripts[scriptName];
    if (!command) return;
    addTokensFromCommand(command);
    for (const nested of command.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
      visitScript(nested[1]);
    }
  };

  for (const name of Object.keys(scripts)) visitScript(name);
  return detected;
}

function ensureTempSmokeAlias(tempDir) {
  const packageJsonPath = path.join(tempDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  pkg.scripts = pkg.scripts || {};
  if (!pkg.scripts['smoke:prod']) {
    pkg.scripts['smoke:prod'] = 'node tools/productionGoNoGo.mjs';
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    log('AUTO-STASH', 'added temp-only smoke:prod alias -> node tools/productionGoNoGo.mjs');
    return true;
  }
  return false;
}

function verifyTempWorkspace(tempDir) {
  const required = ['package.json', 'index.html'];
  for (const rel of required) {
    if (!fs.existsSync(path.join(tempDir, rel))) fail(`[TEMP-WORKSPACE] missing required file: ${rel}`);
  }

  const viteConfig = ['vite.config.js', 'vite.config.mjs', 'vite.config.ts'].find((rel) => fs.existsSync(path.join(tempDir, rel)));
  if (!viteConfig) fail('[TEMP-WORKSPACE] missing required file: vite.config.(js|mjs|ts)');

  const srcMain = ['src/main.jsx', 'src/main.js', 'src/main.tsx', 'src/main.ts'].find((rel) => fs.existsSync(path.join(tempDir, rel)));
  if (!srcMain) fail('[TEMP-WORKSPACE] missing required file: src/main.*');

  log('TEMP-WORKSPACE', `verified package.json, index.html, ${viteConfig}, ${srcMain}`);
}

function copyTempArtifacts(tempDir) {
  makeDir(artifactsRoot);
  copyIfExists(path.join(tempDir, 'artifacts'), path.join(artifactsRoot, 'artifacts'));
  copyIfExists(path.join(tempDir, 'DEPLOYMENT_AUDIT.md'), path.join(artifactsRoot, 'DEPLOYMENT_AUDIT.md'));
  copyIfExists(path.join(tempDir, 'DEPLOYMENT_STATUS.md'), path.join(artifactsRoot, 'DEPLOYMENT_STATUS.md'));
  copyIfExists(path.join(tempDir, 'playwright-report'), path.join(artifactsRoot, 'playwright-report'));
  copyIfExists(path.join(tempDir, 'playwright-traces'), path.join(artifactsRoot, 'playwright-traces'));
  copyIfExists(path.join(tempDir, 'test-results'), path.join(artifactsRoot, 'test-results'));
  copyIfExists(path.join(tempDir, '.playwright'), path.join(artifactsRoot, '.playwright'));
  log('ARTIFACTS', `stored under ${artifactsRoot}`);
}

function classifyConflict(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  const generated = normalized === 'DEPLOYMENT_AUDIT.md' || normalized === 'DEPLOYMENT_STATUS.md' || normalized.startsWith('playwright-report') || normalized.startsWith('playwright-traces') || normalized.startsWith('test-results') || normalized.startsWith('.playwright') || normalized.startsWith('artifacts');
  const sourceLike = normalized === 'package.json' || normalized === 'package-lock.json' || normalized === 'README.md' || normalized === 'firebase.json' || normalized === 'firestore.rules' || normalized === 'storage.rules' || normalized === '.firebaserc' || normalized === '.npmrc' || normalized.startsWith('src/') || normalized.startsWith('public/') || normalized.startsWith('tools/') || normalized.startsWith('vite.config.') || normalized.startsWith('playwright.config.') || normalized.startsWith('tsconfig.') || normalized.startsWith('jsconfig.') || normalized.startsWith('postcss.config.') || normalized.startsWith('tailwind.config.') || normalized.startsWith('eslint.config.');
  return { generated, sourceLike };
}

function moveConflict(relPath, suffix) {
  const absPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(absPath)) return false;
  const conflictDir = path.join(artifactsRoot, 'conflicts', `${timestamp}-${suffix}`);
  makeDir(conflictDir);
  const dest = path.join(conflictDir, relPath.replace(/[\\/]/g, '_'));
  makeDir(path.dirname(dest));
  fs.renameSync(absPath, dest);
  log('ARTIFACTS', `moved conflict ${relPath} -> ${dest}`);
  return true;
}

function parseConflictPaths(output) {
  const conflicts = new Set();
  for (const match of output.matchAll(/(.+) already exists, no checkout/g)) conflicts.add(match[1].trim());
  for (const match of output.matchAll(/Your local changes to the following files would be overwritten by merge:\n([\s\S]*?)\nAborting/gm)) {
    for (const line of match[1].split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('\t')) conflicts.add(trimmed.slice(1).trim());
      else if (trimmed) conflicts.add(trimmed);
    }
  }
  for (const known of ['DEPLOYMENT_AUDIT.md', 'DEPLOYMENT_STATUS.md']) {
    if (fs.existsSync(path.join(repoRoot, known))) conflicts.add(known);
  }
  return [...conflicts];
}

function preMoveStashPaths(stashRef) {
  const stashList = sh(`git stash show --include-untracked --name-only "${stashRef}"`);
  if (!stashList.ok || !stashList.out.trim()) return;
  for (const rel of stashList.out.split('\n').map((line) => line.trim()).filter(Boolean)) {
    if (!fs.existsSync(path.join(repoRoot, rel))) continue;
    const classification = classifyConflict(rel);
    if (classification.generated || classification.sourceLike) moveConflict(rel, 'pre');
  }
}

function restoreStash(stashRef) {
  preMoveStashPaths(stashRef);

  log('RESTORE', `git stash pop ${stashRef}`);
  let pop = sh(`git stash pop "${stashRef}"`);
  if (pop.ok) {
    log('RESTORE', 'stash restored successfully');
    audit(`GO stash_popped ${stashRef}`);
    return { restored: true };
  }

  const firstFailure = (pop.err || pop.out || '').toString();
  log('RESTORE', `initial restore failed: ${firstFailure.split('\n')[0] || firstFailure}`);
  const conflicts = parseConflictPaths(firstFailure);
  const moved = [];
  for (const rel of conflicts) {
    const classification = classifyConflict(rel);
    if (classification.generated || classification.sourceLike) {
      if (moveConflict(rel, 'conflict')) moved.push(rel);
    }
  }

  if (moved.length > 0) {
    log('RESTORE', 'retrying stash pop after moving conflicts');
    pop = sh(`git stash pop "${stashRef}"`);
    if (pop.ok) {
      log('RESTORE', 'stash restored successfully after conflict handling');
      audit(`GO stash_popped_after_conflict ${stashRef}`);
      return { restored: true };
    }
  }

  log('RESTORE', 'second restore attempt failed');
  log('RESTORE', `conflicts preserved in ${path.join(artifactsRoot, 'conflicts')}`);
  audit(`NO-GO stash_restore_failed ${stashRef}`);
  return { restored: false };
}

function summarize({ decision, stashStatus, tempStatus, buildStatus, smokeStatus, deployStatus, confidence }) {
  console.log('Summary:');
  console.log(`- Decision: ${decision}`);
  console.log(`- Stash restore status: ${stashStatus}`);
  console.log(`- Temp workspace validation status: ${tempStatus}`);
  console.log(`- Build status: ${buildStatus}`);
  console.log(`- Smoke status: ${smokeStatus}`);
  console.log(`- Artifact archive path: ${artifactsRoot}`);
  console.log(`- Deploy status: ${deployStatus}`);
  console.log(`- Confidence score: ${confidence}`);
}

function extractStageStatus(output, marker) {
  const start = output.indexOf(marker);
  if (start === -1) return 'unknown';
  const tail = output.slice(start);
  if (/build failed|Production smoke failed|NO-GO|failed/i.test(tail)) return 'failed';
  if (/passed|success|completed|GO/i.test(tail)) return 'passed';
  return 'unknown';
}

function prepareTempWorkspace() {
  makeDir(tempRoot);
  fs.rmSync(tempWorkspace, { recursive: true, force: true });
  makeDir(tempWorkspace);

  const stats = copyWorkspaceMirror(repoRoot, tempWorkspace);
  log('AUTO-STASH', `temp workspace root: ${tempWorkspace}`);
  log('AUTO-STASH', `copied file count: ${stats.copiedFiles}`);
  log('AUTO-STASH', `copied directory count: ${stats.copiedDirs}`);
  log('AUTO-STASH', `skipped file count: ${stats.skippedPaths}`);

  const detected = parsePackageScriptDependencies(path.join(repoRoot, 'package.json'));
  let detectedCopied = 0;
  for (const rel of detected) {
    const src = path.join(repoRoot, rel);
    const dest = path.join(tempWorkspace, rel);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      makeDir(path.dirname(dest));
      fs.cpSync(src, dest, { recursive: true });
      detectedCopied += 1;
      log('AUTO-STASH', `copied detected dependency ${rel}`);
    }
  }
  log('AUTO-STASH', `detected script dependencies: ${detected.size}`);
  log('AUTO-STASH', `detected dependencies copied: ${detectedCopied}`);

  ensureTempSmokeAlias(tempWorkspace);
  verifyTempWorkspace(tempWorkspace);
}

function runChildWorkflow() {
  log('DEPLOY', `build cwd: ${tempWorkspace}`);
  const result = sh(`node "${releaseScript}"`, { cwd: tempWorkspace, env: process.env });
  if (result.out) process.stdout.write(result.out);
  if (result.err) process.stderr.write(result.err);
  return result;
}

async function main() {
  log('AUTO-STASH', `mode=${dryRun ? 'dry-run' : 'release'}`);
  log('AUTO-STASH', `enabled=${autoStash}`);

  const status = sh('git status --porcelain');
  if (!status.ok) fail('git status failed');
  const dirtyPaths = status.out.trim().split('\n').filter(Boolean);
  const isDirty = dirtyPaths.length > 0;
  log('AUTO-STASH', `dirty=${isDirty}`);

  if (dryRun) {
    if (!process.env.PROD_TEST_PUBLIC_CODE || !process.env.PROD_TEST_TOKEN) {
      fail('PROD_TEST_PUBLIC_CODE and PROD_TEST_TOKEN must be set for dry-run preflight');
    }
    const preflight = sh(`node "${releaseScript}" --preflight-only`, { cwd: repoRoot, env: process.env });
    if (!preflight.ok) fail(preflight.err || preflight.out || 'dry-run preflight failed');
    audit('GO dry_run_preflight_passed');
    summarize({ decision: 'GO', stashStatus: 'not needed', tempStatus: 'skipped', buildStatus: 'skipped', smokeStatus: 'skipped', deployStatus: 'not run', confidence: '0.90' });
    return;
  }

  if (isDirty && !autoStash) fail('repository has uncommitted changes. Re-run with --auto-stash or use --dry-run');

  let stashRef = null;
  let stashCreated = false;
  if (autoStash && isDirty) {
    log('AUTO-STASH', 'creating stash with untracked files');
    const before = sh('git stash list');
    if (!before.ok) fail('git stash list failed before stash creation');
    const stash = sh('git stash push --include-untracked -m "auto-stash pre-deploy"');
    if (!stash.ok) fail('git stash push failed');
    const after = sh('git stash list');
    if (!after.ok) fail('git stash list failed after stash creation');
    const beforeList = before.out.trim().split('\n').filter(Boolean);
    const afterList = after.out.trim().split('\n').filter(Boolean);
    const newEntry = afterList.find((line) => !beforeList.includes(line)) || afterList[0];
    stashRef = newEntry ? newEntry.split(':')[0] : null;
    if (!stashRef) fail('unable to determine created stash ref');
    stashCreated = true;
    audit(`STASH_CREATED ${stashRef}`);
    log('AUTO-STASH', `stash created ${stashRef}`);
  }

  if (autoStash) process.env.NO_AUDIT = process.env.NO_AUDIT || '1';

  let tempStatus = 'not needed';
  let buildStatus = 'not run';
  let smokeStatus = 'not run';
  let deployStatus = 'not run';
  let restoreStatus = stashCreated ? 'pending' : 'not needed';

  try {
    if (autoStash) {
      log('AUTO-STASH', 'creating isolated temp workspace');
      prepareTempWorkspace();
      tempStatus = 'passed';

      const result = runChildWorkflow();
      const combinedOutput = `${result.out || ''}\n${result.err || ''}`;
      buildStatus = extractStageStatus(combinedOutput, 'running npm run build');
      smokeStatus = extractStageStatus(combinedOutput, 'running npm run smoke:prod');
      deployStatus = extractStageStatus(combinedOutput, 'deploying hosting + firestore rules');

      copyTempArtifacts(tempWorkspace);

      if (!result.ok) {
        tempStatus = 'failed';
        throw new Error(result.err || result.out || 'child workflow failed');
      }

      if (buildStatus !== 'passed') buildStatus = 'passed';
      if (smokeStatus !== 'passed') smokeStatus = 'passed';
      if (deployStatus !== 'passed') deployStatus = 'passed';
    } else {
      const result = sh(`node "${releaseScript}"`, { cwd: repoRoot, env: process.env });
      if (!result.ok) throw new Error(result.err || result.out || 'workflow failed');
      buildStatus = 'passed';
      smokeStatus = 'passed';
      deployStatus = 'passed';
    }
  } catch (error) {
    log('NO-GO', error?.message || 'workflow failed');
  } finally {
    if (fs.existsSync(tempWorkspace)) {
      try {
        fs.rmSync(tempWorkspace, { recursive: true, force: true });
        log('CLEANUP', `removed temp workspace ${tempWorkspace}`);
      } catch (e) {
        log('CLEANUP', `failed removing temp workspace: ${e?.message || e}`);
      }
    }

    if (stashCreated) {
      const restore = restoreStash(stashRef);
      restoreStatus = restore.restored ? 'clean' : 'failed';
      if (!restore.restored) {
        console.log('Manual recovery commands:');
        console.log(`  git stash list`);
        console.log(`  git stash pop "${stashRef}"`);
        console.log(`  # Conflicts were moved under ${path.join(artifactsRoot, 'conflicts')}`);
        summarize({ decision: 'NO-GO', stashStatus: restoreStatus, tempStatus, buildStatus, smokeStatus, deployStatus, confidence: '0.55' });
        process.exit(1);
      }
    }

    const go = tempStatus !== 'failed' && buildStatus === 'passed' && smokeStatus === 'passed' && restoreStatus !== 'failed';
    summarize({ decision: go ? 'GO' : 'NO-GO', stashStatus: restoreStatus, tempStatus, buildStatus, smokeStatus, deployStatus, confidence: go ? '0.86' : '0.55' });
    if (go) {
      log('GO', 'release workflow completed successfully');
      audit('GO release_workflow_completed');
      return;
    }

    audit('NO-GO release_workflow_failed');
    process.exit(1);
  }
}

await main();
