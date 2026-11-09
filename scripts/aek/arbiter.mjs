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
 *   node arbiter.mjs start <slot> [--headless]     → start web + shell for a slot (detached), write a pid lock
 *                                                      (--headless: no window, no Dock icon)
 *   node arbiter.mjs stop  <slot>                  → SIGTERM the slot (pid lock + port fallback), clear lock
 *   node arbiter.mjs mode  <only-aek|only-next|both>→ orchestrate (CLI convenience; the API does its own orchestration)
 *
 * SAFETY: with no recognised command it prints usage and exits 2. `stop` is the
 * only state change; `start` refuses to double-launch a slot that is already
 * reported running. Nothing deletes user data.
 *
 * @module scripts/aek/arbiter
 */
import { spawnSync, spawn, execFileSync } from 'node:child_process'
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
  slotWebUp,
  slotShellUp,
  slotShellPids,
  slotShellKind,
  slotProcesses,
} from './shared-logic.mjs'
import {
  writeSlotLock,
  clearSlotLock,
  isPidAlive,
} from '../../packages/aek/base/coraek/slot-lock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Usage string. */
const USAGE = `AEK runtime arbiter — per-slot instance lifecycle.

  node scripts/aek/arbiter.mjs status
  node scripts/aek/arbiter.mjs start <aek|next>
  node scripts/aek/arbiter.mjs stop  <aek|next>
  node scripts/aek/arbiter.mjs mode  <only-aek|only-next|both>
  node scripts/aek/arbiter.mjs start-half   <aek|next> <web|shell>
  node scripts/aek/arbiter.mjs stop-half    <aek|next> <web|shell>
  node scripts/aek/arbiter.mjs restart-half <aek|next> <web|shell>`

/** @param slot - candidate slot name. @returns true when it is a known slot. */
function isSlot(slot) { return slot === 'aek' || slot === 'next' }

/** @param slot - candidate mode name. @returns true when it is a known mode. */
function isMode(mode) { return mode === 'only-aek' || mode === 'only-next' || mode === 'both' }

// The pid lock is DEFINED in @cheezmil/coraek/slot-lock and shared with the
// Electron shell. The two used to disagree on the format (the shell wrote a
// bare pid, this wrote JSON), so the shell could not see the arbiter's lock
// and the arbiter could not see the shell's — a second shell would start and
// the arbiter would forget the shell it had launched.
//
// Reading/verifying pids lives in shared-logic's `killSlot`/`slotOwnedPids`:
// a lock entry is only honoured after its command line is re-checked, so a
// recycled pid can never be killed by mistake.
const writePid = writeSlotLock
const clearPid = clearSlotLock

// The liveness probe is defined once in shared-logic (`slotWebUp`): the port
// must be served by THIS slot's own runtime, not by an unrelated program that
// happens to hold the port.
const probe = slotWebUp

/** @returns the slot identity of the process that launched this arbiter. */
function currentSlot() {
  const home = process.env.AEK_HOME || DSH_HOME
  return home.endsWith('-next') ? 'next' : 'aek'
}

/**
 * A slot is "running" when EITHER half is alive (C6): the web server, or the
 * Electron shell. Reporting the web server alone made the switcher disagree
 * with what the user actually sees in the Dock.
 * @param slot - 'aek' | 'next'.
 * @returns {boolean} true when any part of the slot is alive.
 */
function slotRunning(slot) {
  return probe(slot) || slotShellUp(slot)
}

/**
 * Build the status payload: current slot + per-slot liveness + derived mode.
 * @returns the serialisable status object.
 */
function buildStatus() {
  // C6: when the arbiter runs INSIDE a host (AEK_PROBE_NO_HTTP is set by the
  // admin route), no HTTP probe may run at all — see the note below.
  const inHost = process.env.AEK_PROBE_NO_HTTP === '1'
  const slots = {}
  for (const slot of ['aek', 'next']) {
    // Inside a host, NOTHING may be probed over HTTP — not just the caller's
    // own slot. Both hosts spawn this arbiter synchronously, so probing the
    // sibling port blocks on the sibling's (blocked) event loop and the two
    // deadlock until curl times out, which the console then reports as
    // "未运行". Listener ownership (data root + `--port N`) is what decides
    // liveness here; the body check only matters for CLI callers.
    const web = probe(slot, { allowHttp: !inHost })
    const shell = slotShellUp(slot)
    slots[slot] = {
      webPort: SLOTS[slot].webPort,
      web,
      shell,
      // Which build the window belongs to. Without it the console cannot say
      // whether "运行中" means the packaged app or a shell spawned from the repo.
      shellKind: shell ? slotShellKind(slot) : null,
      running: web || shell,
    }
  }
  let mode = 'none'
  if (slots.aek.running && slots.next.running) mode = 'both'
  else if (slots.aek.running) mode = 'only-aek'
  else if (slots.next.running) mode = 'only-next'
  return { current: { slot: currentSlot(), home: process.env.AEK_HOME || DSH_HOME }, slots, mode }
}

/**
 * Start a slot: web server + Electron shell, both detached, recording their
 * PIDs in the slot's pid lock.
 *
 * SAFETY (per-slot isolation): refuses to run when the slot is already up, and
 * clears only THIS slot's leftovers first — never a blanket port kill. A
 * foreign program holding one of the slot's ports is reported as a conflict
 * and left untouched; the start is aborted instead of stealing its port.
 * @param slot - 'aek' | 'next'.
 * @returns {Promise<object>} the result payload.
 */
async function cmdStart(slot, options = {}) {
  if (!isSlot(slot)) return { ok: false, error: `unknown slot "${slot}"` }
  // Only the WEB half refuses to double-launch: a second web server on the same
  // port is the real error. A shell that is already open must NOT block a
  // backend (re)start — the user's window stays up and gets reconnected (C6).
  if (probe(slot)) return { ok: false, error: `web server for slot "${slot}" already running`, slot }
  const keepShell = slotShellUp(slot)
  // Same-slot leftovers only (half-dead web server, orphaned shell). When a
  // live shell is present it is kept out of the kill set so the restart never
  // takes the user's window down with the backend.
  const cleared = await killSlot(slot, { keepShell })
  if (cleared.foreign.length > 0) {
    return {
      ok: false,
      slot,
      error: `port conflict: ${cleared.foreign.map(f => `${f.kind} :${f.port} held by pid ${f.pid}`).join(', ')}`,
      foreign: cleared.foreign,
    }
  }
  if (cleared.stuck.length > 0) {
    return { ok: false, slot, error: `previous instance did not exit: ${cleared.stuck.join(' ')}` }
  }
  const web = spawnWebServerForSlot(slot, { detached: true })
  // `headless` runs the shell WITHOUT a window: the slot is kept warm (or
  // verified) without a second Dock icon on macOS.
  const shell = keepShell ? null : launchShellForSlot(slot, { headless: Boolean(options.headless) })
  // Only the web pid is recorded here. The shell records its OWN pid in the
  // same file (the shared lock merges the fields), so writing a guessed
  // shellPid here would race with the shell's own write.
  writePid(slot, { webPid: web.pid, startedAt: Date.now() })
  return {
    ok: true,
    slot,
    webPid: web.pid,
    shellPid: keepShell ? null : (shell?.pid ?? null),
    ...(keepShell ? { shellAlreadyRunning: true } : {}),
    clearedPids: cleared.killed,
  }
}

/**
 * Stop a slot: terminate only the processes that belong to it (recorded pids
 * re-verified against their command line, plus slot-marked port holders), then
 * clear the lock.
 * @param slot - 'aek' | 'next'.
 * @returns {Promise<object>} the result payload.
 */
async function cmdStop(slot) {
  if (!isSlot(slot)) return { ok: false, error: `unknown slot "${slot}"` }
  const result = await killSlot(slot)
  clearPid(slot)
  return { ...result, stoppedPids: result.killed }
}

/**
 * Start ONE half of a slot without disturbing the other half.
 *
 * The console's instance manager lets the user pick the backend service and
 * the desktop window independently (2026-11-09 round). A window needs a live
 * backend to load, so `shell` refuses to start while the web half is down;
 * a web half can be started (or restarted) while the window stays open —
 * `watchBackend()` in the shell then reconnects automatically.
 * @param slot - 'aek' | 'next'.
 * @param half - 'web' | 'shell'.
 * @returns {Promise<object>} the result payload.
 */
async function cmdStartHalf(slot, half) {
  if (!isSlot(slot)) return { ok: false, error: `unknown slot "${slot}"` }
  if (half !== 'web' && half !== 'shell') return { ok: false, error: `unknown half "${half}"` }
  if (half === 'web') {
    if (probe(slot)) return { ok: false, slot, half, error: `web server for slot "${slot}" already running` }
    const foreign = slotProcesses(slot).foreign.filter(p => p.port === SLOTS[slot].webPort)
    if (foreign.length > 0) {
      return { ok: false, slot, half, error: `port conflict: ${foreign.map(f => `:${f.port} held by pid ${f.pid}`).join(', ')}`, foreign }
    }
    const web = spawnWebServerForSlot(slot, { detached: true })
    writePid(slot, { webPid: web.pid })
    return { ok: true, slot, half, webPid: web.pid }
  }
  if (slotShellUp(slot)) return { ok: false, slot, half, error: `shell for slot "${slot}" already running` }
  if (!probe(slot)) return { ok: false, slot, half, error: 'start the backend service before the desktop window' }
  const shell = launchShellForSlot(slot, { headless: false })
  return { ok: true, slot, half, shellPid: shell?.pid ?? null }
}

/**
 * Stop ONE half of a slot, leaving the other half alive.
 *
 * - `web`: reuse `killSlot(..., { keepShell: true })` so a running window is
 *   explicitly excluded from the kill set, then forget the recorded web pid.
 * - `shell`: SIGTERM only the pids that belong to the shell, wait a bounded
 *   time, and forget the recorded shell pid. The web server keeps serving.
 * @param slot - 'aek' | 'next'.
 * @param half - 'web' | 'shell'.
 * @returns {Promise<object>} the result payload.
 */
async function cmdStopHalf(slot, half) {
  if (!isSlot(slot)) return { ok: false, error: `unknown slot "${slot}"` }
  if (half !== 'web' && half !== 'shell') return { ok: false, error: `unknown half "${half}"` }
  if (half === 'web') {
    const result = await killSlot(slot, { keepShell: true })
    writePid(slot, { webPid: null })
    return { ok: result.ok, slot, half, stoppedPids: result.killed, stuck: result.stuck, foreign: result.foreign }
  }
  const pids = slotShellPids(slot)
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
  const deadline = Date.now() + 3000
  while (Date.now() < deadline && pids.some(isPidAlive)) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const stuck = pids.filter(isPidAlive)
  writePid(slot, { shellPid: null })
  return { ok: stuck.length === 0, slot, half, stoppedPids: pids, stuck }
}

/**
 * Restart one half: stop it, then start it again.
 * @param slot - 'aek' | 'next'.
 * @param half - 'web' | 'shell'.
 * @returns {Promise<object>} the result payload.
 */
async function cmdRestartHalf(slot, half) {
  const stopped = await cmdStopHalf(slot, half)
  if (stopped.ok === false && stopped.stuck?.length > 0) return { ok: false, slot, half, ...stopped }
  const started = await cmdStartHalf(slot, half)
  return { ok: started.ok === true, slot, half, stopped, started }
}

/**
 * Orchestrate a mode (CLI convenience). The API route does its own
 * orchestration so it can defer the self-stop past the HTTP response.
 * @param mode - target mode.
 * @returns the result payload.
 */
async function cmdMode(mode) {
  if (!isMode(mode)) return { ok: false, error: `unknown mode "${mode}"` }
  const want = mode === 'both' ? ['aek', 'next'] : [mode === 'only-aek' ? 'aek' : 'next']
  const unwanted = mode === 'both' ? [] : (mode === 'only-aek' ? ['next'] : ['aek'])
  const started = []
  const stopped = []
  const errors = []
  // Start a slot when its BACKEND is down — `cmdStart` itself keeps a live
  // shell and only (re)starts the web. Stop a slot when ANY half is alive.
  for (const s of want) if (!probe(s)) { const r = await cmdStart(s); if (r.ok) started.push(s); else errors.push(r) }
  for (const s of unwanted) if (slotRunning(s)) { await cmdStop(s); stopped.push(s) }
  return { ok: errors.length === 0, mode, started, stopped, ...(errors.length ? { errors } : {}) }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const command = argv[0]
// The first POSITIONAL argument after the command (flags may come before or
// after it). `start next --headless` and `start --headless next` both work.
const positional = argv.slice(1).filter(a => !a.startsWith('--'))
const arg = positional[0]
const half = positional[1]
const headless = argv.includes('--headless')
let out
switch (command) {
  case 'status': out = buildStatus(); break
  case 'start': out = await cmdStart(arg, { headless }); break
  case 'stop': out = await cmdStop(arg); break
  case 'mode': out = await cmdMode(arg); break
  case 'start-half': out = await cmdStartHalf(arg, half); break
  case 'stop-half': out = await cmdStopHalf(arg, half); break
  case 'restart-half': out = await cmdRestartHalf(arg, half); break
  default:
    console.error(USAGE)
    process.exit(2)
}
console.log(JSON.stringify(out))
process.exit(0)
