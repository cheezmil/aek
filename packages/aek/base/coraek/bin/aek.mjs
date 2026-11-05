#!/usr/bin/env node
/**
 * aek — AEK's operator command line.
 *
 * Three execution contexts, resolved from where THIS script actually lives
 * (symlinks resolved) — the same contract as bin/aekws.mjs:
 *
 *   installed — the real path is inside a node_modules dir / no src/ next to
 *     bin/: the published tarball ships the compiled CLI (lib/aek-cli.mjs);
 *     run it directly.
 *   dev       — a repo checkout (pnpm-workspace.yaml found by walking up):
 *     run the TypeScript source via tsx.
 */

import { resolve, dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'

// Resolve REAL script path (follows symlinks — resolve() does NOT)
let SCRIPT_PATH
try { SCRIPT_PATH = realpathSync(process.argv[1]) }
catch { SCRIPT_PATH = resolve(process.argv[1]) }
const SCRIPT_DIR = dirname(SCRIPT_PATH)

// Installed context: real path lives in a node_modules dir, or there is no
// src/aek-cli.ts next to this bin (published tarball layout).
const INSTALLED = SCRIPT_PATH.includes('/node_modules/')
  || !existsSync(join(SCRIPT_DIR, '..', 'src', 'aek-cli.ts'))

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
const TSX_BIN = REPO_ROOT ? join(REPO_ROOT, 'node_modules', '.bin', 'tsx') : null
// bin/ and src/ sit together inside the package — no hardcoded repo paths.
const CLI_ENTRY = join(SCRIPT_DIR, '..', 'src', 'aek-cli.ts')

const args = process.argv.slice(2)

if (INSTALLED) {
  // lib/aek-cli.mjs is the compiled oclif runner.
  import(new URL('../lib/aek-cli.mjs', import.meta.url)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
} else {
  // Dev mode: run the TypeScript source directly via tsx.
  if (!TSX_BIN || !REPO_ROOT) {
    console.error('Error: cannot resolve repo root / tsx. Run from the repo, or install the package globally.')
    process.exit(1)
  }
  execFileSync(TSX_BIN, [CLI_ENTRY, ...args], { stdio: 'inherit', cwd: REPO_ROOT })
}
