#!/usr/bin/env node
/**
 * Long-lived backend supervisor for one slot.
 *
 * The packaged AEK window is a pure client: it loads `http://127.0.0.1:<port>`
 * and shows the "Reconnecting…" page while nothing answers there. So a
 * double-click in Spotlight / Finder (`open -a AEK.app`) only works while the
 * slot's web server happens to be running. This supervisor is what keeps it
 * running: `service.mjs` installs it as a per-user LaunchAgent, launchd keeps it
 * alive, and the app therefore always has a backend to talk to.
 *
 * It never fights over the port: if the slot's own server is already up (a
 * `desktop.mjs` / `start-release` session, the arbiter, a manual
 * `launch.mjs web`), it just waits. When the holder is NOT this
 * supervisor's own child, it says so loudly once (pid + command line + the
 * kill path) — a foreign holder may be missing the launcher flags this
 * supervisor would pass (e.g. `--trusted-host`), which degrades the backend
 * silently. Only when the port is free does it start a
 * server itself.
 *
 * Default (no arguments) is a READ-ONLY check that prints the state and exits —
 * it starts nothing. `--serve` is the long-lived mode used by the LaunchAgent.
 *
 * Usage:
 *   node scripts/aek/serve-slot.mjs                 # status (read-only)
 *   node scripts/aek/serve-slot.mjs --slot next     # status for the next slot
 *   node scripts/aek/serve-slot.mjs --serve         # supervise until SIGTERM
 */
import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { SLOTS, slotConfig, slotWebUp, slotHome, listenPids } from './shared-logic.mjs'

const POLL_MS = 15_000
const RESTART_MS = 3_000

const rest = process.argv.slice(2)
const slotIndex = rest.indexOf('--slot')
const slot = slotIndex === -1 ? 'aek' : (rest[slotIndex + 1] ?? 'aek')
const serve = rest.includes('--serve')

if (!SLOTS[slot]) {
  console.error(`unknown slot: ${slot} — expected one of ${Object.keys(SLOTS).join(', ')}`)
  process.exit(2)
}

const cfg = slotConfig(slot)

if (!serve) {
  console.log(`[serve] slot ${slot} (${cfg.productName})  home ${slotHome(slot)}  port ${cfg.webPort}`)
  console.log(`[serve] backend ${slotWebUp(slot) ? 'UP' : 'down'} — read-only check, nothing started`)
  console.log('[serve] --serve runs the supervisor (the LaunchAgent does this at login)')
  process.exit(0)
}

/**
 * Describe the process holding a port (pid + command line), for the loud
 * foreign-holder warning. Never throws: the supervisor must not die on a
 * flaky `ps`.
 * @param pids - pids from `listenPids`.
 * @returns a short human-readable line, or '' when nothing is describable.
 */
function holderDescription(pids) {
  const parts = []
  for (const pid of pids) {
    let detail = ''
    try {
      detail = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 }).trim()
    } catch { /* ps failed (race: the holder died between check and ps) */ }
    parts.push(`pid ${String(pid)}${detail ? ' — ' + detail.slice(0, 200) : ' (command unknown)'}`)
  }
  return parts.join('; ')
}

let stopping = false
let timer = null
let child = null
let foreignHoldersReported = false

/**
 * Wait, but let a signal cut the wait short.
 * @param ms - milliseconds to wait.
 * @returns {Promise<void>} resolves after the wait.
 */
function sleep(ms) {
  return new Promise((resolve) => { timer = setTimeout(resolve, ms) })
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    stopping = true
    console.log(`[serve] ${signal} — stopping`)
    clearTimeout(timer)
    child?.kill('SIGTERM')
  })
}

while (!stopping) {
  if (slotWebUp(slot)) {
    if (child !== null) {
      // Our own child is up — the quiet, expected case.
      foreignHoldersReported = false
      console.log(`[serve] ${slot} web up on ${cfg.webPort} (our pid ${String(child.pid)}) — waiting`)
    } else if (!foreignHoldersReported) {
      // Someone ELSE answers on the slot port: a stuck dev-era boot, a manual
      // session, or an orphaned launcher. Waiting on that is silent data loss:
      // the holder may lack the launcher flags this supervisor would pass
      // (e.g. --trusted-host), which degrades the backend without any error.
      // Report it once, loudly, with the kill path; keep waiting afterwards.
      const holders = listenPids(cfg.webPort)
      console.warn(`[serve] WARNING: ${cfg.webPort} is held by a process that is not this supervisor's child: ${holderDescription(holders) || '(holder gone)'}`)
      console.warn(`[serve] The slot backend may be degraded (missing launcher flags such as --trusted-host). To hand the port back to the supervisor: kill ${holders.map(String).join(' ')} (or reload the slot's LaunchAgent). The supervisor keeps waiting until the port is free.`)
      foreignHoldersReported = true
    }
    await sleep(POLL_MS)
    continue
  }

  foreignHoldersReported = false
  // The port is taken but not answering (a foreign app, or a stuck socket). Do
  // NOT start a server that can only fail: wait until the port is really free.
  if (listenPids(cfg.webPort).length > 0) {
    console.log(`[serve] ${cfg.webPort} is held by another process — waiting`)
    await sleep(POLL_MS)
    continue
  }

  console.log(`[serve] starting ${slot} web on ${cfg.webPort}`)
  const launcher = new URL('./launch.mjs', import.meta.url).pathname
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  child = spawn(process.execPath, [launcher, '--slot', slot, 'web', '--no-open'], { stdio: 'inherit', env })

  const code = await new Promise((resolve) => {
    child.on('exit', (c) => { resolve(c) })
    child.on('error', (err) => {
      console.error(`[serve] spawn failed: ${err.message}`)
      resolve(1)
    })
  })
  child = null
  if (stopping) break
  console.log(`[serve] web exited (${String(code)}) — restarting in ${String(RESTART_MS)}ms`)
  await sleep(RESTART_MS)
}
