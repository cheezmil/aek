#!/usr/bin/env node
/**
 * shell-instances.mjs — enumerate every running AEK desktop shell and flag
 * duplicate instances per slot (W round, 2026-11-15).
 *
 * Incident: `open -a AEK` is ambiguous on this machine — LaunchServices has
 * MULTIPLE registered `AEK.app` bundles (the production install plus the
 * slot's dev-variant bundle under the slot data root), so it can launch a
 * dev-variant shell instead of the production one, leaving two shells for
 * the same slot's backend running side by side. This is the mechanical
 * check half of the "only one AEK.app instance" rule: run it BEFORE any
 * shell launch, and it is wired into `dev-cycle verify`.
 *
 * Usage:
 *   node scripts/aek/shell-instances.mjs            # read-only report, always exit 0
 *   node scripts/aek/shell-instances.mjs --check    # exit 1 on a whitelist / duplicate violation
 *   node scripts/aek/shell-instances.mjs --json     # machine-readable report
 *   node scripts/aek/shell-instances.mjs --stop [--slot aek] [--slot next]
 *                                                    # KILL the shell mains (SIGTERM→SIGKILL)
 *                                                    # and clear the affected slots' pid locks.
 *                                                    # No --slot = every AEK-family shell main.
 *
 * `--stop` is the mechanical half of the "launching a new instance must
 * terminate the old one" rule: it is what the launch scripts call BEFORE
 * spawning a fresh shell, so a leaked / duplicated shell can never survive a
 * launch. It kills by process table (ps), NOT by the slot lock — the lock only
 * names the LAST writer, so a clobbered duplicate would be invisible to a
 * lock-based stop.
 *
 * Safety conventions:
 *   - Read-only; it never signals or kills anything.
 *   - No hardcoded data-root paths: the slot dev-variant location comes from
 *     the slot manifest (`@cheezmil/coraek/slots`), the production install
 *     lives in the user's Applications dir, and lane dev-variant bundles live
 *     under each lane data root (`@cheezmil/coraek/lanes`). No machine-
 *     specific values in source.
 *   - ps-based, POSIX only; Windows is reported as skipped, not failed.
 *
 * The instance rule (m02603/m03270/m03363, FINAL): the only shell app names
 * that may run at all are the slots' dev app names (AEK + AEK Next), and at
 * most ONE main per name. AEK (production) and AEK Next (dev) may coexist —
 * that is the user's whitelist pair — but a second main of the SAME name
 * (two production installs, production + a lane dev bundle, …) or any other
 * AEK-family name is a violation. `--check` exits 1 on either.
 */
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { SLOTS, slotConfig, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { listLanes, laneConfig, laneHome } from '../../packages/aek/base/coraek/lanes.mjs'
import { clearSlotLock, isPidAlive } from '../../packages/aek/base/coraek/slot-lock.mjs'

const argv = process.argv.slice(2)
const CHECK = argv.includes('--check')
const JSON_OUT = argv.includes('--json')
const STOP = argv.includes('--stop')
// Per-slot kill filter: `--slot aek --slot next` (repeatable). Omit to sweep every
// detected AEK-family shell main.
const slotFilter = new Set()
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--slot' && argv[i + 1]) slotFilter.add(argv[i + 1])
}
const INSTALL_DIR = join(homedir(), 'Applications')

/**
 * Known AEK shell bundle locations per slot: the production install counts
 * as the same slot as its dev-variant bundle, so two mains of one slot are
 * a violation.
 * @returns {Array<{bundle:string, family:string, slot:string}>}
 */
function bundleMap() {
  const map = []
  for (const slot of Object.keys(SLOTS)) {
    const cfg = slotConfig(slot)
    map.push({
      bundle: join(INSTALL_DIR, `${cfg.productName}.app`),
      family: 'production',
      slot,
    })
    map.push({
      bundle: join(slotHome(slot), 'dev', `${cfg.devAppName}.app`),
      family: 'dev-variant',
      slot,
    })
  }
  // Lanes are dev-only (no production install): each registered lane has a
  // dev-variant bundle under its own data root.
  for (const name of listLanes()) {
    try {
      const cfg = laneConfig(name)
      map.push({
        bundle: join(laneHome(name), 'dev', `${cfg.devAppName}.app`),
        family: 'lane-dev',
        slot: name,
      })
    } catch { /* lane no longer registered */ }
  }
  return map
}

/** The main executable name of a bundle is its bundle base name. */
function mainNameOf(entry) {
  return entry.bundle.split('/').slice(-1)[0].replace(/\.app$/, '')
}

/**
 * The m03363 whitelist: the only shell app names that may run at all are the
 * slots' dev app names (AEK + AEK Next). Derived from the slot manifest, so
 * a slot rename/extension keeps the whitelist in lockstep with the product.
 * @returns {Set<string>}
 */
function allowedAppNames() {
  return new Set(Object.values(SLOTS).map((cfg) => cfg.devAppName))
}

/**
 * App name carried by an unknown (external) AEK-family main executable. The
 * name is the `.app` bundle base (darwin) or `.exe` base (win), e.g. "AEK"
 * or "AEK Next"; anything else is a foreign AEK-family name.
 * @param {string} exe0 the first token of the shell main's command line
 * @returns {string}
 */
function externalNameOf(exe0) {
  const darwin = exe0.match(/([A-Za-z0-9 ]+\.app)\//)
  if (darwin) return darwin[1].replace(/\.app$/, '')
  const base = exe0.split(/[\\/]/).pop() ?? exe0
  const winRe = base.match(/AEK( [A-Za-z0-9]+)?\.exe$/i)
  if (winRe) return `AEK${winRe[1] ?? ''}`
  return base
}

/** Base app name of a bundle path (strips a .app / .exe extension). */
function appNameOf(bundle) {
  return bundle.split('/').slice(-1)[0].replace(/\.(app|exe)$/i, '')
}

/**
 * @returns {Array<{pid:number, exe:string, app:string, family:string, slot:string}>|null}
 *  null when the platform cannot be scanned (Windows / no ps).
 */
function scan() {
  if (process.platform === 'win32') return null
  let out
  try {
    out = execFileSync('ps', ['-Ao', 'pid=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
  const map = bundleMap()
  const found = []
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (!m) continue
    const pid = Number(m[1])
    const command = m[2]
    // Helper processes never count: they are named "... Helper" on macOS
    // and carry --type= flags on Windows.
    if (process.platform === 'darwin') {
      if (command.includes('Helper')) continue
      const exe0 = command.trimStart().split(/\s+/)[0]
      // The main executable path of a known bundle is deterministic; match
      // it whole so names with spaces ("AEK Next") stay intact.
      const known = map.find((entry) => {
        const mainExe = `${entry.bundle}/Contents/MacOS/${mainNameOf(entry)}`
        return command === mainExe || command.startsWith(`${mainExe} `)
      })
      if (!known) {
        // Unknown AEK-family bundle: still report it (as external), but only
        // when the FIRST token (the executable path) is a shell main. Wrapper
        // lines (bash -c '… AEK.app/Contents/MacOS/AEK …') contain the path
        // mid-command and must NOT count (m03363 false-positive fix).
        if (!/AEK( [A-Za-z0-9]+)?\.app\/Contents\/MacOS\/AEK( [A-Za-z0-9]+)?$/.test(exe0)) continue
      }
      found.push({
        pid,
        exe: known ? `${known.bundle}/Contents/MacOS/${mainNameOf(known)}` : command.trim(),
        app: known ? mainNameOf(known) : externalNameOf(exe0),
        family: known?.family ?? 'external',
        slot: known?.slot ?? 'unknown',
      })
    } else {
      if (command.includes('--type=')) continue
      // First token only: wrapper command lines that merely MENTION an AEK
      // .exe path are not shell mains (m03363 false-positive fix).
      const exe0 = command.trimStart().split(/\s+/)[0]
      if (!/AEK( [A-Za-z0-9]+)?\.exe$/i.test(exe0)) continue
      const known = map.find((entry) => command.includes(entry.bundle))
      found.push({
        pid,
        exe: command.trim().split(' ')[0],
        app: known ? appNameOf(known.bundle) : externalNameOf(exe0),
        family: known?.family ?? 'external',
        slot: known?.slot ?? 'unknown',
      })
    }
  }
  return found
}

/**
 * Kill shell mains (all, or those of the given slot filter) and release their
 * slot pid locks. This is the "terminate the old instance before launching a
 * new one" primitive the launch scripts rely on.
 *
 *   - SIGTERM every target pid, bounded wait, escalate survivors to SIGKILL.
 *   - After the process table is clean, clear each affected slot's lock so a
 *     dead shellPid can never read as "the slot is held".
 *
 * Targets are the instances already scanned (ps-based) — a pid the slot lock
 * no longer names (a clobbered duplicate) is still killed here. The lock-based
 * stop in `shared-logic.mjs` would miss exactly those.
 * @param {Array<{pid:number, slot:string, app:string, family:string}>} instances
 * @returns {number} exit code (0 clean, 1 when a pid refused to die).
 */
function stopInstances(instances) {
  const targets = slotFilter.size > 0
    ? instances.filter(i => slotFilter.has(i.slot))
    : instances
  if (targets.length === 0) {
    console.log(`[stop] no ${slotFilter.size > 0 ? [...slotFilter].join('/') : 'AEK'} shell instance(s) to stop`)
    return 0
  }
  const pids = [...new Set(targets.map(i => i.pid))]
  const slotsTouched = [...new Set(targets.map(i => i.slot).filter(s => s !== 'unknown'))]
  console.log(`[stop] SIGTERM ${pids.join(' ')} (${targets.length} instance(s): ` +
    targets.map(i => `${i.app}#${i.slot}=${i.pid}`).join(', ') + ')')
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
  // Bounded wait for graceful exit, then escalate the survivors.
  const deadline = Date.now() + 3000
  const alive = () => pids.filter(isPidAlive)
  while (Date.now() < deadline && alive().length > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }
  const stuck = alive()
  if (stuck.length > 0) {
    console.log(`[stop] ${stuck.join(' ')} survived SIGTERM → SIGKILL`)
    for (const pid of stuck) {
      try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
    }
    const deadline2 = Date.now() + 2000
    while (Date.now() < deadline2 && stuck.some(isPidAlive)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
  }
  const still = pids.filter(isPidAlive)
  // Release the locks of the slots we actually touched.
  for (const slot of slotsTouched) {
    try { clearSlotLock(slot) } catch { /* slot lock may not exist yet */ }
  }
  if (still.length > 0) {
    console.error(`[stop] PIDS REFUSED TO DIE: ${still.join(' ')}`)
    return 1
  }
  console.log(`[stop] all targeted shell instances terminated; locks cleared for ${slotsTouched.length > 0 ? slotsTouched.join(', ') : '(none)'}`)
  return 0
}

function main() {
  const instances = scan()
  if (instances === null) {
    console.log('shell-instances: this platform cannot be scanned (ps-based, POSIX); skipped.')
    return 0
  }

  if (STOP) {
    return stopInstances(instances)
  }

  const bySlot = new Map()
  for (const inst of instances) {
    bySlot.set(inst.slot, [...(bySlot.get(inst.slot) ?? []), inst])
  }
  const duplicates = [...bySlot.values()].filter((list) => list.length > 1)

  if (JSON_OUT) {
    const byName = new Map()
    for (const inst of instances) byName.set(inst.app, [...(byName.get(inst.app) ?? []), inst])
    console.log(JSON.stringify({
      instances,
      duplicates: duplicates.map((d) => d.map((i) => i.pid)),
      byName: Object.fromEntries([...byName].map(([name, list]) => [name, list.map((i) => i.pid)])),
    }, null, 2))
  } else {
    console.log(`AEK shell instances: ${instances.length}`)
    for (const inst of instances) {
      console.log(`  pid=${inst.pid} ${inst.family} (${inst.slot} slot) "${inst.app}" ${inst.exe}`)
    }
    if (instances.length === 0) console.log('  (none running)')
  }

  if (CHECK) {
    // m03363 rule: at most ONE shell main per app name, and only the whitelist
    // of slot dev app names (AEK + AEK Next) may run at all. Two DIFFERENT
    // names (AEK + AEK Next) may coexist; a second main of the SAME name, or
    // any other AEK-family name, is a violation.
    const byName = new Map()
    for (const inst of instances) byName.set(inst.app, [...(byName.get(inst.app) ?? []), inst])
    const allowed = allowedAppNames()
    let bad = false
    for (const [name, list] of byName) {
      if (list.length > 1) {
        console.error(
          `  DUPLICATE: "${name}" has ${String(list.length)} shell mains (${list.map((i) => i.pid).join(', ')}) — at most one per app name. Kill all but one.`,
        )
        bad = true
      }
      if (!allowed.has(name)) {
        console.error(
          `  FORBIDDEN NAME: "${name}" (${list.map((i) => i.pid).join(', ')}) is not on the AEK shell whitelist (${[...allowed].join(' / ')}) — only these app names may run (m03363).`,
        )
        bad = true
      }
    }
    if (bad) return 1
    console.log(`check: at most one shell main per app name; whitelist = ${[...allowed].join(' / ')} (m03363) — OK`)
  }
  return 0
}

process.exitCode = main()
