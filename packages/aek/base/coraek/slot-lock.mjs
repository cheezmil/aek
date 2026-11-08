#!/usr/bin/env node
/**
 * The per-slot runtime lock.
 *
 * AEK has two independent actors that both need to know "is a shell / a web
 * server running for this slot?":
 *
 *   - the Electron shell, which must refuse to start a SECOND shell for the
 *     same slot (each slot is single-instance, but the two slots coexist);
 *   - the runtime arbiter, which starts and stops the pair and therefore has
 *     to remember the pids it started.
 *
 * They used to disagree on the file format — the shell wrote a bare pid, the
 * arbiter wrote a JSON object — so neither could read the other's lock: a
 * second shell would happily start, and the arbiter would forget the shell it
 * had launched. This module is the ONE definition of the file, shared by both.
 *
 * The lock lives at `<data root>/.aek-runtime.pid` and holds a JSON object:
 *
 *   { "webPid": 123 | null, "shellPid": 456 | null, "startedAt": 1700000000000 }
 *
 * Both writers merge into the existing file instead of overwriting it, so the
 * shell's `shellPid` survives the arbiter writing `webPid`, and vice versa.
 *
 * @module @cheezmil/coraek/slot-lock
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { slotHome } from './slots.mjs'

/** The lock file name inside a slot's data root. */
export const SLOT_LOCK_FILENAME = '.aek-runtime.pid'

/**
 * The lock file's contents. Missing fields mean "not running".
 * @typedef {object} SlotLock
 * @property {number | null} [webPid] - The web server's pid, when one is running.
 * @property {number | null} [shellPid] - The Electron shell's pid, when one is running.
 * @property {number} [startedAt] - When the lock was first written.
 */

/**
 * The lock file's path for a slot.
 * @param slot - 'aek' | 'next'.
 * @param env - environment override for the base data root.
 * @returns the absolute lock path.
 */
export function slotLockPath(slot, env = process.env) {
  return join(slotHome(slot, env), SLOT_LOCK_FILENAME)
}

/**
 * Read the lock of a slot.
 * @param slot - 'aek' | 'next'.
 * @param env - environment override for the base data root.
 * @returns the lock contents, or null when absent or unreadable.
 */
export function readSlotLock(slot, env = process.env) {
  try {
    const parsed = JSON.parse(readFileSync(slotLockPath(slot, env), 'utf8'))
    if (parsed !== null && typeof parsed === 'object') return parsed
    return null
  } catch {
    return null
  }
}

/**
 * Merge fields into the lock of a slot.
 * @param slot - 'aek' | 'next'.
 * @param patch - the fields to set.
 * @param env - environment override for the base data root.
 * @returns the lock as written.
 */
export function writeSlotLock(slot, patch, env = process.env) {
  const current = readSlotLock(slot, env) ?? {}
  const next = { ...current, ...patch, startedAt: current.startedAt ?? Date.now() }
  try {
    writeFileSync(slotLockPath(slot, env), JSON.stringify(next), 'utf8')
  } catch { /* the data root may not exist yet */ }
  return next
}

/**
 * Remove the lock of a slot entirely.
 * @param slot - 'aek' | 'next'.
 * @param env - environment override for the base data root.
 * @returns void
 */
export function clearSlotLock(slot, env = process.env) {
  try { rmSync(slotLockPath(slot, env)) } catch { /* absent */ }
}

/**
 * Is a pid alive?
 * @param pid - the pid to test.
 * @returns true when the process exists.
 */
export function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
