#!/usr/bin/env node
/**
 * AEK runtime arbiter — the host-side "arbiter interface" T11's frontend
 * switcher talks to.
 *
 * It owns the whole-instance lifecycle per slot (web server + Electron shell),
 * keyed by the data root so AEK and AEK Next can coexist while each stays
 * single-instance. The aek-home console calls this through
 * `@cheezmil/aek-websearch/admin`'s `/api/aek/runtime` route.
 *
 * Commands:
 *   node arbiter.mjs status                       → JSON: current slot + both slots' liveness + derived mode
 *   node arbiter.mjs start <slot>                  → start web + shell for a slot (detached), write a pid lock
 *   node arbiter.mjs stop  <slot>                  → SIGTERM the slot (pid lock + port fallback), clear lock
 *   node arbiter.mjs mode  <only-aek|only-next|both>→ orchestrate (CLI convenience; the API does its own orchestration)
 *
 * SAFETY: with no recognised command it prints usage and exits 2. `stop` is the
 * only state change; `start` refuses to double-launch a slot that is already
 * reported running. Nothing deletes user data.
 *
 * @module scripts/aek/arbiter
 */
import { spawnSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SLOTS,
  slotHome,
  spawnWebServerForSlot,
  launchShellForSlot,
  killSlot,
  DSH_HOME,
} from './shared-logic.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Usage string. */
const USAGE = `AEK runtime arbiter — per-slot instance lifecycle.

  node scripts/aek/arbiter.mjs status
  node scripts/aek/arbiter.mjs start <aek|next>
  node scripts/aek/arbiter.mjs stop  <aek|next>
  node scripts/aek/arbiter.mjs mode  <only-aek|only-next|both>`

/** @param slot - candidate slot name. @returns true when it is a known slot. */
function isSlot(slot) { return slot === 'aek' || slot === 'next' }

/** @param slot - candidate mode name. @returns true when it is a known mode. */
function isMode(mode) { return mode === 'only-aek' || mode === 'only-next' || mode === 'both' }

/** @param slot - slot name. @returns the pid-lock path inside that slot's home. */
function pidFile(slot) { return join(slotHome(slot), '.aek-runtime.pid') }

/** @param slot - slot name. @returns the parsed lock, or null. */
function readPid(slot) {
  try { return JSON.parse(readFileSync(pidFile(slot), 'utf8')) }
  catch { return null }
}

/** @param slot - slot name. @param data - lock payload. */
function writePid(slot, data) { writeFileSync(pidFile(slot), JSON.stringify(data), 'utf8') }

/** @param slot - slot name. Clear the lock file. */
function clearPid(slot) { try { rmSync(pidFile(slot)) } catch { /* absent */ } }

/** @param pid - a PID. @returns true when the process is alive. */
function isAlive(pid) {
  if (!pid || typeof pid !== 'number') return false
  try { process.kill(pid, 0); return true } catch { return false }
}

/**
 * Probe whether a web port answers. The dsh web server returns 200 on its root.
 * @param port - the web port to probe.
 * @returns true when something answers on that port.
 */
function probe(port) {
  const res = spawnSync('curl', ['-s', '-o', '/dev/null', '-m', '1', `http://127.0.0.1:${port}`], { stdio: 'ignore' })
  return res.status === 0
}

/** @returns the slot identity of the process that launched this arbiter. */
function currentSlot() {
  const home = process.env.AEK_HOME || DSH_HOME
  return home.endsWith('-next') ? 'next' : 'aek'
}

/**
 * Build the status payload: current slot + per-slot liveness + derived mode.
 * @returns the serialisable status object.
 */
function buildStatus() {
  const slots = {}
  for (const slot of ['aek', 'next']) {
    slots[slot] = { webPort: SLOTS[slot].webPort, running: probe(SLOTS[slot].webPort) }
  }
  let mode = 'none'
  if (slots.aek.running && slots.next.running) mode = 'both'
  else if (slots.aek.running) mode = 'only-aek'
  else if (slots.next.running) mode = 'only-next'
  return { current: { slot: currentSlot(), home: process.env.AEK_HOME || DSH_HOME }, slots, mode }
}

/**
 * Start a slot: web server + Electron shell, both detached, recording their
 * PIDs in the slot's pid lock. Refuses to start a slot already reported running.
 * @param slot - 'aek' | 'next'.
 * @returns the result payload.
 */
function cmdStart(slot) {
  if (!isSlot(slot)) return { ok: false, error: `unknown slot "${slot}"` }
  if (probe(SLOTS[slot].webPort)) return { ok: false, error: `slot "${slot}" already running`, slot }
  const web = spawnWebServerForSlot(slot, { detached: true })
  const shell = launchShellForSlot(slot)
  writePid(slot, { webPid: web.pid, shellPid: shell?.pid ?? null, startedAt: Date.now() })
  return { ok: true, slot, webPid: web.pid, shellPid: shell?.pid ?? null }
}

/**
 * Stop a slot: SIGTERM the recorded PIDs, then a port-based kill as a fallback
 * for the actual listening web server, and clear the lock.
 * @param slot - 'aek' | 'next'.
 * @returns the result payload.
 */
function cmdStop(slot) {
  if (!isSlot(slot)) return { ok: false, error: `unknown slot "${slot}"` }
  const lock = readPid(slot)
  for (const pid of [lock?.webPid, lock?.shellPid]) {
    if (isAlive(pid)) { try { process.kill(pid, 'SIGTERM') } catch { /* gone */ } }
  }
  void killSlot(slot)
  clearPid(slot)
  return { ok: true, slot, stoppedPids: [lock?.webPid, lock?.shellPid].filter(Boolean) }
}

/**
 * Orchestrate a mode (CLI convenience). The API route does its own
 * orchestration so it can defer the self-stop past the HTTP response.
 * @param mode - target mode.
 * @returns the result payload.
 */
function cmdMode(mode) {
  if (!isMode(mode)) return { ok: false, error: `unknown mode "${mode}"` }
  const want = mode === 'both' ? ['aek', 'next'] : [mode === 'only-aek' ? 'aek' : 'next']
  const unwanted = mode === 'both' ? [] : (mode === 'only-aek' ? ['next'] : ['aek'])
  const started = []
  const stopped = []
  for (const s of want) if (!probe(SLOTS[s].webPort)) { cmdStart(s); started.push(s) }
  for (const s of unwanted) if (probe(SLOTS[s].webPort)) { cmdStop(s); stopped.push(s) }
  return { ok: true, mode, started, stopped }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
const [command, arg] = process.argv.slice(2)
let out
switch (command) {
  case 'status': out = buildStatus(); break
  case 'start': out = cmdStart(arg); break
  case 'stop': out = cmdStop(arg); break
  case 'mode': out = cmdMode(arg); break
  default:
    console.error(USAGE)
    process.exit(2)
}
console.log(JSON.stringify(out))
process.exit(0)
