#!/usr/bin/env node
/**
 * aekpm bin bootstrap — auto-detects which CLI code should run.
 *
 * Semantics (family-wide, shared with aekws):
 *   installed  — this bin runs from a global/prefix npm install
 *                (real path inside node_modules): it IS the published CLI →
 *                run the co-installed src, no mode file involved.
 *   local      — a repo checkout / dev link: run the local (working-directory)
 *                CLI. This is the DEFAULT when both local and a published
 *                global install exist — local build wins automatically.
 *   npm        — explicit opt-in ONLY: `aekpm use npm` writes
 *                ~/.aek/aekpm-mode = "npm"; then the local bin delegates to
 *                the published global CLI. Self-delegation is refused.
 */
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import process from 'node:process';
import { resolveAekHome } from '@cheezmil/coraek/home';

const AEK_HOME = resolveAekHome();
const MODE_FILE = join(AEK_HOME, 'aekpm-mode');

function mode() {
  try { return readFileSync(MODE_FILE, 'utf8').trim() || 'local'; } catch { return 'local'; }
}

/**
 * Find the published global CLI (for delegation in explicit npm mode).
 * AEK installs globally with `pnpm add -g` (never `npm install -g`), so the
 * pnpm global bin dir is first; then an explicit NPM_PREFIX override, then
 * the legacy npm global dir. Self (this very script) is never a target.
 */
function findGlobalAekpm() {
  const candidates = [];
  try {
    const r = spawnSync('pnpm', ['config', 'get', 'global-bin-dir'], { encoding: 'utf8', timeout: 15000 });
    const dir = (r.stdout || '').trim().split('\n')[0];
    if (r.status === 0 && dir && !dir.includes('undefined')) candidates.push(join(dir, 'aekpm'));
  } catch { /* pnpm not on PATH: skip */ }
  if (process.env.NPM_PREFIX) candidates.push(join(process.env.NPM_PREFIX, 'bin', 'aekpm'));
  candidates.push(join(homedir(), '.npm-global', 'bin', 'aekpm'));
  for (const c of candidates) {
    if (existsSync(c)) {
      try { if (realpathSync(c) !== SELF) return c; } catch { /* follow failed: accept */ return c; }
    }
  }
  return null;
}

let SELF;
try { SELF = realpathSync(process.argv[1]); } catch { SELF = process.argv[1]; }
const INSTALLED = String(SELF).includes('/node_modules/');
// `use` is the escape hatch: it must ALWAYS run the local CLI so a user can
// switch back to local even when the global install is missing.
const IS_USE = process.argv[2] === 'use';

if (INSTALLED) {
  // Published global/prefix install: run the co-installed CLI.
  await import(new URL('../src/cli.js', import.meta.url));
} else if (mode() === 'npm' && !IS_USE) {
  // Explicit npm mode from a local build: delegate to the published global CLI.
  const target = findGlobalAekpm();
  if (target) {
    const r = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
  console.error('[aekpm] npm mode: global CLI not found (looked in the pnpm global bin dir, $NPM_PREFIX/bin, ~/.npm-global/bin).');
  console.error('[aekpm] install it first: pnpm add -g @cheezmil/aek-prompt-manager   (AEK uses pnpm, not npm install -g)');
  console.error('[aekpm] (not published yet? `aekpm use local` runs this local build instead)');
  process.exit(1);
} else {
  // Default / local mode: run the local (repo) CLI.
  await import(new URL('../src/cli.js', import.meta.url));
}
