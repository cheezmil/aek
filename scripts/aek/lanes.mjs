#!/usr/bin/env node
/**
 * Lane lifecycle: parallel-agent dev slots.
 *
 * A LANE is a dynamic slot (coraek `lanes` registry): its own git worktree +
 * branch, its own data root (`~/.aek/lanes/<name>`), its own port pair from
 * the cpuh-allocated pool, its own LaunchAgent, its own CDP port. Every
 * lane's dev infrastructure runs from its OWN worktree's scripts, so two
 * agents in two lanes never share a process, a port, or a data root.
 *
 * Desktop-shell discipline (m02603: AEK 桌面不允许有多个实例): the desktop
 * shell is a GLOBALLY EXCLUSIVE resource. `start` is backend-only (agent +
 * web); `shell` launches this lane's dev shell and terminates EVERY other
 * dev-variant shell (the built-in next slot's + all other lanes') first.
 * The production install in the user's Applications dir is user-managed and
 * never touched by lane verbs.
 *
 * The one shared coordinate is the registry (`~/.aek/lanes.json`), guarded by
 * an atomic mkdir lock; the claim protocol makes a second agent's grab of an
 * already-claimed lane a hard failure, not a fight.
 *
 * Built-in slots (`aek` / `next`) are untouched: they keep 1685-1688, the
 * release pipeline and `all`-style enumeration stay built-in-only, so lane
 * agents are immune to release / dev-cycle / close-next operations.
 *
 * READ-ONLY by default: `list` needs no flags. Every mutation requires
 * `--yes` (except `claim`, which is the agent handshake and takes no flag).
 *
 * Usage:
 *   node scripts/aek/lanes.mjs list
 *   node scripts/aek/lanes.mjs new <name> [--from <ref>] [--worktree <path>] [--yes]
 *   node scripts/aek/lanes.mjs claim <name>            # agent handshake (AEK_AGENT_ID env or pid)
 *   node scripts/aek/lanes.mjs start <name> --yes      # backend only: agent + web (cold-start bootstrap)
 *   node scripts/aek/lanes.mjs shell <name> --yes      # exclusive dev shell (kills every other dev-variant shell)
 *   node scripts/aek/lanes.mjs stop <name> --yes       # shell + web, bootout the lane's LaunchAgent
 *   node scripts/aek/lanes.mjs remove <name> --yes     # stop, drop the worktree, archive the data root, release the pair
 *
 * Agent discipline (NOT encoded here, per cpuh rules): after `new` mark the
 * pair with `cpuh use <web> <cdp>` ("aek lane <name>"); after `remove` run
 * `cpuh unuse <web> <cdp>`.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  allocateLane,
  claimLane,
  isLane,
  isLaneName,
  laneConfig,
  laneHome,
  listLanes,
  readLanesRegistry,
  releaseLane,
  unclaimLane,
} from '../../packages/aek/base/coraek/lanes.mjs'
import { isPidAlive, readSlotLock } from '../../packages/aek/base/coraek/slot-lock.mjs'
import { resolveAekRoot } from '../../packages/aek/base/coraek/home.mjs'
import { slotConfig, slotHome } from '../../packages/aek/base/coraek/slots.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SCRIPT_DIR, '..', '..')
const CONFIRMED = process.argv.includes('--yes')
const AGENT_ID = process.env.AEK_AGENT_ID?.trim() || `agent-${process.pid}`

function usage() {
  console.log(`AEK lanes (parallel-agent dev slots)

  lanes.mjs list                          registry + live state (read-only)
  lanes.mjs new <name> [--from <ref>] [--worktree <path>] --yes
                                          allocate ports + worktree + data root + claim
  lanes.mjs claim <name>                  agent handshake (refuse when another live agent holds it)
  lanes.mjs start <name> --yes            backend only: LaunchAgent + web (cold-start bootstrap, no shell)
  lanes.mjs shell <name> --yes            exclusive dev shell: terminates every OTHER dev-variant
                                          shell (next slot + other lanes), then launches this lane's
                                          shell with CDP on the lane's cdp port
  lanes.mjs stop <name> --yes             stop shell + web, bootout the lane's LaunchAgent
  lanes.mjs remove <name> --yes           stop, drop the worktree, archive the data root, release the pair

Desktop-shell rule (m02603): at most ONE dev-variant AEK shell at a time;
the production install is user-managed and never touched by lane verbs.
After 'new' / 'remove': run cpuh use/unuse for the allocated pair (agent discipline).`)
}

/** @returns {string[] | null} value args for the verb, or null = bad usage. */
function takeArgs(verb) {
  const args = process.argv.slice(2).filter((a) => a !== '--yes')
  if (args[0] !== verb) return null
  return args.slice(1)
}

function fail(message) {
  console.error(`[lanes] ${message}`)
  process.exit(1)
}

/** Run a child of the LANE's own tree (that is the whole isolation point). */
function runInTree(worktree, script, argv) {
  const cmd = process.execPath
  const args = [join(worktree, 'scripts', 'aek', script), ...argv]
  const prefix = `[${script}] `
  const res = spawnSync(cmd, args, { cwd: worktree, encoding: 'utf8', env: process.env })
  if (res.stdout) process.stdout.write(prefix + res.stdout)
  if (res.stderr) process.stderr.write(prefix + res.stderr)
  if (res.status !== 0) fail(`${script} ${argv.join(' ')} exited ${res.status} (from ${worktree})`)
}

/** The lane's worktree path, as recorded (or the default under the home dir). */
function worktreeOf(name) {
  const entry = readLanesRegistry().lanes[name]
  if (!entry) fail(`lane "${name}" is not registered`)
  return entry.worktree ?? join(homedir(), 'MyDurio', `aek-lane-${name}`)
}

function agentFor(name) {
  return `com.cheezmil.aek.web.${name}`
}

/**
 * Preflight fight guard: refuse to act when a process that does NOT belong to
 * this lane already holds one of its ports.
 */
function preflightLanes(name, expectedPid) {
  const cfg = laneConfig(name)
  const res = spawnSync('lsof', ['-nP', `-iTCP:${cfg.webPort},-iTCP:${cfg.cdpPort}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  if (res.status !== 0 || !res.stdout.trim()) return // free = OK
  const holders = res.stdout
    .split('\n')
    .slice(1)
    .map((line) => Number(line.split(/\s+/)[1]))
    .filter(Boolean)
  for (const pid of holders) {
    if (pid === expectedPid) continue // our own chain
    if (!isPidAlive(pid)) continue
    const cmd = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim()
    const mine =
      cmd.includes(String(cfg.webPort)) ||
      cmd.includes(String(cfg.cdpPort)) ||
      cmd.includes(`aek-${name}.localhost`) ||
      cmd.includes(agentFor(name)) ||
      cmd.includes(`aek-lane-${name}`)
    if (!mine) {
      fail(`lane "${name}" port ${cfg.webPort} is held by pid ${pid} (${cmd.slice(0, 120)}) that does not belong to this lane — another session owns it; pick a different lane`)
    }
  }
}

// ---------------------------------------------------------------- list

/**
 * The dev-variant shell binaries that may be running: the built-in next
 * slot's dev bundle + every registered lane's dev bundle. The production
 * install (Applications dir) is deliberately EXCLUDED — `shell` only
 * arbitrates among dev variants (m02603).
 * @returns {string[]} absolute paths of dev-variant shell binaries.
 */
function devVariantShellBinaries() {
  const paths = []
  try {
    const next = slotConfig('next')
    paths.push(join(slotHome('next'), 'dev', `${next.devAppName}.app`, 'Contents', 'MacOS', next.devAppName))
  } catch { /* next slot not resolvable — nothing to kill there */ }
  for (const name of listLanes()) {
    try {
      const cfg = laneConfig(name)
      paths.push(join(laneHome(name), 'dev', `${cfg.devAppName}.app`, 'Contents', 'MacOS', cfg.devAppName))
    } catch { /* lane no longer registered */ }
  }
  return paths
}

/**
 * Terminate every running dev-variant shell (exclusive-shell discipline).
 * SIGTERM first, SIGKILL whatever is stuck after ~5s.
 * @returns {number[]} the pids terminated (or still pending at SIGKILL).
 */
function killDevShells() {
  const paths = devVariantShellBinaries()
  if (paths.length === 0) return []
  const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  const pids = []
  for (const line of String(ps.stdout ?? '').split('\n')) {
    const m = line.match(/^\s*(\d+)\s/)
    if (!m) continue
    if (paths.some((p) => line.includes(p))) pids.push(Number(m[1]))
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
      console.log(`[lanes] terminated dev shell pid ${pid}`)
    } catch { /* already gone */ }
  }
  const deadline = Date.now() + 5000
  while (pids.some(isPidAlive) && Date.now() < deadline) {
    spawnSync('sleep', ['0.5'])
  }
  for (const pid of pids) {
    if (isPidAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch { /* gone */ }
    }
  }
  return pids
}

/** Poll a TCP port until something listens (or the budget runs out). */
function waitForPort(port, ms) {
  const startAt = Date.now()
  while (Date.now() - startAt < ms) {
    const out = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim()
    if (out.split('\n').filter(Boolean).length > 1) return true
    spawnSync('sleep', ['0.5'])
  }
  return false
}

if (process.argv.length === 2 || process.argv[2] === 'list') {
  const lanes = listLanes()
  if (lanes.length === 0) {
    console.log('[lanes] no lanes registered (pool free)')
  }
  for (const name of lanes) {
    const cfg = laneConfig(name)
    const entry = readLanesRegistry().lanes[name]
    const lock = readSlotLock(name)
    const shellPid = lock?.shellPid
    const web = spawnSync('lsof', ['-nP', `-iTCP:${cfg.webPort}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.split('\n').slice(1).map((l) => Number(l.split(/\s+/)[1])).filter(Boolean)
    const agentLoaded = spawnSync('launchctl', ['print', `gui/${String(process.getuid())}/${agentFor(name)}`], { stdio: ['ignore', 'pipe', 'ignore'] }).status === 0
    const claim = entry.claim
    const claimState = !claim ? 'unclaimed' : isPidAlive(claim.pid) ? `claimed by ${claim.agentId} (pid ${claim.pid})` : `stale claim (${claim.agentId})`
    console.log(
      `[lanes] ${name}: web ${cfg.webPort}/${cfg.cdpPort} cdp ${cfg.cdpPort} ` +
        `worktree ${entry.worktree ?? '(default)'} branch ${entry.branch} ` +
        `${web.length ? `web up (${web.join(',')})` : 'web down'} ` +
        `${shellPid && isPidAlive(shellPid) ? `shell pid ${shellPid}` : 'shell down'} ` +
        `${agentLoaded ? 'agent loaded' : 'agent not loaded'} ${claimState}`
    )
  }
  process.exit(0)
}

// ---------------------------------------------------------------- new

{
  const args = takeArgs('new')
  if (args !== null) {
    if (args[0] === undefined) {
      usage()
      process.exit(2)
    }
    if (!CONFIRMED) fail(`"new" creates a worktree and allocates ports. Re-run with --yes.`)
    const name = args[0]
    if (!isLaneName(name)) fail(`bad lane name "${name}" — kebab 1-12 chars, not aek/next`)
    const fi = args.indexOf('--from')
    const from = fi >= 0 ? args[fi + 1] : undefined
    const wi = args.indexOf('--worktree')
    const wtFlag = wi >= 0 ? args[wi + 1] : undefined
    const worktree =
      typeof wtFlag === 'string' && !wtFlag.startsWith('--')
        ? join(homedir(), wtFlag.startsWith('/') ? wtFlag.slice(1) : `MyDurio/${wtFlag}`)
        : join(homedir(), 'MyDurio', `aek-lane-${name}`)
    if (existsSync(worktree)) fail(`worktree path already exists: ${worktree} (use --worktree <path>)`)

    // allocateLane refuses a name that is already registered; the pool scan
    // refuses a taken pair — both under the registry lock.
    const entry = allocateLane(name, { branch: `lane/${name}`, worktree })
    console.log(`[lanes] allocated ${name}: web ${entry.webPort} / cdp ${entry.cdpPort} (registry: ${join(resolveAekRoot(), 'lanes.json')})`)

    const wt = spawnSync('git', ['-C', REPO_ROOT, 'worktree', 'add', worktree, '-b', `lane/${name}`, from ?? 'main'], { encoding: 'utf8' })
    if (wt.status !== 0) {
      releaseLane(name)
      fail(`git worktree add failed (${(wt.stderr || wt.stdout).trim().slice(0, 300)}); registry entry released — fix and retry`)
    }
    console.log(`[lanes] worktree: ${worktree} (branch lane/${name})`)

    // Data root with its own manifest (dirs table so per-folder resolution
    // works exactly like the built-in slots). An empty table is safe: the
    // resolver falls back to the folder-name default, which is what the
    // container manifest's identity mappings express anyway.
    const home = laneHome(name)
    mkdirSync(home, { recursive: true })
    const containerManifest = (() => {
      try {
        return readFileSync(join(resolveAekRoot(), 'aek.yaml'), 'utf8')
      } catch {
        return ''
      }
    })()
    const dirsBlock = containerManifest
      ? (containerManifest.match(/^dirs:\n(?:  \S[^\n]*\n)*/m)?.[0] ?? '')
      : ''
    writeFileSync(join(home, 'aek.yaml'), `# Lane data root for "${name}" (written by scripts/aek/lanes.mjs)\nversion: 1\nroot: .\nslots:\n  ${name}: .\n${dirsBlock || 'dirs: {}\n'}`)
    console.log(`[lanes] data root: ${home}`)

    claimLane(name, AGENT_ID, process.pid)
    console.log(`[lanes] claimed by ${AGENT_ID} (pid ${process.pid})`)
    console.log(`[lanes] next: cpuh use ${entry.webPort} "aek lane ${name} web" && cpuh use ${entry.cdpPort} "aek lane ${name} cdp"  (then, from the lane's own tree: node scripts/aek/lanes.mjs start ${name} --yes)`)
    process.exit(0)
  }
}

// ---------------------------------------------------------------- claim / unclaim

{
  const args = takeArgs('claim')
  if (args !== null) {
    const name = args[0]
    if (!isLane(name)) fail(`lane "${name}" is not registered`)
    preflightLanes(name, process.pid)
    claimLane(name, AGENT_ID, process.pid)
    console.log(`[lanes] ${name} claimed by ${AGENT_ID} (pid ${process.pid})`)
    process.exit(0)
  }
  const un = takeArgs('unclaim')
  if (un !== null) {
    const name = un[0]
    if (!isLane(name)) fail(`lane "${name}" is not registered`)
    unclaimLane(name, AGENT_ID)
    console.log(`[lanes] ${name} unclaimed by ${AGENT_ID}`)
    process.exit(0)
  }
}

// ---------------------------------------------------------------- start / stop

/**
 * Cold-start bootstrap for a freshly-checked-out lane worktree (gitignored lib/
 * outputs are absent). Each step is idempotent and skipped when its artifact
 * already exists, so a warm lane pays nothing:
 *   1. pnpm install (first time only)
 *   2. generate-typert — the bundle-free Typert pass that writes every
 *      lib/typert host + remote-client artifact (the host-compiler gate needs
 *      these to resolve the /remote subpath of the dsh-api packages)
 *   3. the @cheezmil filter build (pnpm --filter for the cheezmil packages) —
 *      the AEK public plugin packages are not in the tsconfig.host.json
 *      reference graph, so tsc -b never builds them
 *   4. two-face host faces — members whose root tsconfig is `files: []` with a
 *      tsconfig.host.json + tsconfig.client.json pair (e.g. packages/client/shortcuts):
 *      the aggregate `tsc -b <refs>` host-src gate leaves their host face unemitted
 *      on a cold tree (observed: lib/types/index.js missing → tsdown UNRESOLVED_ENTRY),
 *      so build each host face explicitly (incremental, no-op when warm)
 */
function bootstrapTree(worktree) {
  if (!existsSync(join(worktree, 'node_modules', '.bin', 'tsx'))) {
    console.log(`[lanes] ${worktree} has no node_modules — running pnpm install (first time only, may take a while)`)
    const res = spawnSync('pnpm', ['install'], { cwd: worktree, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] })
    if (res.status !== 0) fail(`pnpm install failed in ${worktree}`)
  }
  const typertMarker = join(worktree, 'packages', 'api', 'workspace-controller', 'lib', 'typert.remote-client.js')
  if (!existsSync(typertMarker)) {
    console.log('[lanes] generating Typert artifacts (bundle-free pass, ~5s)')
    const res = spawnSync(process.execPath, ['node_modules/.bin/tsx', 'scripts/generate-typert.ts'], { cwd: worktree, stdio: ['ignore', 'inherit', 'inherit'] })
    if (res.status !== 0) fail(`generate-typert failed in ${worktree}`)
  }
  const cheezmilMarker = join(worktree, 'packages', 'aek', 'public', 'prevent-agent-directly-seeing-key', 'lib', 'index.js')
  if (!existsSync(cheezmilMarker)) {
    console.log("[lanes] building @cheezmil workspace packages (~30s)")
    const res = spawnSync('pnpm', ['--filter', '@cheezmil/**', 'build'], { cwd: worktree, stdio: ['ignore', 'inherit', 'inherit'] })
    if (res.status !== 0) fail(`@cheezmil filter build failed in ${worktree}`)
  }
  // Two-face members: root tsconfig.json with "files": [] next to a host face.
  const twoFace = spawnSync('find', ['packages', 'vendor', 'apps', '-name', 'tsconfig.host.json', '-not', '-path', '*/node_modules/*'], { cwd: worktree, encoding: 'utf8' })
  for (const rel of twoFace.stdout.trim().split('\n').filter(Boolean)) {
    const member = rel.slice(0, -'/tsconfig.host.json'.length)
    const rootTsc = join(worktree, member, 'tsconfig.json')
    if (!existsSync(rootTsc) || !/"files"\s*:\s*\[\s*\]/.test(readFileSync(rootTsc, 'utf8'))) continue
    if (existsSync(join(worktree, member, 'lib', 'types', 'index.js'))) continue // warm member
    console.log(`[lanes] emitting host face for two-face member ${member}`)
    const res = spawnSync(process.execPath, [join('node_modules', 'typescript', 'bin', 'tsc'), '-b', member + '/tsconfig.host.json'], { cwd: worktree, stdio: ['ignore', 'inherit', 'inherit'] })
    if (res.status !== 0) fail(`host-face build failed for ${member} in ${worktree}`)
  }
}

function laneOps(name, verb) {
  const entry = readLanesRegistry().lanes[name]
  if (!entry) fail(`lane "${name}" is not registered (run: lanes.mjs new ${name} --yes)`)
  const worktree = worktreeOf(name)
  if (!existsSync(join(worktree, 'scripts', 'aek', 'lanes.mjs'))) fail(`lane worktree missing its scripts: ${worktree}`)
  const cfg = laneConfig(name)
  preflightLanes(name, process.pid)
  claimLane(name, AGENT_ID, process.pid)
  if (verb === 'start') {
    bootstrapTree(worktree)
    console.log(`[lanes] ${name}: ${cfg.webPort}/${cfg.cdpPort} agent ${agentFor(name)} web ${cfg.webHost}`)
    runInTree(worktree, 'service.mjs', ['install', name, '--yes'])
    // m02603: backend only — the LaunchAgent (serve-slot, KeepAlive) owns the
    // web. The desktop shell is globally exclusive and is launched through
    // `lanes.mjs shell <name> --yes` instead.
    if (!waitForPort(cfg.webPort, 60_000)) {
      fail(`lane "${name}" web did not come up on ${cfg.webPort} within 60s (see ${join(laneHome(name), 'logs', 'web.log')})`)
    }
    console.log(`[lanes] ${name} backend up: web http://${cfg.webHost}:${cfg.webPort} (agent-managed); shell via: node scripts/aek/lanes.mjs shell ${name} --yes`)
  } else if (verb === 'stop') {
    // Bootout the agent FIRST: its KeepAlive would respawn a web the arbiter
    // is about to kill, so the supervisor has to go before the port does.
    const agent = spawnSync('launchctl', ['bootout', `gui/${String(process.getuid())}/${agentFor(name)}`], { stdio: 'ignore' })
    if (agent.status === 0) console.log(`[lanes] ${name}: agent ${agentFor(name)} booted out`)
    else console.log(`[lanes] ${name}: agent was not loaded (bootout skipped)`)
    runInTree(worktree, 'arbiter.mjs', ['stop', name])
    const lock = readSlotLock(name)
    if (lock?.shellPid && isPidAlive(lock.shellPid)) {
      process.kill(lock.shellPid, 'SIGTERM')
      console.log(`[lanes] ${name}: shell pid ${lock.shellPid} stopped`)
    }
    console.log(`[lanes] ${name} stopped (registry + claim kept; re-claim on next start)`)
  }
}

{
  const args = takeArgs('start')
  if (args !== null) {
    if (!CONFIRMED) fail(`"start" installs the lane's LaunchAgent + warms the tree (backend only, no shell). Re-run with --yes.`)
    if (!isLane(args[0])) fail(`lane "${args[0]}" is not registered (run: lanes.mjs new ${args[0]} --yes)`)
    laneOps(args[0], 'start')
    process.exit(0)
  }
  const sh = takeArgs('shell')
  if (sh !== null) {
    const name = sh[0]
    if (!CONFIRMED) fail(`"shell" terminates every OTHER dev-variant shell, then launches the "${name}" dev shell exclusively. Re-run with --yes.`)
    if (!isLane(name)) fail(`lane "${name}" is not registered (run: lanes.mjs new ${name} --yes)`)
    const entry = readLanesRegistry().lanes[name]
    if (!entry) fail(`lane "${name}" is not registered`)
    const worktree = worktreeOf(name)
    if (!existsSync(join(worktree, 'scripts', 'aek', 'lanes.mjs'))) fail(`lane worktree missing its scripts: ${worktree}`)
    const cfg = laneConfig(name)
    claimLane(name, AGENT_ID, process.pid)
    // The lane's web must be agent-managed and up; otherwise the shell would
    // boot into the reconnecting page and the exclusive-shell swap is pointless.
    if (!waitForPort(cfg.webPort, 1000)) {
      fail(`lane "${name}" web is not up on ${cfg.webPort} — run \`lanes.mjs start ${name} --yes\` first`)
    }
    const killed = killDevShells()
    preflightLanes(name, process.pid)
    runInTree(worktree, 'start-dev.mjs', [name, '--shell-only', '--detach'])
    if (!waitForPort(cfg.cdpPort, 20_000)) {
      fail(`CDP ${cfg.cdpPort} not listening 20s after launch (see ${join(laneHome(name), 'logs', 'shell.log')})`)
    }
    console.log(`[lanes] ${name} shell up: CDP http://127.0.0.1:${cfg.cdpPort} web http://${cfg.webHost}:${cfg.webPort}${killed.length ? ` (terminated ${killed.length} other dev shell(s))` : ''}`)
    process.exit(0)
  }
  const stop = takeArgs('stop')
  if (stop !== null) {
    if (!CONFIRMED) fail(`"stop" kills the lane's shell + web and boots out its agent. Re-run with --yes.`)
    if (!isLane(stop[0])) fail(`lane "${stop[0]}" is not registered`)
    laneOps(stop[0], 'stop')
    process.exit(0)
  }
}

// ---------------------------------------------------------------- remove

{
  const args = takeArgs('remove')
  if (args !== null) {
    if (!CONFIRMED) fail(`"remove" deletes the worktree and archives the data root. Re-run with --yes.`)
    const name = args[0]
    if (!isLane(name)) fail(`lane "${name}" is not registered`)
    const cfg = laneConfig(name) // read BEFORE the entry is released below
    laneOps(name, 'stop')
    const worktree = worktreeOf(name)
    const wt = spawnSync('git', ['-C', REPO_ROOT, 'worktree', 'remove', worktree, '--force'], { encoding: 'utf8' })
    if (wt.status !== 0) fail(`git worktree remove failed: ${(wt.stderr || wt.stdout).trim().slice(0, 300)}`)
    // Archive, never rm: the data root moves to the container's backups dir.
    const home = laneHome(name)
    const archive = join(resolveAekRoot(), 'backups', `lanes-${name}-${Date.now()}`)
    if (existsSync(home)) {
      mkdirSync(dirname(archive), { recursive: true })
      renameSync(home, archive)
      console.log(`[lanes] data root archived to ${archive}`)
    }
    releaseLane(name)
    console.log(`[lanes] ${name} removed. Agent discipline: cpuh unuse ${cfg.webPort} ${cfg.cdpPort}`)
    process.exit(0)
  }
}

usage()
process.exit(2)
