#!/usr/bin/env node
/**
 * aeksm — AEK skill hub CLI (commander-based; engine ported from
 * shenysun/skills-manager, MIT — see NOTICE).
 *
 * Three execution contexts, resolved from where THIS script actually lives
 * (symlinks resolved) — same contract as bin/aekws.mjs:
 *
 *   installed — the real path is inside a node_modules dir / no src/ next to
 *     bin/: the published tarball ships the compiled CLI (lib/cli.js,
 *     directory structure preserved by tsc); run it directly.
 *   dev       — a repo checkout (pnpm-workspace.yaml found by walking up):
 *     run the TypeScript source via tsx.
 *   npm       — dev checkout with `~/.aek/aeksm-mode` = "npm": delegate to
 *     the globally installed bin. Delegation is refused when the target is
 *     this very file (we ARE the global install → installed mode instead).
 */

import { resolve, dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolveAekHome } from '@cheezmil/coraek/home'

// Resolve REAL script path (follows symlinks — resolve() does NOT)
let SCRIPT_PATH
try { SCRIPT_PATH = realpathSync(process.argv[1]) }
catch { SCRIPT_PATH = resolve(process.argv[1]) }
const SCRIPT_DIR = dirname(SCRIPT_PATH)

// Installed context: real path lives in a node_modules dir, or there is no
// src/cli.ts next to this bin (published tarball layout).
const INSTALLED = SCRIPT_PATH.includes('/node_modules/')
  || !existsSync(join(SCRIPT_DIR, '..', 'src', 'cli.ts'))

// Workspace root: walk up from bin/ to the directory containing
// pnpm-workspace.yaml (layout-independent: the package may move again).
function findRepoRoot(start) {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
const REPO_ROOT = findRepoRoot(SCRIPT_DIR)

const AEK_HOME = resolveAekHome()
const MODE_FILE = join(AEK_HOME, 'aeksm-mode')
const TSX_BIN = REPO_ROOT ? join(REPO_ROOT, 'node_modules', '.bin', 'tsx') : null
// bin/ and src/ sit together inside the package — no hardcoded repo paths.
const CLI_ENTRY = join(SCRIPT_DIR, '..', 'src', 'cli.ts')

function getMode() {
  try { return readFileSync(MODE_FILE, 'utf8').trim() || 'dev' }
  catch { return 'dev' }
}

/**
 * Find the published global CLI (for delegation in npm mode). AEK installs
 * globally with `pnpm add -g` (never `npm install -g`): the pnpm global bin
 * dir is first, then an explicit NPM_PREFIX override, then legacy npm dir.
 */
function findGlobalAeksm() {
  const candidates = []
  try {
    const r = execFileSync('pnpm', ['config', 'get', 'global-bin-dir'], { encoding: 'utf8', timeout: 15000 })
    const dir = r.trim().split('\n')[0]
    if (dir && !dir.includes('undefined')) candidates.push(join(dir, 'aeksm'))
  } catch { /* pnpm not on PATH: skip */ }
  if (process.env.NPM_PREFIX) candidates.push(join(process.env.NPM_PREFIX, 'bin', 'aeksm'))
  candidates.push(join(homedir(), '.npm-global', 'bin', 'aeksm'))
  for (const c of candidates) if (existsSync(c) && realpathSync(c) !== SCRIPT_PATH) return c
  return null
}

/** Installed context: run the compiled CLI shipped in the tarball. */
function runInstalled() {
  import(new URL('../lib/cli.js', import.meta.url)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

const args = process.argv.slice(2)

/**
 * Run a child CLI process and propagate its exit code cleanly. With
 * `stdio: 'inherit'` the child has already printed any friendly error; a
 * non-zero exit must surface as the SAME exit code, not a `Command failed`
 * stack trace from an unhandled `execFileSync` throw.
 */
function runChild(bin, childArgs, cwd) {
  try {
    execFileSync(bin, childArgs, { stdio: 'inherit', cwd })
    process.exit(0)
  } catch (err) {
    // err.status is the child's exit code when it ran and exited non-zero.
    process.exit(typeof err.status === 'number' ? err.status : 1)
  }
}

if (INSTALLED) {
  // Global/prefix install (any mode-file value): the compiled CLI is right
  // next to this bin. Note: a "npm" mode file from the dev checkout must not
  // loop — we ARE the target, so just run the compiled CLI.
  runInstalled()
} else if (getMode() === 'npm' && args[0] !== 'use') {
  // Dev checkout asking for the global install. `use` is the escape hatch:
  // it must always run locally, so a missing global can never trap the user.
  const target = findGlobalAeksm()
  if (target) {
    runChild(process.execPath, [target, ...args])
  }
  console.error('Error: pnpm global CLI not found (looked in the pnpm global bin dir, $NPM_PREFIX/bin, ~/.npm-global/bin).')
  console.error('Hint: pnpm add -g @cheezmil/aek-skill-manager   (AEK uses pnpm, not npm install -g)')
  console.error('      (or run `aeksm use dev` to stay on the local build)')
  process.exit(1)
} else {
  // Dev mode: run the TypeScript source directly via tsx.
  if (!TSX_BIN || !REPO_ROOT) {
    console.error('Error: cannot resolve repo root / tsx. Run from the repo, or install globally:')
    console.error('  pnpm add -g @cheezmil/aek-skill-manager')
    process.exit(1)
  }
  runChild(TSX_BIN, [CLI_ENTRY, ...args], REPO_ROOT)
}
