#!/usr/bin/env node
/**
 * Shared primitives for the script that move a slot or its contents around.
 *
 * `migrate-data-root.mjs` (container layout change) and `relocate.mjs`
 * (manifest-driven move) both need the same three things: "is anything running
 * right now", "what does the repair pass say", and "a timestamp that sorts".
 * They live here so the two callers cannot drift apart — a divergent copy of
 * `runningProcesses()` would mean one tool happily renames a directory out from
 * under a live process.
 *
 * Nothing here writes to the data root except `repairLinks()`, which delegates
 * to `repair-skill-links.mjs` and only rewrites symlinks.
 *
 * @module scripts/aek/slot-ops
 */
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SLOTS } from '../../packages/aek/base/coraek/slots.mjs'

/** Where the link repair pass lives — computed from this file, never spelled out. */
export const REPAIR_SCRIPT = fileURLToPath(new URL('./repair-skill-links.mjs', import.meta.url))

/**
 * Pids currently listening on a port.
 * @param {number} port @returns {string[]}
 */
export function listenPids(port) {
  try {
    return execFileSync('/usr/sbin/lsof',
      ['-nP', `-iTCP:${String(port)}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' })
      .split('\n').filter(l => l.startsWith('p')).map(l => l.slice(1)).filter(Boolean)
  } catch { return [] }
}

/**
 * Anything still running for either slot. `lsof` alone is enough: both slots
 * always own a listening web port while they run, and a shell without a web
 * backend is not a working shell.
 * @returns {string[]} human-readable "slot pid port" lines.
 */
export function runningProcesses() {
  const busy = []
  for (const slot of Object.keys(SLOTS)) {
    for (const port of [SLOTS[slot].webPort, SLOTS[slot].cdpPort]) {
      for (const pid of listenPids(port)) busy.push(`${slot}: pid ${pid} holds port ${port}`)
    }
  }
  return busy
}

/** @returns {string} timestamp for snapshot directory names. */
export function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** @param {string} p @returns {number} st_dev, or -1 */
export function deviceOf(p) {
  try { return statSync(p).dev } catch { return -1 }
}

/**
 * Run the consumer-link repair pass against a container.
 *
 * `AEK_ROOT` is pinned to the container the caller just changed: the child must
 * look at the layout this run produced, never at an inherited environment.
 * @param {object} options - how to run it.
 * @param {string} options.root - container the child must treat as `~/.aek`.
 * @param {boolean} options.apply - false previews (nothing is written), true rewrites.
 * @param {string[]} [options.assumeGone] - directories to treat as gone even
 *   though they still resolve (the old slot, during a dry run).
 * @returns {{ ok: boolean, counts: Record<string, number>, output: string }} the child's tally.
 */
export function repairLinks({ root, apply, assumeGone = [] }) {
  const args = [REPAIR_SCRIPT, '--json', ...(apply ? ['--yes'] : [])]
  for (const dir of assumeGone) args.push('--assume-gone', dir)
  /** @type {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} */
  const options = { encoding: 'utf8', env: { ...process.env, AEK_ROOT: root }, stdio: ['ignore', 'pipe', 'pipe'] }
  try {
    const out = execFileSync(process.execPath, args, options)
    return { ok: true, counts: JSON.parse(out).counts ?? {}, output: out }
  } catch (error) {
    // A non-zero exit means "some links are still dangling", not "the pass
    // crashed": keep the tally so the caller can report it instead of guessing.
    const raw = /** @type {any} */ (error)
    const out = `${raw.stdout ?? ''}${raw.stderr ?? ''}`
    try {
      return { ok: false, counts: JSON.parse(String(raw.stdout ?? '')).counts ?? {}, output: out }
    } catch {
      return { ok: false, counts: {}, output: out }
    }
  }
}
