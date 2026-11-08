#!/usr/bin/env node
/**
 * Central dispatcher for AEK-owned root npm scripts.
 *
 * The 200+ dsh gate / build / verify / gen / release tooling commands used to
 * be scattered as one-liner `tsx scripts/<x>.ts` definitions inside the ROOT
 * `package.json`. They now live as data in `run.json` (right here in
 * `scripts/aek/`), and every dsh-direct root script is a thin pointer:
 *
 *     "clean": "node scripts/aek/run.mjs clean"
 *
 * The aek-owned launchers (`launch.mjs`, `verify-aek-home.mjs`, the
 * `verify-*` web gates) and the cross-package `pnpm --filter` delegation
 * scripts are intentionally NOT routed through here — they already live in
 * `scripts/aek/` as real files, or they delegate to another workspace package.
 *
 * This file is READ-ONLY friendly: it never writes, it just spawns. It
 * augments PATH with the repo `node_modules/.bin` so pnpm-installed binaries
 * (`tsx`, `vitest`, `tsdown`, `jscpd`, ...) resolve even when invoked outside
 * a `pnpm run` context.
 *
 * Usage:
 *   node scripts/aek/run.mjs <name>          # run the named command
 *   node scripts/aek/run.mjs --list          # print all defined names
 *   node scripts/aek/run.mjs --validate      # check run.json shape
 *
 * Exit codes: 0 = command succeeded; 1 = command failed; 2 = unknown name /
 * bad usage; 127 = could not spawn.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { delimiter } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
// scripts/aek -> repo root is two levels up.
const ROOT = join(HERE, '..', '..')
const MAP_PATH = join(HERE, 'run.json')

/** @param {string} message @param {number} code */
function fail(message, code) {
  console.error(message)
  process.exit(code)
}

const args = process.argv.slice(2)
const sub = args[0]

if (!sub || sub === '--help' || sub === '-h') {
  fail(
    'usage: node scripts/aek/run.mjs <script-name>\n' +
    '       node scripts/aek/run.mjs --list\n' +
    '       node scripts/aek/run.mjs --validate',
    2,
  )
}

if (sub === '--list' || sub === 'list') {
  const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'))
  for (const name of Object.keys(map).sort()) console.log(name)
  process.exit(0)
}

if (sub === '--validate' || sub === 'validate') {
  let map
  try {
    map = JSON.parse(readFileSync(MAP_PATH, 'utf8'))
  } catch (error) {
    fail(`run.json: FAIL (parse error: ${error.message})`, 1)
  }
  let bad = 0
  for (const [name, value] of Object.entries(map)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      console.error(`  bad entry ${JSON.stringify(name)}: expected non-empty string`)
      bad++
    }
  }
  console.log(bad === 0
    ? `run.json: OK (${Object.keys(map).length} command definitions)`
    : `run.json: FAIL (${bad} bad entries)`)
  process.exit(bad === 0 ? 0 : 1)
}

if (!existsSync(MAP_PATH)) {
  fail(`aek run: missing command map at ${MAP_PATH}`, 1)
}

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'))
const command = map[sub]
if (command === undefined) {
  console.error(`aek run: no command defined for ${JSON.stringify(sub)}`)
  console.error(`  run 'node scripts/aek/run.mjs --list' to see ${Object.keys(map).length} defined scripts`)
  process.exit(2)
}

// Make pnpm-installed binaries resolvable without a `pnpm run` wrapper.
const binDir = join(ROOT, 'node_modules', '.bin')
const env = { ...process.env, PATH: [binDir, process.env.PATH].filter(Boolean).join(delimiter) }

const shell = process.platform === 'win32' ? 'cmd' : 'sh'
const shellArg = process.platform === 'win32' ? '/c' : '-c'

const child = spawn(shell, [shellArg, command], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(`aek run: failed to spawn command for ${JSON.stringify(sub)}: ${error.message}`)
  process.exit(127)
})

child.on('exit', (code, signal) => {
  if (signal) {
    // Forward the terminating signal so the caller observes the same outcome.
    try { process.kill(process.pid, signal) } catch { /* already gone */ }
    process.exit(1)
  }
  process.exit(code ?? 1)
})
