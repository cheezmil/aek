/**
 * `@cheezmil/coraek/logging` — the SHARED READ side of AEK's built-in,
 * cross-platform text logging (T round).
 *
 * The WRITE side lives in the established SDKs, not here:
 *   - the desktop shell writes `desktop.log` through `electron-log`
 *     (main process; renderer console lines are captured into it);
 *   - the web host command writes `web-host.log` through `pino` +
 *     `pino-roll` (JSON lines — the `aek logs` command renders them back
 *     into human text with `renderWebHostLine`).
 * Files land in the slot's data root (`<slotHome(slot)>/logs/<source>.log`),
 * resolved ONLY through `@cheezmil/coraek/slots` — zero hardcoded
 * paths/usernames. Rotation (2 MiB × 5 generations) is owned by each SDK;
 * the readers below simply collect whatever generations exist.
 *
 * Read side (`logFiles`/`readLogTail`/`followLog`) backs the `aek logs`
 * command; it is used only by that command, so its failures are fatal to the
 * command, not to a host process.
 *
 * @module @cheezmil/coraek/logging
 */

import { open, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { slotHome } from './slots.mjs'

/** Level ordering the `aek logs` level filter understands. */
const LEVELS = ['debug', 'info', 'warn', 'error']

/** Sanitize a source tag into a safe file-name stem (`desktop`, `web`, …). */
function sourceStem(source) {
  return String(source).replace(/[^\w.-]/g, '_')
}

/**
 * @param {string} source
 * @returns {string} the live log file path inside the slot's data root.
 */
export function logPath(slot, source) {
  return join(slotHome(slot ?? 'aek'), 'logs', `${sourceStem(source)}.log`)
}

/**
 * The two writer SDKs name their generations differently:
 *   - `live-first` (electron-log, `desktop.log`): the live file is
 *     `<stem>.log`, rolls are `<stem>.log.1`, `.2`, …
 *   - `numbered` (pino-roll, `web-host`): every generation is
 *     `<stem>.<N>.log` and the live one carries the HIGHEST N.
 *
 * @param {string} slot
 * @param {string} source
 * @param {{ scheme?: 'live-first' | 'numbered' }} [opts]
 * @returns {Promise<string[]>} that source's log files, newest first.
 */
export async function logFiles(slot, source, { scheme = 'live-first' } = {}) {
  const root = join(slotHome(slot ?? 'aek'), 'logs')
  const stem = sourceStem(source)
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = scheme === 'numbered'
    ? new RegExp(`^${escaped}\\.\\d+\\.log$`)
    : new RegExp(`^${escaped}\\.log(\\.\\d+)?$`)
  const found = []
  try {
    for (const name of await readdir(root)) if (re.test(name)) found.push(name)
  } catch { /* no logs dir yet */ }
  const paths = found.map((name) => join(root, name))
  if (scheme === 'numbered') {
    const gen = (p) => Number(p.match(/\.(\d+)\.log$/)[1])
    return paths.sort((a, b) => gen(b) - gen(a))
  }
  return paths.sort((a, b) => a.length - b.length) // the live file has the shortest name
}

/**
 * Read up to `maxLines` log lines across one source's rotated generations.
 * Filters apply to event lines only (indented continuations follow their
 * event): level prefix, ISO-timestamp floor, literal substring.
 *
 * @param {{ slot?: string, source: string, maxLines?: number, level?: 'debug'|'info'|'warn'|'error', since?: string, grep?: string, scheme?: 'live-first' | 'numbered', render?: (line: string) => string | null }} opts
 *   `render` (optional) transforms each raw line into its display form
 *   (e.g. pino JSON → text) BEFORE the filters run; returning `null`
 *   drops the line.
 * @returns {Promise<string[]>} display lines, oldest → newest.
 */
export async function readLogTail(opts) {
  const maxLines = opts.maxLines ?? 100
  const files = await logFiles(opts.slot, opts.source, { scheme: opts.scheme })
  /** @type {string[]} */
  const all = []
  for (const f of files.reverse()) all.push(...(await readFile(f, 'utf8').catch(() => '')).split('\n'))
  const minIndex = LEVELS.indexOf(opts.level ?? 'debug')
  const sinceMs = opts.since ? Date.parse(opts.since) : null
  const lines = []
  for (const raw of all) {
    if (!raw.trim()) continue
    const text = opts.render ? (opts.render(raw) ?? raw) : raw
    if (text.startsWith('  ')) { lines.push(text); continue } // continuation of the previous event
    const m = text.match(/^(\S+)\s+(\w{5})\s/)
    if (m) {
      if (LEVELS.indexOf(m[2].toLowerCase()) < minIndex) continue
      if (sinceMs !== null && Number.isNaN(sinceMs) === false && Date.parse(m[1]) < sinceMs) continue
    }
    if (opts.grep && !text.includes(opts.grep)) continue
    lines.push(text)
  }
  return lines.slice(-maxLines)
}

/**
 * Follow a source: poll the live file every `pollMs`, surviving rotation.
 * @param {{ slot?: string, source: string, pollMs?: number, scheme?: 'live-first' | 'numbered', onLine: (line: string) => void, done?: () => boolean }} opts
 * @returns {Promise<void>} resolves when `done()` returns true.
 */
export async function followLog(opts) {
  const pollMs = opts.pollMs ?? 1_000
  const { source, scheme } = opts
  let offset = 0
  /** @type {string | undefined} */
  let lastFile
  for (;;) {
    if (opts.done?.()) return
    try {
      const files = await logFiles(opts.slot, source, { scheme })
      if (files.length === 0) {
        await new Promise((r) => setTimeout(r, pollMs))
        continue
      }
      const live = files[0]
      if (live !== lastFile) {
        offset = 0
        lastFile = live
      }
      const st = await stat(live)
      if (st.size < offset) offset = 0 // rotated under us
      if (st.size > offset) {
        const handle = await open(live, 'r')
        try {
          const buf = Buffer.alloc(st.size - offset)
          await handle.read(buf, 0, buf.length, offset)
          offset = st.size
          for (const l of buf.toString('utf8').split('\n')) if (l) opts.onLine(l)
        } finally {
          await handle.close()
        }
      }
    } catch { /* transient — keep polling */ }
    await new Promise((r) => setTimeout(r, pollMs))
  }
}
