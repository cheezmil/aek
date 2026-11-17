#!/usr/bin/env node
/**
 * aeknext — the NEXT-slot runner (dual-tree CLI isolation).
 *
 * The bare commands (`aeksm`, `aekws`, …) always point at the STABLE tree and
 * the `current` slot. `aeknext` is the ONLY entry into the DEV tree's CLIs: it
 * runs a command's dev-tree bin against the `next` slot's data root, so
 * developing a CLI never touches the current slot's config or data.
 *
 * It is name-agnostic by design: the dev tree's command set is DISCOVERED from
 * the `bin` field of every `package.json` under `packages/aek/`, so an in-repo
 * plugin needs no fixed prefix and no `-next` variant. A command that is NOT in the dev
 * tree (an installed third-party tool, for example) is refused, never
 * "helpfully" resolved to an installed bin — that is the isolation the runner
 * exists to enforce.
 *
 * How it resolves (no absolute path is hardcoded; a global clone can run it):
 *   dev tree   — the repo root ABOVE this runner (walk up to pnpm-workspace).
 *                It must be the DEV / main worktree (`.git` is a directory);
 *                a linked/stable checkout is refused, so `aeknext` can never
 *                silently run the stable tree's CLIs.
 *   data root  — the `next` slot's home (`slotHome('next')`); `AEK_HOME`,
 *                `AEK_ROOT` and `DSH_HOME` are pinned to it for the child, the
 *                same way `launch.mjs` does for a slot.
 *
 * Subcommands:
 *   aeknext <cmd> [args...]          run <cmd>'s dev-tree bin in the next slot
 *   aeknext <cmd> [args...] --check  dry run: print the resolved bin + env, run nothing
 *   aeknext registry                 list the discovered dev-tree commands (read-only)
 *   aeknext link [--yes] [--dir D]   symlink this runner into ~/.local/bin (needs --yes)
 *
 * SAFETY: no args = usage only. `registry` and `--check` are read-only. `link`
 * changes state and requires `--yes`. Running a command executes that command
 * (its own behaviour is its own concern); the runner only adds the slot env.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { resolveAekRoot } from '../../packages/aek/base/coraek/home.mjs'

const NODE = process.execPath

const USAGE = `aeknext — run a DEV-tree CLI against the NEXT slot (current is never touched)

  aeknext <cmd> [args...]            run <cmd>'s dev-tree bin with AEK_HOME=<next data root>
  aeknext <cmd> [args...] --check    dry run: show the resolved bin + slot env, execute nothing
  aeknext registry                   list the dev-tree commands aeknext can run (read-only)
  aeknext link [--yes] [--dir D]     symlink this runner into ~/.local/bin (state change, needs --yes)

  <cmd> is any command declared in a dev-tree package.json "bin" field
  (name-agnostic: aek, aeksm, aekws, aekpm, and any in-repo plugin). A name that
  is not in the dev tree is refused — aeknext never falls back to an installed
  third-party bin. The bare command (without aeknext) stays pinned to current.`

/** @param {string} start @returns {string|null} the repo root, or null. */
function findRepoRoot(start) {
  let dir = start
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * The DEV tree this runner lives in. Must be the main worktree (`.git` is a
 * directory); a linked/stable checkout is refused so `aeknext` can never run
 * the stable tree's CLIs by accident.
 * @returns {string} the dev tree root.
 * @throws {Error} when the root or the dev-tree role cannot be established.
 */
function devTreeRoot() {
  let script
  try { script = realpathSync(process.argv[1] ?? fileURLToPath(import.meta.url)) }
  catch { script = fileURLToPath(import.meta.url) }
  const root = findRepoRoot(dirname(script))
  if (!root) throw new Error('aeknext: cannot find the repo root (pnpm-workspace.yaml) above the runner')
  const dotgit = join(root, '.git')
  if (!existsSync(dotgit) || !statSync(dotgit).isDirectory()) {
    throw new Error(
      'aeknext: this checkout is a linked/stable tree (`.git` is not a directory). '
      + 'aeknext must be linked into the DEV (main worktree) tree so it runs the dev CLIs, not the stable ones.',
    )
  }
  return root
}

/** Recursively yield every `package.json` under `dir`, skipping node_modules and dot-dirs. */
function* walkPackages(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkPackages(p)
    else if (entry.name === 'package.json') yield p
  }
}

/**
 * Discover the dev tree's command set from the `bin` field of every
 * `package.json` under `packages/aek/`. Returns `{ name -> absolute bin path }`
 * plus any collisions.
 * @param {string} root - repo root.
 * @returns {{ map: Map<string, string>, collisions: Map<string, string[]> }}
 */
function commandRegistry(root) {
  const map = new Map()
  const collisions = new Map()
  for (const pj of walkPackages(join(root, 'packages', 'aek'))) {
    /** @type {{ bin?: string | Record<string, string>, name?: string } | null} */
    let j = null
    try { j = JSON.parse(readFileSync(pj, 'utf8')) } catch { continue }
    if (!j) continue
    const pkgDir = dirname(pj)
    /** @param {string} name @param {string} rel */
    const add = (name, rel) => {
      const abs = resolve(pkgDir, rel)
      if (map.has(name)) collisions.set(name, [...(collisions.get(name) ?? [map.get(name)]), abs])
      else map.set(name, abs)
    }
    if (typeof j.bin === 'string') { if (j.name) add(j.name, j.bin) }
    else if (j.bin && typeof j.bin === 'object') { for (const [name, rel] of Object.entries(j.bin)) add(name, rel) }
  }
  return { map, collisions }
}

/** Build the next-slot environment for a child (mirrors launch.mjs slot injection). */
function nextSlotEnv() {
  const env = { ...process.env }
  env.AEK_HOME = slotHome('next', env)
  env.AEK_ROOT = resolveAekRoot(env)
  env.DSH_HOME = env.AEK_HOME
  env.AEK_SLOT = 'next'
  env.AEK_WEB_PORT = String(SLOTS.next.webPort)
  env.AEK_CDP_PORT = String(SLOTS.next.cdpPort)
  return env
}

/** @param {{ cmd: string, rest: string[], check: boolean }} a */
function runCommand({ cmd, rest, check }) {
  const root = devTreeRoot()
  const { map, collisions } = commandRegistry(root)
  const bin = map.get(cmd)
  if (!bin) {
    const known = [...map.keys()].sort()
    console.error(
      `aeknext: "${cmd}" is not a command in the dev tree (dev bin set: ${known.join(', ') || '(none)'}).`
      + '\n  aeknext only runs the dev tree\'s own CLIs — it never falls back to an installed third-party bin.',
      `  To run an installed tool against the next data root, do it yourself:  AEK_HOME=${slotHome('next')} ${cmd} …`,
    )
    process.exit(2)
  }
  for (const [name, paths] of collisions) {
    if (name === cmd) console.error(`aeknext: warning — multiple dev packages declare "${name}"; using ${paths[0]}`)
  }
  const env = nextSlotEnv()
  if (check) {
    console.log('aeknext --check (dry run, nothing executed)\n')
    console.log(`  command : ${cmd}`)
    console.log(`  dev bin : ${bin}`)
    console.log(`  cwd     : ${root}`)
    for (const k of ['AEK_HOME', 'AEK_ROOT', 'DSH_HOME', 'AEK_SLOT', 'AEK_WEB_PORT', 'AEK_CDP_PORT']) {
      console.log(`  ${k.padEnd(10)}: ${env[k]}`)
    }
    process.exit(0)
  }
  // spawnSync (not execFileSync): a CLI's non-zero exit must PROPAGATE as this
  // runner's exit code; the child's stdio is inherited.
  const r = spawnSync(NODE, [bin, ...rest], { stdio: 'inherit', cwd: root, env })
  if (r.error) { console.error(`aeknext: failed to run ${cmd}: ${String(r.error.message)}`); process.exit(1) }
  process.exit(r.status ?? 1)
}

/** @param {string[]} args */
function link(args) {
  const yes = args.includes('--yes')
  const dirAt = args.indexOf('--dir')
  const destDir = dirAt !== -1 ? resolve(args[dirAt + 1]) : join(homedir(), '.local', 'bin')
  const target = realpathSync(fileURLToPath(import.meta.url))
  const dest = join(destDir, 'aeknext')
  const preview = `aeknext link: ${dest}  ->  ${target}`
  if (!yes) { console.log(`${preview}   (add --yes to create; target keeps its own executable bit)`); return 0 }
  mkdirSync(destDir, { recursive: true })
  // Remove any existing link/file at the destination (rmSync on a symlink
  // removes the link, never the target). `force` makes a missing dest a no-op.
  rmSync(dest, { force: true })
  symlinkSync(target, dest)
  // The target is a shebang'd .mjs; it needs its own executable bit so the
  // symlink is runnable directly as `aeknext`.
  try { chmodSync(target, 0o755) } catch { /* best-effort; the runner still works via `node aeknext.mjs` */ }
  console.log(`${preview}   (created)`)
  console.log('  bare commands are untouched; `aeknext <cmd>` now runs the dev CLIs against the next slot.')
  return 0
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) { console.log(USAGE); return 0 }
  const first = argv[0]
  if (first === 'registry' || first === '--registry') {
    const root = devTreeRoot()
    const { map, collisions } = commandRegistry(root)
    const names = [...map.keys()].sort()
    if (names.length === 0) { console.log('aeknext registry: no dev-tree commands found (no package.json "bin" under packages/aek)'); return 0 }
    for (const n of names) {
      const extra = collisions.has(n) ? `  [${collisions.get(n).length} collisions]` : ''
      console.log(`  ${n.padEnd(24)} ${map.get(n)}${extra}`)
    }
    return 0
  }
  if (first === 'link' || first === 'install') {
    process.exit(link(argv.slice(1)))
  }
  if (first === '-h' || first === '--help' || first === 'help' || first === 'usage') { console.log(USAGE); return 0 }
  // Otherwise: first token is the command, the rest are its args. `--check` is a
  // runner flag (dry run), not part of the command's own arguments.
  const rest = argv.slice(1)
  const checkIdx = rest.indexOf('--check')
  const check = checkIdx !== -1
  if (check) rest.splice(checkIdx, 1)
  runCommand({ cmd: first, rest, check })
  return 0
}

process.exit(main())
