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
} from './shared-logic.mjs'
import {
  readSlotLock,
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
  node scripts/aek/arbiter.mjs mode  <only-aek|only-next|both>`

/** @param slot - candidate slot name. @returns true when it is a known slot. */
function isSlot(slot) { return slot === 'aek' || slot === 'next' }

/** @param slot - candidate mode name. @returns true when it is a known mode. */
function isMode(mode) { return mode === 'only-aek' || mode === 'only-next' || mode === 'both' }

// The pid lock is DEFINED in @cheezmil/coraek/slot-lock and shared with the
// Electron shell. The two used to disagree on the format (the shell wrote a
// bare pid, this wrote JSON), so the shell could not see the arbiter's lock
// and the arbiter could not see the shell's — a second shell would start and
// the arbiter would forget the shell it had launched.
const readPid = readSlotLock
const writePid = writeSlotLock
const clearPid = clearSlotLock
const isAlive = isPidAlive

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
 * Build the status payload: current slot + per-slot liveness + derived mode.
 * @returns the serialisable status object.
 */
function buildStatus() {
  const slots = {}
  for (const slot of ['aek', 'next']) {
    slots[slot] = { webPort: SLOTS[slot].webPort, running: probe(slot) }
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
function cmdStart(slot, options = {}) {
  if (!isSlot(slot)) return { ok: false, error: `unknown slot "${slot}"` }
  if (probe(slot)) return { ok: false, error: `slot "${slot}" already running`, slot }
  const web = spawnWebServerForSlot(slot, { detached: true })
  // `headless` runs the shell WITHOUT a window: the slot is kept warm (or
  // verified) without a second Dock icon on macOS.
  const shell = launchShellForSlot(slot, { headless: Boolean(options.headless) })
  // Only the web pid is recorded here. The shell records its OWN pid in the
  // same file (the shared lock merges the fields), so writing a guessed
  // shellPid here would race with the shell's own write.
  writePid(slot, { webPid: web.pid, startedAt: Date.now() })
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
  for (const s of want) if (!probe(s)) { cmdStart(s); started.push(s) }
  for (const s of unwanted) if (probe(s)) { cmdStop(s); stopped.push(s) }
  return { ok: true, mode, started, stopped }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const command = argv[0]
// The first POSITIONAL argument after the command (flags may come before or
// after it). `start next --headless` and `start --headless next` both work.
const arg = argv.slice(1).find(a => !a.startsWith('--'))
const headless = argv.includes('--headless')
let out
switch (command) {
  case 'status': out = buildStatus(); break
  case 'start': out = cmdStart(arg, { headless }); break
  case 'stop': out = cmdStop(arg); break
  case 'mode': out = cmdMode(arg); break
  default:
    console.error(USAGE)
    process.exit(2)
}
console.log(JSON.stringify(out))
process.exit(0)
