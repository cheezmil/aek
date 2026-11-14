/**
 * `@cheezmil/coraek/runtimes` — the numbered coraek runtime view (S round).
 *
 * The console's "运行时与内存" surface needs ONE authoritative read: which
 * runtimes exist, what number each carries, which capabilities (plugins)
 * live in each, and how much memory each owns.
 *
 * Model (mirrors the selective runtime-mode boundary in `runtime.mjs`):
 * - RUNTIME 1 is always the shared host runtime — this very Node process
 *   (the web backend). Its memory is a LIVE `process.memoryUsage()` reading,
 *   exact at process level. In-process plugins count toward it; a single V8
 *   heap cannot be split per module, so in-host plugins are reported with the
 *   caliber `in-host-shared` (no fake per-plugin numbers — see the S4a
 *   research: per-module measurement only exists as heap-snapshot deltas,
 *   never as a stable runtime fact).
 * - RUNTIMES 2..N are the isolated capability processes: one capability bin
 *   each, tracked by the external supervisor (pid + state in its store).
 *   Their memory is the whole-process RSS read via `ps` / `tasklist` —
 *   `undefined` when the pid is dead or unreadable (the UI renders "—", it
 *   must never invent a number).
 * - The numbering is DERIVED (host = 1, isolates sorted by id = 2..N), never
 *   stored — there is no second source of truth beside `runtime-modes.json`.
 *
 * This module is the I/O half (node builtins allowed at the package root,
 * same convention as `runtime.mjs`); the protocol-generic route layer lives
 * in `src/runtime-api.ts` (client-shaped tsconfig, no ambient node types).
 *
 * @module @cheezmil/coraek/runtimes
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { platform } from 'node:os'
import { dirname } from 'node:path'

import { resolveRuntimeMode, effectiveModes, runtimeModesPath } from './runtime.mjs'

/**
 * The store document this module writes (adds `labels` beside the existing
 * `modes`; version 1 files without labels still read fine).
 */
export const RUNTIMES_STORE_VERSION = 2

/**
 * Read the full runtime-modes document. A missing / corrupt store is the
 * fresh-install shape, not an error.
 * @param {string} aekHome
 * @returns {{ modes: Record<string, 'share' | 'isolate'>, labels: Record<string, string> }}
 */
export function readRuntimeDoc(aekHome) {
  let raw
  try {
    raw = readFileSync(runtimeModesPath(aekHome), 'utf8')
  } catch {
    return { modes: {}, labels: {} }
  }
  try {
    const doc = JSON.parse(raw)
    const modes = doc !== null && typeof doc === 'object' && doc.modes !== null && typeof doc.modes === 'object' ? doc.modes : {}
    const labels = doc !== null && typeof doc === 'object' && doc.labels !== null && typeof doc.labels === 'object' ? doc.labels : {}
    return { modes, labels }
  } catch {
    return { modes: {}, labels: {} }
  }
}

/**
 * Persist one runtime's operator label (atomic tmp + rename). The `modes`
 * map is preserved verbatim; only `labels` changes.
 * @param {string} aekHome
 * @param {string} id - capability id.
 * @param {string} label - the new label ('' removes it).
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function writeRuntimeLabel(aekHome, id, label) {
  const problems = []
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    problems.push('id must be a non-empty string of at most 128 chars')
  }
  if (typeof label !== 'string' || label.length > 128) {
    problems.push('label must be a string of at most 128 chars')
  }
  if (problems.length > 0) return { ok: false, problems }
  const doc = readRuntimeDoc(aekHome)
  const labels = { ...doc.labels }
  if (label === '') delete labels[id]
  else labels[id] = label
  const target = runtimeModesPath(aekHome)
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}`
  writeFileSync(tmp, `${JSON.stringify({ version: RUNTIMES_STORE_VERSION, modes: doc.modes, labels }, null, 2)}\n`)
  renameSync(tmp, target)
  return { ok: true, problems: [] }
}

/**
 * The LIVE memory of the host process itself (runtime 1). Exact at process
 * level: RSS is the OS-resident total, heapUsed the V8 in-use heap.
 * @returns {{ rss: number, heapUsed: number, heapTotal: number }}
 */
export function hostMemory() {
  const mem = process.memoryUsage()
  return { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal }
}

/**
 * The RSS (bytes) of one external process, or `undefined` when the pid is
 * dead / unreadable. darwin+linux read `ps -o rss=` (KiB); win32 reads the
 * `tasklist` CSV (KiB). Never throws: an unreadable number stays `undefined`
 * and the UI renders "—".
 * @param {number} pid
 * @returns {number | undefined}
 */
export function processRss(pid) {
  if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) return undefined
  try {
    if (platform() === 'win32') {
      const out = execFileSync('tasklist', ['/fi', `PID eq ${String(pid)}`, '/fo', 'csv', '/nh'], { timeout: 3000, windowsHide: true }).toString('utf8')
      const line = out.split('\n').find((entry) => entry.includes(`"${String(pid)}"`))
      if (line === undefined) return undefined
      const match = line.match(/([\d,]+)\s*K/u)
      return match !== undefined ? Number(match[1].replace(/,/gu, '')) * 1024 : undefined
    }
    const out = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { timeout: 3000 }).toString('utf8').trim()
    const kiB = Number(out)
    return Number.isFinite(kiB) && kiB > 0 ? kiB * 1024 : undefined
  } catch {
    return undefined
  }
}

/**
 * Assemble the numbered runtime snapshot the console serves.
 *
 * @param {object} input
 * @param {string} input.aekHome - the runtime-mode store root.
 * @param {Array<{ id: string, manifest: Record<string, unknown> }>} input.packages - discovered capability packages.
 * @param {Array<{ id: string, state: string, pid?: number }>} input.supervisorRows - live supervisor state rows.
 * @returns the snapshot:
 * ```
 * {
 *   host:      { number: 1, kind: 'host', label, state: 'running', pid, memory, plugins },
 *   runtimes:  [ { id, number, kind: 'isolated', label, state, pid, memory, plugins } ],
 *   isolatable: [ capability ids that support `isolate` but currently share ],
 *   pluginMemory: { [capabilityId]: { value?: number, unit: 'bytes', caliber } }
 * }
 * ```
 */
export function runtimesSnapshot(input) {
  const { aekHome, packages, supervisorRows } = input
  const doc = readRuntimeDoc(aekHome)
  const sorted = [...packages].sort((a, b) => a.id.localeCompare(b.id))

  const rowById = new Map()
  for (const row of supervisorRows) rowById.set(row.id, row)

  const hostPlugins = []
  const isolated = []
  let number = 1

  for (const pkg of sorted) {
    const eff = resolveRuntimeMode({ manifest: pkg.manifest, storedMode: doc.modes[pkg.id] })
    if (eff.mode === 'isolate') {
      number += 1
      const row = rowById.get(pkg.id)
      const state = row !== undefined && row.state === 'running' ? 'running' : 'stopped'
      const pid = state === 'running' ? (row !== undefined ? row.pid : undefined) : undefined
      const rss = pid !== undefined ? processRss(pid) : undefined
      isolated.push({
        id: pkg.id,
        number,
        kind: 'isolated',
        label: doc.labels[pkg.id] ?? pkg.id,
        state,
        pid: pid ?? null,
        memory: rss !== undefined ? { rss } : undefined,
        memoryCaliber: 'process-rss',
        plugins: [pkg.id],
      })
    } else {
      hostPlugins.push(pkg.id)
    }
  }

  const host = {
    number: 1,
    kind: 'host',
    label: doc.labels['coraek-host'] ?? 'coraek host',
    state: 'running',
    pid: process.pid,
    memory: hostMemory(),
    memoryCaliber: 'process',
    plugins: hostPlugins,
  }

  // Per-plugin memory view: in-host plugins are honest "shared" rows (the
  // number lives in the host total, never split per module); isolated
  // plugins carry their own process RSS (undefined when unreadable).
  const pluginMemory = {}
  for (const pkg of sorted) {
    const eff = resolveRuntimeMode({ manifest: pkg.manifest, storedMode: doc.modes[pkg.id] })
    if (eff.mode === 'isolate') {
      const row = rowById.get(pkg.id)
      const pid = row !== undefined && row.state === 'running' ? row.pid : undefined
      const rss = pid !== undefined ? processRss(pid) : undefined
      pluginMemory[pkg.id] = { value: rss, unit: 'bytes', caliber: 'process-rss' }
    } else {
      pluginMemory[pkg.id] = { value: undefined, unit: 'bytes', caliber: 'in-host-shared' }
    }
  }

  const isolatable = sorted
    .filter((pkg) => effectiveModes(pkg.manifest).canIsolate && resolveRuntimeMode({ manifest: pkg.manifest, storedMode: doc.modes[pkg.id] }).mode === 'share')
    .map((pkg) => pkg.id)

  return { host, runtimes: isolated, isolatable, pluginMemory }
}
