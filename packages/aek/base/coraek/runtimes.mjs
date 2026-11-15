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
import { platform } from 'node:os'

import {
  isAutoIsolatable,
  hostPackageDir,
  hasExternalManifest,
  readRuntimeDocV2,
  writeRuntimeDocV2,
  runtimeGroups,
  runtimeNumber,
} from './runtime.mjs'

/**
 * The store document this module reads (X2: the v2 multi-tenant document —
 * `modes` + `assignments` + `labels` keyed by RUNTIME id + explicit
 * `containers`). Version 1 files without the new maps read with empty
 * defaults; schema step 4 rewrites them to shape at boot.
 */
export const RUNTIMES_STORE_VERSION = 3

/**
 * Read the full runtime document (X2 v2 shape). A missing / corrupt store is
 * the fresh-install shape, not an error.
 * @param {string} aekHome
 * @returns {{ version: number, modes: Record<string, 'share' | 'isolate'>, assignments: Record<string, string>, labels: Record<string, string>, containers: Record<string, true> }}
 */
export function readRuntimeDoc(aekHome) {
  return readRuntimeDocV2(aekHome)
}

/**
 * Persist one runtime's operator label (atomic tmp + rename). X2: the label
 * key is the RUNTIME id (`runtime0` = the host row, `runtime1..N` the
 * isolated containers); the rest of the document is preserved verbatim.
 * @param {string} aekHome
 * @param {string} id - runtime id.
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
  const doc = readRuntimeDocV2(aekHome)
  if (label === '') delete doc.labels[id]
  else doc.labels[id] = label
  writeRuntimeDocV2(aekHome, doc)
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
 * Assemble the numbered runtime snapshot the console serves (X2 v2: 0-based
 * numbering, multi-tenant containers).
 *
 * @param {object} input
 * @param {string} input.aekHome - the runtime-mode store root.
 * @param {Array<{ id: string, manifest: Record<string, unknown>, packageDir?: string, bucket?: string }>} input.packages - discovered capability packages.
 * @param {Array<{ id: string, state: string, pid?: number }>} input.supervisorRows - live supervisor state rows (keyed by RUNTIME id under v2; pre-migration v1 rows are keyed by capability id and still answer a single-member lookup).
 * @returns the snapshot:
 * ```
 * {
 *   host:      { id: 'runtime0', number: 0, kind: 'host', label, state: 'running', pid, memory, plugins },
 *   runtimes:  [ { id, number, kind: 'isolated', label, state, pid, memory, memoryCaliber, plugins } ],
 *   isolatable: [ capability ids that support `isolate` but currently share ],
 *   platform:  the host's process.platform,
 *   pluginMemory: { [capabilityId]: { value?: number, unit: 'bytes', caliber, runtimeId?, bucket? } }
 * }
 * ```
 */
export function runtimesSnapshot(input) {
  const { aekHome, packages, supervisorRows } = input
  const doc = readRuntimeDocV2(aekHome)
  const sorted = [...packages].sort((a, b) => a.id.localeCompare(b.id))

  const rowById = new Map()
  for (const row of supervisorRows) rowById.set(row.id, row)

  // Group the stored isolates into containers (the boot-time model, pure
  // here so the snapshot never spawns or writes).
  const groups = runtimeGroups(doc, packages)
  const hostPlugins = []
  for (const pkg of sorted) {
    if (doc.modes[pkg.id] !== 'isolate') hostPlugins.push(pkg.id)
  }

  /** Look up one row: the v2 runtime key first, then the legacy v1 capability key. */
  const rowForGroup = (runtimeId, members) => {
    const direct = rowById.get(runtimeId)
    if (direct !== undefined) return direct
    if (members.length === 1) return rowById.get(members[0].id)
    return undefined
  }

  const isolated = []
  for (const [runtimeId, group] of groups) {
    const row = rowForGroup(runtimeId, group.members)
    const state = row !== undefined && row.state === 'running' ? 'running' : 'stopped'
    const pid = state === 'running' ? (row?.pid ?? undefined) : undefined
    const rss = pid !== undefined ? processRss(pid) : undefined
    isolated.push({
      id: runtimeId,
      number: runtimeNumber(runtimeId),
      kind: 'isolated',
      label: group.label,
      state,
      pid: pid ?? null,
      memory: rss !== undefined ? { rss } : undefined,
      memoryCaliber: 'process-rss',
      plugins: group.members.map(pkg => pkg.id),
    })
  }

  const host = {
    id: 'runtime0',
    number: 0,
    kind: 'host',
    label: doc.labels['runtime0'] ?? 'runtime0',
    state: 'running',
    pid: process.pid,
    memory: hostMemory(),
    memoryCaliber: 'process',
    plugins: hostPlugins,
  }

  // Per-plugin memory view (X2): an isolated plugin carries the WHOLE
  // container-process RSS it lives in (never a split — one V8 heap cannot be
  // divided per module); an in-host plugin is the honest "counted into the
  // host total" row. Each entry carries its source BUCKET and, when
  // isolated, the RUNTIME it lives in.
  const pluginMemory = {}
  const groupOf = new Map()
  for (const [runtimeId, group] of groups) {
    for (const member of group.members) groupOf.set(member.id, runtimeId)
  }
  for (const pkg of sorted) {
    const runtimeId = groupOf.get(pkg.id)
    if (runtimeId !== undefined) {
      const group = groups.get(runtimeId)
      const row = rowForGroup(runtimeId, group?.members ?? [])
      const pid = row !== undefined && row.state === 'running' ? row?.pid : undefined
      const rss = pid !== undefined ? processRss(pid) : undefined
      pluginMemory[pkg.id] = { value: rss, unit: 'bytes', caliber: 'process-rss', runtimeId, bucket: pkg.bucket }
    } else if (hasExternalManifest(pkg.manifest)) {
      // Class ②/③ forced isolate: its own process registered under the
      // CAPABILITY id (the `aek external` face, not a user runtime container).
      const row = rowById.get(pkg.id)
      const pid = row !== undefined && row.state === 'running' ? row?.pid : undefined
      const rss = pid !== undefined ? processRss(pid) : undefined
      pluginMemory[pkg.id] = { value: rss, unit: 'bytes', caliber: 'process-rss', bucket: pkg.bucket }
    } else {
      pluginMemory[pkg.id] = { value: undefined, unit: 'bytes', caliber: 'in-host-shared', bucket: pkg.bucket }
    }
  }

  // The ADD candidates: class ① capabilities that are AUTOMATICALLY
  // isolatable and currently share — the picker's "movable" hint.
  const hostDir = hostPackageDir()
  const isolatable = sorted
    .filter((pkg) => isAutoIsolatable(pkg.manifest, pkg.packageDir, hostDir)
      && doc.modes[pkg.id] !== 'isolate')
    .map((pkg) => pkg.id)

  return { host, runtimes: isolated, isolatable, platform: process.platform, pluginMemory }
}

/**
 * Schema step 4 (X2): rewrite a pre-v2 `runtime-modes.json` into the v2
 * document AND move the capability-keyed `capabilities.json` provider rows
 * onto their runtime keys, in ONE step (both files travel together).
 *
 * PURE on purpose (the schema runner owns the writes): it receives the two
 * files' current text and returns the desired bytes. Idempotent: a document
 * that already carries `assignments` answers zero writes.
 *
 * @param {{ runtimeModesText: string | null, runtimeModesPath: string, capabilitiesText: string | null, capabilitiesPath: string }} input
 * @returns {Array<{ file: string, before: string | null, after: string | null, reason: string }>}
 */
export function runtimesV2MigrationWrites(input) {
  const writes = []
  const doc = input.runtimeModesText !== null ? safeParse(input.runtimeModesText) : {}
  if (doc !== null && typeof doc === 'object' && doc.assignments !== undefined) {
    // Already v2-shaped (or beyond): nothing to do.
    if (input.capabilitiesText !== null && !hasRuntimeKeys(input.capabilitiesText)) {
      // The modes doc migrated in a PRIOR boot, the provider rows did not
      // (a v1 host wrote new capability-keyed entries after the migration,
      // impossible in practice — but a hand-edit is). Move them over too.
      const moved = moveProviderRows(doc, input.capabilitiesText)
      if (moved !== null) writes.push({ file: input.capabilitiesPath, ...moved })
    }
    return writes
  }
  const modes = doc !== null && typeof doc === 'object' && doc.modes !== null && typeof doc.modes === 'object' ? doc.modes : {}
  const labels = doc !== null && typeof doc === 'object' && doc.labels !== null && typeof doc.labels === 'object' ? doc.labels : {}
  const isolateCaps = Object.keys(modes)
    .filter((capability) => modes[capability] === 'isolate')
    .sort()
  const assignments = {}
  const labelsV2 = {}
  for (const [capability, label] of Object.entries(labels)) {
    labelsV2[capability === 'coraek-host' ? 'runtime0' : capability] = label
  }
  let n = 0
  for (const capability of isolateCaps) {
    n += 1
    const runtimeId = `runtime${String(n)}`
    assignments[capability] = runtimeId
    if (typeof labels[capability] === 'string') labelsV2[runtimeId] = labels[capability]
    delete labelsV2[capability]
  }
  const after = `${JSON.stringify({
    version: 3,
    modes,
    assignments,
    labels: labelsV2,
    containers: {},
  }, null, 2)}\n`
  if (input.runtimeModesText !== null || isolateCaps.length > 0) {
    writes.push({
      file: input.runtimeModesPath,
      before: input.runtimeModesText,
      after: isolateCaps.length > 0 || input.runtimeModesText !== null ? after : null,
      reason: `v2 multi-tenant runtime store: ${String(isolateCaps.length)} isolated capability → its own numbered runtime`,
    })
  }
  if (input.capabilitiesText !== null && isolateCaps.length > 0) {
    const moved = moveProviderRows({ assignments }, input.capabilitiesText)
    if (moved !== null) writes.push({ file: input.capabilitiesPath, ...moved })
  }
  return writes
}

/** @param {unknown} text @returns {Record<string, unknown> | null} */
function safeParse(text) {
  try {
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Does a `capabilities.json` text already carry at least one `runtime*`
 * provider key (post-migration shape)?
 * @param {string} text
 * @returns {boolean}
 */
function hasRuntimeKeys(text) {
  const parsed = safeParse(text)
  if (parsed === null || parsed.providers === null || typeof parsed.providers !== 'object') return false
  return Object.keys(parsed.providers).some((id) => /^runtime\d+$/u.test(id))
}

/**
 * Re-key the capability-keyed provider rows onto their runtime keys (the
 * v1 → v2 cutover for the supervisor store). Returns the desired bytes, or
 * null when nothing moves — the CALLER owns the file path (the schema step
 * fills `file` in).
 * @param {{ assignments: Record<string, string> }} migrated
 * @param {string} text
 * @returns {{ before: string, after: string, reason: string } | null}
 */
function moveProviderRows(migrated, text) {
  const parsed = safeParse(text)
  if (parsed === null || parsed.providers === null || typeof parsed.providers !== 'object') return null
  const providers = { ...parsed.providers }
  let moved = 0
  for (const [capability, runtimeId] of Object.entries(migrated.assignments)) {
    const entry = providers[capability]
    if (entry === undefined) continue
    if (providers[runtimeId] === undefined || providers[runtimeId].startedBy === undefined) {
      providers[runtimeId] = entry
      moved += 1
    }
    delete providers[capability]
  }
  if (moved === 0) return null
  return {
    before: text,
    after: `${JSON.stringify({ version: 1, providers }, null, 2)}\n`,
    reason: `supervisor store: ${String(moved)} capability-keyed row → its runtime key`,
  }
}
