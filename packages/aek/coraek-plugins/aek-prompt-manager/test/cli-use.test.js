/**
 * aekpm use — dev/npm mode switch (三分支 bootstrap 的 local/npm 语义).
 *
 * Semantics under test (family-wide rule):
 *   - local build is the AUTO default (wins when both local & global exist)
 *   - `use npm` is an explicit opt-in → local bin delegates to the global CLI
 *   - installed context ignores the mode file (that bin IS the global CLI)
 *
 * Each case spawns the real bin with an isolated AEK_HOME (tmp dir) so the
 * user's ~/.aek is never touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const BIN = fileURLToPath(new URL('../bin/aekpm.js', import.meta.url));

function runAekpm(args, home) {
  const childEnv = { ...process.env, AEK_HOME: home, NPM_PREFIX: '' };
  return new Promise((resolveP) => {
    execFile(process.execPath, [BIN, ...args], { env: childEnv }, (err, stdout, stderr) => {
      resolveP({ status: err ? (err.code ?? 1) : 0, out: `${stdout}${stderr}` });
    });
  });
}

test('use (no args) shows local default mode', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aekpm-use-'));
  try {
    const r = await runAekpm(['use'], home);
    assert.equal(r.status, 0);
    assert.match(r.out, /mode: local/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('use npm writes the mode file and use (no args) reports it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aekpm-use-'));
  try {
    let r = await runAekpm(['use', 'npm'], home);
    assert.equal(r.status, 0);
    assert.match(r.out, /mode set to: npm/);
    assert.equal(readFileSync(join(home, 'aekpm-mode'), 'utf8').trim(), 'npm');
    r = await runAekpm(['use'], home);
    assert.match(r.out, /mode: npm/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('use local switches back', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aekpm-use-'));
  try {
    writeFileSync(join(home, 'aekpm-mode'), 'npm\n');
    const r = await runAekpm(['use', 'local'], home);
    assert.equal(r.status, 0);
    assert.equal(readFileSync(join(home, 'aekpm-mode'), 'utf8').trim(), 'local');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('use rejects an unknown mode', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aekpm-use-'));
  try {
    const r = await runAekpm(['use', 'bogus'], home);
    assert.notEqual(r.status, 0);
    assert.match(r.out, /must be "local" or "npm"/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('npm mode without a global install fails with an actionable hint', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aekpm-use-'));
  try {
    writeFileSync(join(home, 'aekpm-mode'), 'npm\n');
    // aek-prompt-manager is not published: the delegation target does not
    // exist (NPM_PREFIX '' → default ~/.npm-global/bin/aekpm, absent in CI
    // isolation only when the user has no global aekpm — use a fake prefix).
    const childEnv = { ...process.env, AEK_HOME: home, NPM_PREFIX: join(home, 'no-such-prefix') };
    const r = await new Promise((resolveP) => {
      execFile(process.execPath, [BIN, 'status'], { env: childEnv }, (err, stdout, stderr) => {
        resolveP({ status: err ? (err.code ?? 1) : 0, out: `${stdout}${stderr}` });
      });
    });
    assert.notEqual(r.status, 0);
    assert.match(r.out, /global CLI not found/);
    assert.match(r.out, /aekpm use local/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('local mode runs the local CLI even when a mode file is missing', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aekpm-use-'));
  try {
    const r = await runAekpm(['--help'], home);
    assert.equal(r.status, 0);
    assert.match(r.out, /Commands:/);
    assert.match(r.out, /use <local\|npm>/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
