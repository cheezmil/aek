#!/usr/bin/env node
/**
 * Root-level entry point for AEK pnpm commands.
 *
 * Every AEK command launched from the repo root goes through this file so the
 * app slot is chosen in exactly one place. It injects the data root and the
 * slot's ports into the child process environment, runs the read-only
 * data-root gate, then forwards to the real entry.
 *
 * Slots (names are fixed; no bundle id is ever swapped):
 *   aek   -> ~/.aek        web 1685 / cdp 1686
 *   next  -> ~/.aek-next   web 1687 / cdp 1688
 * The Next root is derived from the resolved default (`<root>-next`), not
 * hardcoded, so an explicit `AEK_HOME` still produces the right sibling.
 *
 * `dev-web` also marks the process `AEK_MODE=dev`: that is what turns on the
 * AEK packages' module hot reload in the host (`@cheezmil/coraek-profile` widens
 * the `hmr` watch roots only under that flag). Every other entry point stays a
 * plain run, so nothing here changes a production boot.
 *
 * SAFETY: with no arguments this prints usage and exits — it never starts,
 * stops, writes or deletes anything. `--check` is a true dry run: it prints
 * the resolved environment and command without executing either the gate or
 * the child. All state changes require an explicit subcommand.
 *
 * Usage:
 *   node scripts/aek/launch.mjs                        # usage only, no side effects
 *   node scripts/aek/launch.mjs --check --slot next   # dry run
 *   node scripts/aek/launch.mjs [--slot next] web [args...]
 *   node scripts/aek/launch.mjs [--slot next] aek [args...]
 *   node scripts/aek/launch.mjs dev-web | inspector | demo-ptc
 *   node scripts/aek/launch.mjs verify-web-ui | start-dev | start-release
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAekHome } from '../../packages/aek/base/coraek/home.mjs'
import { SLOTS, slotHome } from '../../packages/aek/base/coraek/slots.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const NODE = process.execPath

/** @param {string} start @returns {string} */
function findProjectRoot(start) {
  let dir = start
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}

const ROOT = findProjectRoot(HERE)
const GATE = join(HERE, 'verify-aek-home.mjs')
const AEK_BIN = join(ROOT, 'packages', 'aek', 'base', 'coraek', 'bin', 'aek.mjs')
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx')

const USAGE = `AEK launcher — root pnpm commands must go through scripts/aek.

  node scripts/aek/launch.mjs [--slot aek|next] <command> [args...]
  node scripts/aek/launch.mjs --check [--slot aek|next]   (dry run, no side effects)

Commands:
  aek             aek CLI (pass profile/args through)
  web             aek web (the AEK console)
  dev-web         vite watcher + host rebuild watcher
  inspector       aek web with the inspector patch
  demo-ptc        scripts/demo-ptc.mjs
  verify-web-ui   read-only UI check / instance control
  start-dev       scripts/aek/start-dev.mjs
  start-release   scripts/aek/start-release.mjs
  desktop         scripts/aek/desktop.mjs (status / build / install / dev)
  data-root       scripts/aek/data-root.mjs (status / plan / copy)
  slots           scripts/aek/slots.mjs (check / only / both / stop-all / warm)

Slots: aek (default) -> ~/.aek, next -> ~/.aek-next; ports 1685/1686 vs 1687/1688.`

/** @param {string} cmd @param {string[]} args @returns {[string, string[]] | undefined} */
function invocation(cmd, args) {
  switch (cmd) {
    case 'aek': return [NODE, [AEK_BIN, ...args]]
    case 'web': return [NODE, [AEK_BIN, 'web', '--port', String(SLOTS[slot].webPort), ...args]]
    case 'dev-web': return [TSX, [join(ROOT, 'scripts', 'dev-web.ts'), '--poll', ...args]]
    case 'inspector': return [NODE, [AEK_BIN, 'web', '--patch', './packages/experimental/inspector/cordis.source.patch.yml', ...args]]
    case 'demo-ptc': return [NODE, [join(ROOT, 'scripts', 'demo-ptc.mjs'), ...args]]
    case 'verify-web-ui': return [NODE, [join(HERE, 'verify-web-ui.mjs'), ...args]]
    case 'start-dev': return [NODE, [join(HERE, 'start-dev.mjs'), ...args]]
    case 'start-release': return [NODE, [join(HERE, 'start-release.mjs'), ...args]]
    case 'desktop': return [NODE, [join(HERE, 'desktop.mjs'), ...args]]
    case 'data-root': return [NODE, [join(HERE, 'data-root.mjs'), ...args]]
    case 'slots': return [NODE, [join(HERE, 'slots.mjs'), ...args]]
    default: return undefined
  }
}

const argv = process.argv.slice(2)
let slot = 'aek'
let slotExplicit = false
let checkOnly = false
let rest = []
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg === '--slot' && argv[i + 1]) { slot = argv[++i]; slotExplicit = true }
  else if (arg.startsWith('--slot=')) { slot = arg.slice('--slot='.length); slotExplicit = true }
  else if (arg === '--check' || arg === '--dry-run') checkOnly = true
  else { rest = argv.slice(i); break }
}

if (!SLOTS[slot]) {
  console.error(`Unknown slot: ${slot}. Use "aek" or "next".`)
  process.exit(2)
}
if (rest.length === 0) {
  console.log(USAGE)
  process.exit(0)
}

const call = invocation(rest[0], rest.slice(1))
if (!call) {
  console.error(`Unknown command: ${rest[0]}`)
  console.log(USAGE)
  process.exit(2)
}

const base = resolveAekHome()
const home = slotHome(slot, { ...process.env, AEK_HOME: base })
const env = { ...process.env }
env.AEK_HOME = slotExplicit ? home : (env.AEK_HOME ?? home)
// Pin unconditionally: an inherited DSH_HOME belongs to the outer DSH
// product (this fork's upstream shape) and must never steer AEK's spawned
// runtimes at that home. AEK's data root is AEK_HOME or the default.
env.DSH_HOME = env.AEK_HOME
env.AEK_SLOT ??= slot
env.AEK_WEB_PORT ??= String(SLOTS[slot].webPort)
env.AEK_CDP_PORT ??= String(SLOTS[slot].cdpPort)
// Only the dev loop. The host half reads this flag to decide whether the AEK
// packages' build outputs are watched for in-process replacement; a plain
// `web` run must never hold such a watcher.
if (rest[0] === 'dev-web') env.AEK_MODE ??= 'dev'

if (checkOnly) {
  console.log(`slot:         ${slot}`)
  console.log(`AEK_HOME:     ${env.AEK_HOME}`)
  console.log(`DSH_HOME:     ${env.DSH_HOME}`)
  console.log(`AEK_WEB_PORT: ${env.AEK_WEB_PORT}`)
  console.log(`AEK_CDP_PORT: ${env.AEK_CDP_PORT}`)
  console.log(`AEK_MODE:     ${env.AEK_MODE ?? '(unset)'}`)
  console.log(`command:      ${call[0]} ${call[1].join(' ')}`)
  console.log('dry run: nothing executed, no files changed.')
  process.exit(0)
}

const gate = spawnSync(NODE, [GATE], { cwd: ROOT, encoding: 'utf8' })
if (gate.status !== 0) {
  process.stdout.write(gate.stdout ?? '')
  process.stderr.write(gate.stderr ?? '')
  process.exit(gate.status ?? 1)
}

const result = spawnSync(call[0], call[1], { cwd: ROOT, env, stdio: 'inherit' })
if (result.error) {
  console.error(`Failed to launch ${call[0]}: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
