/**
 * `@cheezmil/coraek/runtime` — selective runtime-mode model for AEK capabilities.
 *
 * A capability's relationship to the host Node runtime is one of three classes
 * (see the repo `AGENTS.md` §4 boundary):
 *
 *   ① our own TS/JS AEK plugins   → `share` (in-process, default, memory-lean)
 *                                   OR `isolate` (separate process, user-selectable)
 *   ② strong-copyleft providers    → `isolate` only, forced (license isolation)
 *   ③ native-language capabilities → `isolate` only, forced (runtime mismatch)
 *
 * This module is the *pure policy half* of that boundary: it decides the
 * effective mode and the reason, and persists the user's *selective* choice
 * (only class ① is ever written here) to `<AEK_HOME>/runtime-modes.json` via
 * `@cheezmil/coraek/home` — no hardcoded paths, no upstream knowledge.
 *
 * It is intentionally zero-dependency: it only reads/writes the store and runs
 * the decision table. The actual process management (spawn / adopt / dispose)
 * lives in `external-supervisor.mjs` and is reused unchanged for the
 * `isolate` topology; the `share` topology is the pre-existing in-process
 * cordis loading. This module does NOT start or stop anything.
 *
 * @module @cheezmil/coraek/runtime
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The only two runtime topologies a capability can run in. */
export const RUNTIME_MODES = Object.freeze(['share', 'isolate'])

/**
 * Reason codes for why a capability runs in a given mode.
 * - `license-forced` — strong-copyleft spdx; isolation is a license obligation.
 * - `runtime-forced` — native / non-JS provider; cannot share the JS runtime.
 * - `user-select`    — class ① and the user explicitly stored a mode.
 * - `default-share`  — class ① with no user choice; share to save memory.
 */
export const REASONS = Object.freeze([
  'license-forced',
  'runtime-forced',
  'user-select',
  'default-share',
])

/**
 * Does an SPDX expression look like a strong-copyleft license (AGPL / GPL)?
 * SPDX identifiers are uppercase tokens, so a substring match is safe.
 * @param {unknown} spdx - the provider's self-asserted license.
 * @returns {boolean}
 */
export function isStrongCopyleft(spdx) {
  if (typeof spdx !== 'string' || spdx.length === 0) return false
  return /\bAGPL\b|\bGPL\b/iu.test(spdx)
}

/**
 * Is `manifest` a THIN WRAPPER around an external provider (the `aek.external`
 * block)? Those are structurally out-of-process (classes ② / ③).
 * @param {unknown} manifest - a parsed `package.json`.
 * @returns {boolean}
 */
export function hasExternalManifest(manifest) {
  const aek = manifest && typeof manifest === 'object' ? manifest.aek : undefined
  return !!aek && typeof aek === 'object' && aek.external !== null && typeof aek.external === 'object'
}

/**
 * Which topologies does this capability *support*?
 * - external wrappers (② / ③): `isolate` only (license / runtime forcing).
 * - class ① TS/JS capabilities: `share` AND `isolate` AUTOMATICALLY —
 *   the operator's rule (T round): the ts/js part of a plugin must be
 *   isolatable WITHOUT the package declaring anything; `aek.runtime.isolate`
 *   is an OPTIONAL override that supplies a custom spawnable bin (the
 *   coraek-shipped generic runner covers every undeclared package, see
 *   {@link resolveIsolateAttach}).
 * @param {unknown} manifest
 * @returns {{ canShare: boolean, canIsolate: boolean }}
 */
export function effectiveModes(manifest) {
  if (hasExternalManifest(manifest)) {
    return { canShare: false, canIsolate: true }
  }
  return { canShare: true, canIsolate: true }
}

/**
 * Does the manifest carry a JS in-process entry (`main` or a string
 * `exports["."]` pointing at a .js/.mjs/.cjs file)? Bundle / patch-yaml
 * packages (coraek-profile, aek-for-dsh) report false — there is no
 * in-process part to move.
 * @param {unknown} manifest - a parsed `package.json`.
 * @returns {boolean}
 */
export function hasInProcessEntry(manifest) {
  if (manifest === null || typeof manifest !== 'object') return false
  const jsEntry = (value) => typeof value === 'string' && /\.(mjs|cjs|js)$/u.test(value)
  const main = jsEntry(manifest.main) ? manifest.main : undefined
  if (main !== undefined) return true
  const dot = manifest.exports?.['.']
  if (dot !== undefined) {
    if (typeof dot === 'string') return jsEntry(dot)
    if (dot !== null && typeof dot === 'object') {
      return (jsEntry(dot.default) ? dot.default : undefined) !== undefined
        || (jsEntry(dot.import) ? dot.import : undefined) !== undefined
    }
  }
  return false
}

/**
 * The built in-process entry points checked on disk when the manifest does
 * NOT declare `main` / `exports` (some A2 local-only plugins ship a built
 * `lib/index.js` without putting a main field in the manifest — the host
 * still loads them in-process, so the TS/JS part is there).
 * @type {readonly string[]}
 */
const JS_ENTRY_CANDIDATES = ['lib/index.js', 'index.js', 'lib/index.mjs', 'lib/index.cjs', 'dist/index.js']

/**
 * Is this capability a class ① AUTOMATICALLY-isolatable one? True when it is
 * not an external wrapper, carries a JS in-process part (a manifest entry,
 * or a built entry present on disk when the manifest declares none), and is
 * not the host package itself (a package cannot be a child of its own host
 * runtime).
 *
 * `hostDir` is the coraek package dir the running host came from
 * (`hostPackageDir()`); pass `''` in a context with no host layout to
 * disable the self-exclusion (tests). `packageDir` empty = no disk
 * fallback (the pure-manifest behavior, used by CLI contexts without a
 * host layout).
 *
 * @param {unknown} manifest - a parsed `package.json`.
 * @param {string} [packageDir] - the capability's package dir.
 * @param {string} [hostDir] - the host's own package dir.
 * @returns {boolean}
 */
export function isAutoIsolatable(manifest, packageDir = '', hostDir = '') {
  if (hasExternalManifest(manifest)) return false
  if (hostDir !== '' && packageDir !== '' && sameDir(packageDir, hostDir)) return false
  if (hasInProcessEntry(manifest)) return true
  if (packageDir === '') return false
  for (const candidate of JS_ENTRY_CANDIDATES) {
    if (existsSync(join(packageDir, candidate))) return true
  }
  return false
}

/**
 * Compare two directory paths through their resolved real paths (profile
 * node_modules links make the same dir reachable under two spellings);
 * fall back to the raw strings when either side cannot be resolved.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameDir(a, b) {
  try {
    return realpathSync(a) === realpathSync(b)
  } catch {
    return a === b
  }
}

/**
 * The coraek package dir the RUNNING host came from (the `..` above this
 * module — runtime.mjs sits at the package root). Used for the host
 * self-exclusion in {@link isAutoIsolatable}.
 * @returns {string}
 */
export function hostPackageDir() {
  try {
    return realpathSync(dirname(fileURLToPath(import.meta.url)))
  } catch {
    return dirname(fileURLToPath(import.meta.url))
  }
}

/**
 * The generic class-① isolate runner shipped with coraek (T round): answers
 * the `aek-capability/1` topology probes from the spawned capability's own
 * package dir. Every TS/JS capability is isolatable WITHOUT declaring
 * `aek.runtime.isolate`; a declared `aek.runtime.isolate.bin` always wins.
 * @returns {string} absolute path to `bin/isolate-generic.mjs` (zero
 *   hardcoded paths: derived from this module's own location).
 */
export function genericIsolateBin() {
  return join(dirname(fileURLToPath(import.meta.url)), 'bin', 'isolate-generic.mjs')
}

/**
 * Resolve what to spawn for one capability in `isolate` mode: the declared
 * CUSTOM bin when present (relative, shell-free, resolved against the
 * package dir via `attach.cwd`), else the coraek generic runner.
 *
 * The generic runner is spawned as `node <absolute-runner-path>`: the
 * supervisor's attach contract requires `command` to be a RELATIVE
 * shell-free executable name (an absolute path is rejected), while argv
 * tokens may be absolute — and forward-slashed, since a backslash is a
 * shell metacharacter in the token gate (Windows keeps working: node
 * accepts `/` in paths). The runner itself is cwd-driven: it reads
 * `./package.json` in the capability's dir (`attach.cwd`).
 * @param {{ id: string, manifest: Record<string, unknown>, packageDir?: string }} pkg
 * @returns {{ command: string, args: string[], cwd?: string, custom: boolean }}
 */
export function resolveIsolateAttach(pkg) {
  const rt = pkg.manifest && typeof pkg.manifest === 'object' ? pkg.manifest.aek?.runtime : undefined
  const declaredBin = rt !== null && typeof rt === 'object' && rt.isolate !== null && typeof rt.isolate === 'object' && typeof rt.isolate.bin === 'string' && rt.isolate.bin.length > 0
    ? rt.isolate.bin
    : undefined
  if (declaredBin !== undefined) {
    return { command: declaredBin, args: [], cwd: pkg.packageDir, custom: true }
  }
  const runner = genericIsolateBin().split(sep).join('/')
  return { command: 'node', args: [runner], cwd: pkg.packageDir, custom: false }
}

/**
 * Decide the effective runtime mode for a capability. Pure: no I/O, no spawn.
 *
 * @param {{ manifest?: unknown, storedMode?: string }} input
 * @returns {{ mode: 'share' | 'isolate', forced: boolean, reason: string }}
 */
export function resolveRuntimeMode({ manifest, storedMode }) {
  if (hasExternalManifest(manifest)) {
    const spdx = manifest.aek?.external?.spdx
    const strong = isStrongCopyleft(spdx)
    return { mode: 'isolate', forced: true, reason: strong ? 'license-forced' : 'runtime-forced' }
  }
  if (storedMode === 'isolate') {
    return { mode: 'isolate', forced: false, reason: 'user-select' }
  }
  if (storedMode === 'share') {
    return { mode: 'share', forced: false, reason: 'user-select' }
  }
  return { mode: 'share', forced: false, reason: 'default-share' }
}

// --- store ---------------------------------------------------------------

/**
 * Absolute path of the user's runtime-mode store (derived from `aekHome`,
 * never hardcoded).
 * @param {string} aekHome
 * @returns {string}
 */
export function runtimeModesPath(aekHome) {
  return join(aekHome, 'runtime-modes.json')
}

/**
 * Read the user's stored runtime-mode choices. A missing / corrupt store is an
 * empty map, not an error (a fresh install has no choices yet).
 * @param {string} aekHome
 * @returns {Record<string, 'share' | 'isolate'>}
 */
export function readRuntimeModes(aekHome) {
  try {
    const raw = readFileSync(runtimeModesPath(aekHome), 'utf8')
    const doc = JSON.parse(raw)
    if (doc && typeof doc === 'object' && doc.modes !== null && typeof doc.modes === 'object') {
      return doc.modes
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Persist one capability's selective runtime-mode choice (atomic tmp + rename).
 * Only meaningful for class ① (the resolver forces ② / ③ regardless of the
 * store). Validates the mode value so a typo can never corrupt the store.
 *
 * X2 round: writes the v2 document (`modes` + `assignments`): `isolate` with
 * no stored assignment yet gets its own fresh runtime container (the console's
 * "add a runtime" keeps working from the CLI face); `share` clears the
 * assignment (the container may then be empty — the console deletes it).
 * @param {string} aekHome
 * @param {string} id - capability id (lowercase).
 * @param {'share' | 'isolate'} mode
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function writeRuntimeMode(aekHome, id, mode) {
  const problems = []
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    problems.push('id must be a non-empty string of at most 128 chars')
  }
  if (!RUNTIME_MODES.includes(mode)) {
    problems.push(`mode must be one of ${JSON.stringify(RUNTIME_MODES)} (got ${JSON.stringify(mode)})`)
  }
  if (problems.length > 0) {
    return { ok: false, problems }
  }
  const doc = readRuntimeDocV2(aekHome)
  doc.modes[id] = mode
  if (mode === 'isolate') {
    if (typeof doc.assignments[id] !== 'string' || doc.assignments[id].length === 0) {
      doc.assignments[id] = nextRuntimeId(doc)
    }
  } else {
    delete doc.assignments[id]
  }
  writeRuntimeDocV2(aekHome, doc)
  return { ok: true, problems: [] }
}

// --- v2 runtime containers (X2 round) ---------------------------------------
//
// The S/T-round model was ONE capability per isolated process, keyed by the
// capability id. The console's "pick an EXISTING runtime for this plugin"
// surface (X2) needs runtimes to be first-class containers that may hold
// SEVERAL capabilities in one process:
//
//   - runtime 0  = the shared host process (this web backend);
//   - runtime 1..N = isolated processes, each a group of capabilities.
//
// The store gains two maps beside `modes` (v3 document):
//   - `assignments`: capability id → runtime id (absent = shared host);
//   - `containers`:  runtime id → true (explicitly created, even when empty);
// labels are re-keyed from capability ids to RUNTIME ids (the host row is
// `runtime0`). `modes` is kept verbatim for the CLI face and the license /
// runtime forcing table.

/** The v2 store document version (a v1/v2 file without `assignments` migrates). */
export const RUNTIME_DOC_VERSION = 3

/**
 * Read the full v2 runtime document. A missing / corrupt store is the
 * fresh-install shape, not an error; a pre-X2 document (no `assignments`)
 * reads with the empty maps — the boot-time pruning and the schema step 4
 * bring it to shape.
 * @param {string} aekHome
 * @returns {{ version: number, modes: Record<string, 'share' | 'isolate'>, assignments: Record<string, string>, labels: Record<string, string>, containers: Record<string, true> }}
 */
export function readRuntimeDocV2(aekHome) {
  let doc
  try {
    const raw = readFileSync(runtimeModesPath(aekHome), 'utf8')
    const parsed = JSON.parse(raw)
    doc = parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    doc = {}
  }
  const modes = doc.modes !== null && typeof doc.modes === 'object' ? doc.modes : {}
  const assignments = doc.assignments !== null && typeof doc.assignments === 'object' ? doc.assignments : {}
  const labels = doc.labels !== null && typeof doc.labels === 'object' ? doc.labels : {}
  const containers = doc.containers !== null && typeof doc.containers === 'object' ? doc.containers : {}
  return { version: RUNTIME_DOC_VERSION, modes, assignments, labels, containers }
}

/**
 * Persist one full v2 document (atomic tmp + rename, 2-space JSON + newline).
 * @param {string} aekHome
 * @param {{ modes: Record<string, 'share' | 'isolate'>, assignments: Record<string, string>, labels: Record<string, string>, containers: Record<string, true> }} doc
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function writeRuntimeDocV2(aekHome, doc) {
  const target = runtimeModesPath(aekHome)
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}`
  writeFileSync(tmp, `${JSON.stringify({
    version: RUNTIME_DOC_VERSION,
    modes: { ...doc.modes },
    assignments: { ...doc.assignments },
    labels: { ...doc.labels },
    containers: { ...doc.containers },
  }, null, 2)}\n`)
  renameSync(tmp, target)
  return { ok: true, problems: [] }
}

/**
 * The numeric part of a `runtime{n}` id (a non-conforming id — hand-edited
 * legacy data — sorts after every numbered one).
 * @param {string} runtimeId
 * @returns {number}
 */
export function runtimeNumber(runtimeId) {
  const match = /^runtime(\d+)$/u.exec(typeof runtimeId === 'string' ? runtimeId : '')
  return match !== undefined ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

/**
 * The next free numeric runtime id for a document (`runtime{max+1}`, counting
 * explicit containers, stored assignments and labels alike — a label on an
 * unknown id still claims the number).
 * @param {{ assignments: Record<string, string>, labels: Record<string, string>, containers: Record<string, true> }} doc
 * @returns {string}
 */
export function nextRuntimeId(doc) {
  let highest = 0
  for (const id of [
    ...Object.keys(doc.containers),
    ...Object.values(doc.assignments),
    ...Object.keys(doc.labels),
  ]) {
    highest = Math.max(highest, runtimeNumber(id))
  }
  return `runtime${String(highest + 1)}`
}

/**
 * The declared CUSTOM isolate bin of one manifest (`aek.runtime.isolate.bin`),
 * or undefined (the coraek generic runner covers the rest).
 * @param {unknown} manifest
 * @returns {string | undefined}
 */
export function customIsolateBinOf(manifest) {
  const rt = manifest !== null && typeof manifest === 'object' ? manifest.aek?.runtime : undefined
  const bin = rt !== null && typeof rt === 'object' ? rt.isolate?.bin : undefined
  return typeof bin === 'string' && bin.length > 0 ? bin : undefined
}

/**
 * Create a NEW runtime container (possibly empty — a placeholder the operator
 * fills later). X2: the console's add row no longer picks a capability; the
 * name is the optional custom label, blank = `runtime{next}` auto-number.
 * @param {string} aekHome
 * @param {string} [label] - the custom runtime name (blank = the auto id).
 * @returns {{ ok: boolean, runtimeId?: string, problems?: string[] }}
 */
export function createRuntime(aekHome, label = '') {
  if (typeof label !== 'string' || label.length > 128) {
    return { ok: false, problems: ['label must be a string of at most 128 chars'] }
  }
  const doc = readRuntimeDocV2(aekHome)
  const runtimeId = nextRuntimeId(doc)
  doc.containers[runtimeId] = true
  if (label.length > 0) doc.labels[`${runtimeId}`] = label
  writeRuntimeDocV2(aekHome, doc)
  return { ok: true, runtimeId }
}

/**
 * Move ONE capability to a RUNTIME container. `target` is `runtime0` (the
 * shared host — clears the choice) or an existing container id.
 *
 * The X2 constraint: a capability with a CUSTOM isolate bin owns its whole
 * process (the spawn command IS that bin), so it can share a container with
 * nobody; and nobody can join a container whose member already owns its
 * process. Everything else (generic-runner members) may cohabit freely.
 * @param {string} aekHome
 * @param {string} capability - the capability id.
 * @param {string} target - `runtime0` or a runtime container id.
 * @param {{ pkg?: { manifest?: unknown, packageDir?: string }, targetMembers?: Array<{ id: string, manifest?: unknown }> }} [input]
 * @returns {{ ok: boolean, runtimeId: string, problems?: string[] }}
 */
export function moveCapability(aekHome, capability, target, input = {}) {
  const problems = []
  if (typeof capability !== 'string' || capability.length === 0 || capability.length > 128) {
    problems.push('capability must be a non-empty string of at most 128 chars')
  }
  if (typeof target !== 'string' || target.length === 0 || target.length > 128) {
    problems.push('target must be runtime0 or a runtime container id')
  }
  if (problems.length > 0) return { ok: false, problems }
  const doc = readRuntimeDocV2(aekHome)
  const hostTarget = target === 'runtime0' || target === 'host'
  if (!hostTarget && !doc.containers[target] && !Object.values(doc.assignments).includes(target)) {
    // An assignment target may be an IMPLICIT container (v1 legacy: one
    // capability per own process, no containers map yet) — moving to it is
    // fine; only UNKNOWN targets are rejected.
    problems.push(`unknown runtime '${target}' (create it first)`)
    return { ok: false, runtimeId: target, problems }
  }
  const pkg = input.pkg
  const capCustom = pkg?.manifest !== undefined ? customIsolateBinOf(pkg.manifest) !== undefined : false
  const members = hostTarget ? [] : (input.targetMembers ?? [])
  const targetCustom = members.some(member => customIsolateBinOf(member.manifest) !== undefined)
  if (!hostTarget) {
    if (capCustom && members.length > 0) {
      problems.push('custom-bin exclusive: this capability spawns its own bin and cannot share a container')
      return { ok: false, runtimeId: target, problems }
    }
    if (targetCustom && !capCustom) {
      problems.push('custom-bin exclusive: that container is owned by a custom-bin capability')
      return { ok: false, runtimeId: target, problems }
    }
  }
  doc.modes[capability] = hostTarget ? 'share' : 'isolate'
  if (hostTarget) {
    delete doc.assignments[capability]
  } else {
    doc.assignments[capability] = target
  }
  writeRuntimeDocV2(aekHome, doc)
  return { ok: true, runtimeId: hostTarget ? 'runtime0' : target }
}

/**
 * Delete a runtime container: every member goes back to the shared host
 * (process stop is the caller's job under the supervisor), the container and
 * its label are removed. `runtime0` is the host process — undeletable.
 * @param {string} aekHome
 * @param {string} runtimeId
 * @returns {{ ok: boolean, movedToHost: string[], problems?: string[] }}
 */
export function removeRuntime(aekHome, runtimeId) {
  if (typeof runtimeId !== 'string' || runtimeId.length === 0) {
    return { ok: false, movedToHost: [], problems: ['runtimeId must be a non-empty string'] }
  }
  if (runtimeId === 'runtime0') {
    return { ok: false, movedToHost: [], problems: ['runtime0 is the shared host process and cannot be removed'] }
  }
  const doc = readRuntimeDocV2(aekHome)
  const movedToHost = Object.keys(doc.assignments)
    .filter(capability => doc.assignments[capability] === runtimeId)
    .sort()
  for (const capability of movedToHost) {
    doc.modes[capability] = 'share'
    delete doc.assignments[capability]
  }
  delete doc.containers[runtimeId]
  delete doc.labels[runtimeId]
  writeRuntimeDocV2(aekHome, doc)
  return { ok: true, movedToHost }
}

/**
 * The EFFECTIVE capability → runtime assignment table for one document: the
 * stored `assignments` win; an unassigned stored-`isolate` capability (a
 * pre-X2 store that was never migrated) gets its own fresh container,
 * numbered after every explicit one, in id order (deterministic, so boot,
 * the snapshot and the API agree without a write).
 * @param {{ modes: Record<string, 'share' | 'isolate'>, assignments: Record<string, string>, containers: Record<string, true> }} doc
 * @param {Array<{ id: string, manifest: Record<string, unknown> }>} packages
 * @returns {Map<string, string>}
 */
export function effectiveAssignments(doc, packages) {
  const out = new Map()
  const unassigned = []
  for (const pkg of packages) {
    if (doc.modes[pkg.id] !== 'isolate') continue
    const stored = doc.assignments[pkg.id]
    if (typeof stored === 'string' && stored.length > 0) out.set(pkg.id, stored)
    else unassigned.push(pkg.id)
  }
  unassigned.sort((a, b) => a.localeCompare(b))
  let highest = 0
  for (const id of [...Object.keys(doc.containers), ...Object.values(doc.assignments)]) {
    highest = Math.max(highest, runtimeNumber(id))
  }
  for (const capability of unassigned) {
    highest += 1
    out.set(capability, `runtime${String(highest)}`)
  }
  return out
}

/**
 * Group the stored-`isolate` capabilities into runtime containers (X2): one
 * process per container. Pure: no I/O, no spawn.
 * @param {{ modes: Record<string, 'share' | 'isolate'>, assignments: Record<string, string>, labels: Record<string, string>, containers: Record<string, true> }} doc
 * @param {Array<{ id: string, manifest: Record<string, unknown>, packageDir?: string }>} packages
 * @returns {Map<string, { label: string, number: number, members: Array<{ id: string, manifest: Record<string, unknown>, packageDir?: string }>, explicit: boolean }>}
 */
export function runtimeGroups(doc, packages) {
  const assignments = effectiveAssignments(doc, packages)
  const groups = new Map()
  const byNumber = (a, b) => a.number - b.number
  const ensure = (runtimeId) => {
    if (!groups.has(runtimeId)) {
      const number = runtimeNumber(runtimeId)
      const explicit = doc.containers[runtimeId] === true
      groups.set(runtimeId, { label: doc.labels[runtimeId] ?? runtimeId, number, members: [], explicit })
    }
    return groups.get(runtimeId)
  }
  for (const pkg of packages) {
    const runtimeId = assignments.get(pkg.id)
    if (runtimeId === undefined) continue
    ensure(runtimeId).members.push(pkg)
  }
  // Explicit (console-created) containers count even when empty.
  for (const containerId of Object.keys(doc.containers)) ensure(containerId)
  const sorted = [...groups.entries()]
    .sort((a, b) => byNumber(a[1], b[1]) || a[0].localeCompare(b[0]))
    .map(([runtimeId, group]) => [runtimeId, { ...group, members: group.members.sort((a, b) => a.id.localeCompare(b.id)) }] )
  return new Map(sorted)
}

/**
 * Resolve what to SPAWN for one runtime container (X2): the member's CUSTOM
 * bin when the container holds exactly that one member (a custom bin owns
 * its whole process), else the coraek generic runner — multi-tenant, cwd the
 * first member's dir (an EMPTY container runs the runner from coraek's own
 * dir; it is a topology placeholder until a plugin is moved in).
 * @param {{ runtimeId: string, label?: string, members: Array<{ id: string, manifest: Record<string, unknown>, packageDir?: string }> }} group
 * @returns {{ command: string, args: string[], cwd?: string, custom: boolean, descriptor: Record<string, unknown> }}
 */
export function resolveRuntimeGroupAttach(group) {
  const { runtimeId, members } = group
  const customMember = members.length === 1 ? customIsolateBinOf(members[0].manifest) : undefined
  if (customMember !== undefined) {
    const member = members[0]
    const manifest = member.manifest ?? {}
    const block = manifest.aek?.runtime
    const descriptor = {
      protocol: 'aek-capability/1',
      // X3-6a: the descriptor `name` is the MACHINE identity (the supervisor's
      // registration key) and must satisfy NAME_RE — so it is ALWAYS the
      // ASCII runtime id, never the operator label. `group.label` is a pure
      // UI display string (persisted in the `labels` map, read back by
      // `runtimesSnapshot`); feeding it here made a CJK label ("提示管理")
      // fail descriptor validation and kill the container's boot relaunch.
      name: runtimeId,
      version: typeof manifest.version === 'string' ? manifest.version : '0.0.0',
      ...(typeof block?.isolate?.spdx === 'string' && block.isolate.spdx.length > 0
        ? { spdx: block.isolate.spdx }
        : typeof manifest.license === 'string' ? { spdx: manifest.license } : {}),
      ...(typeof manifest.repository === 'string' ? { source: manifest.repository }
        : manifest.repository?.url !== undefined && typeof manifest.repository.url === 'string'
          ? { source: manifest.repository.url }
          : {}),
      capabilities: Array.isArray(manifest.aek?.capabilities) ? manifest.aek.capabilities : [{ id: 'web' }],
      attach: { kind: 'jsonrpc-stdio', command: customMember, args: [], cwd: member.packageDir },
      // X2 marker: the container's members (the topology the operator sees).
      members: members.map(member => member.id),
    }
    return { command: customMember, args: [], cwd: member.packageDir, custom: true, descriptor }
  }
  const runner = genericIsolateBin().split(sep).join('/')
  const cwd = members.length > 0 ? members[0].packageDir : hostPackageDir()
  const capabilities = []
  for (const member of members) {
    const list = Array.isArray(member.manifest?.aek?.capabilities) ? member.manifest.aek.capabilities : [{ id: 'web' }]
    for (const entry of list) {
      const capId = typeof entry === 'string' ? entry : entry?.id
      // The descriptor speaks OBJECTS (`{id}`) — the supervisor validates
      // `capabilities[0].id` against the capability-id regex; a bare string
      // has no `.id` and fails registration.
      if (typeof capId === 'string' && !capabilities.some(item => item.id === capId)) capabilities.push({ id: capId })
    }
  }
  const descriptor = {
    protocol: 'aek-capability/1',
    // X3-6a: machine name = the ASCII runtime id, never the operator label
    // (the label is a display string and may be CJK — see the custom-bin
    // descriptor above).
    name: runtimeId,
    version: '0.0.0',
    capabilities: capabilities.length > 0 ? capabilities : [{ id: 'web' }],
    attach: { kind: 'jsonrpc-stdio', command: 'node', args: [runner], cwd },
    generic: true,
    members: members.map(member => member.id),
  }
  return { command: 'node', args: [runner], cwd, custom: false, descriptor }
}

// --- boot-time topology switch ---------------------------------------------

/**
 * Discover installed AEK capability packages. Two discovery sources are
 * merged (deduped by id, scope first):
 *
 * 1. THE INSTALL LAYOUT — the `@cheezmil` scope dir two levels above the
 *    running coraek host module (`lib/index.js` → up two), which holds every
 *    installed AEK package (npm install, or dev symlinks resolved through
 *    their real names).
 * 2. THE DEV LAYOUT — `packages/aek/**` below the working directory: the
 *    dev host runs from the repo checkout through tsx (source imports, so
 *    source 1 lands inside `packages/aek/base` and sees no siblings), and
 *    the operator's cwd is the repo root.
 *
 * No hardcoded absolute paths: both are derived from the module's own
 * location / the process cwd at call time.
 *
 * T round: every discovered package carries its source BUCKET — the
 * `packages/aek/*` layout the user classifies by (coraek-plugins →
 * `plugins`, public → `public`, base → `base`, target-extensions →
 * `extensions`). An explicit `aek.bucket` manifest field always wins (the
 * install layout is flat and cannot be derived); the dev layout derives it
 * from the directory position.
 *
 * @param {string} fromUrl - the compiled coraek host module's `import.meta.url`.
 * @param {string} [cwd] - working directory for the dev layout.
 * @returns {Array<{ id: string, manifest: Record<string, unknown>, packageDir: string, bucket?: string }>}
 */
export function discoverAekSiblingPackages(fromUrl, cwd = process.cwd()) {
  const byId = /** @type {Map<string, { id: string, manifest: Record<string, unknown>, packageDir: string, bucket?: string }>} */ (new Map())

  /** Collect one scope dir's children (symlinks followed by name). */
  const collectScope = (scopeDir) => {
    for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const packageDir = join(scopeDir, entry.name)
      const manifest = readManifest(packageDir)
      if (manifest === undefined) continue
      byId.set(entry.name, { id: entry.name, manifest, packageDir, bucket: bucketOf(manifest) })
    }
  }

  // Source 1: the install scope dir.
  try {
    collectScope(resolve(dirname(fileURLToPath(fromUrl)), '..', '..'))
  } catch { /* not the install layout */ }

  // Source 2: the dev repo layout (only when the operator works from a
  // checkout; a plain `packages/aek` miss is the no-op case).
  walkRepoAek(join(cwd, 'packages', 'aek'), 3, byId)

  return [...byId.values()]
}

/**
 * The manifest-declared bucket, when present and valid.
 * @param {Record<string, unknown>} manifest
 * @returns {string | undefined}
 */
function bucketOf(manifest) {
  const declared = manifest.aek !== null && typeof manifest.aek === 'object' ? manifest.aek.bucket : undefined
  return typeof declared === 'string' && declared.length > 0 ? declared : undefined
}

/**
 * Read one package.json; undefined when absent / unparsable.
 * @param {string} packageDir
 * @returns {Record<string, unknown> | undefined}
 */
function readManifest(packageDir) {
  try {
    const raw = readFileSync(join(packageDir, 'package.json'), 'utf8')
    const manifest = JSON.parse(raw)
    return manifest !== null && typeof manifest === 'object' && manifest.aek !== null && typeof manifest.aek === 'object' && !Array.isArray(manifest.aek)
      ? manifest
      : undefined
  } catch {
    return undefined
  }
}

/**
 * The dev-layout bucket map: the FIRST directory component below
 * `packages/aek` is the user's classification (the 2026-11-15 T round
 * layout). `target-extensions` is the fourth, on-hold target-extension
 * bucket. Unknown first components fall back to `plugins`.
 * @param {string} firstComponent
 * @returns {string}
 */
function devLayoutBucket(firstComponent) {
  switch (firstComponent) {
    case 'coraek-plugins':
      return 'plugins'
    case 'public':
      return 'public'
    case 'base':
      return 'base'
    case 'target-extensions':
      return 'extensions'
    default:
      return 'plugins'
  }
}

/**
 * Walk `packages/aek/**` (depth-bounded, skipping node_modules) and record
 * every package that carries an `aek` manifest block. The bucket is the
 * top-level directory under `packages/aek` the package sits in (threaded
 * down the recursion); an explicit `aek.bucket` manifest field wins.
 * @param {string} rootDir
 * @param {number} depth
 * @param {Map<string, { id: string, manifest: Record<string, unknown>, packageDir: string, bucket?: string }>} out
 * @param {string | undefined} bucket - the bucket context of this level.
 */
function walkRepoAek(rootDir, depth, out, bucket) {
  let entries
  try {
    entries = readdirSync(rootDir, { withFileTypes: true })
  } catch {
    return // not a dev checkout: the no-op case
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const dir = join(rootDir, entry.name)
    const manifest = readManifest(dir)
    if (manifest !== undefined && !out.has(entry.name)) {
      // The bucket at this level: the inherited context, else this entry's
      // own name (a top-level bucket dir), else the `plugins` fallback.
      const pkgBucket = bucketOf(manifest) ?? (bucket !== undefined ? bucket : devLayoutBucket(entry.name))
      out.set(entry.name, { id: entry.name, manifest, packageDir: dir, bucket: pkgBucket })
    }
    if (depth > 0) walkRepoAek(dir, depth - 1, out, bucket !== undefined ? bucket : devLayoutBucket(entry.name))
  }
}
/**
 * Register + start ONE runtime container's process live under the shared
 * supervisor (the X2 console "add / move / rename" path: a runtime added in
 * the UI appears WITHOUT a host restart). Re-registering keeps a live child
 * live (the supervisor's single-instance guard); a membership change
 * re-resolves the attach and re-spawns.
 *
 * @param {{ supervisor: { register: (id: string, declared: unknown, extra?: { pin?: string, installPolicy?: 'self' | 'managed' }) => Promise<{ ok: boolean, problems: string[] }>, start: (id: string) => Promise<{ ok: boolean, state?: string, problem?: string }> }, aekHome: string, packages?: Array<{ id: string, manifest: Record<string, unknown>, packageDir?: string }>, runtimeId: string }} input
 * @returns {Promise<{ ok: boolean, runtimeId: string, state?: string, problem?: string, members: string[] }>}
 */
export async function startRuntimeGroup({ supervisor, aekHome, packages = [], runtimeId }) {
  const doc = readRuntimeDocV2(aekHome)
  const group = runtimeGroups(doc, packages).get(runtimeId)
  if (group === undefined) {
    return { ok: false, runtimeId, problem: `unknown runtime '${runtimeId}' (create it first)`, members: [] }
  }
  const spawnable = group.members.filter(pkg => customIsolateBinOf(pkg.manifest) !== undefined || isAutoIsolatable(pkg.manifest, pkg.packageDir, hostPackageDir()))
  const attach = resolveRuntimeGroupAttach({ runtimeId, label: group.label, members: spawnable })
  const reg = await supervisor.register(runtimeId, attach.descriptor, { installPolicy: 'managed' })
  if (reg.ok === false) {
    return { ok: false, runtimeId, problem: reg.problems.join('; '), members: spawnable.map(pkg => pkg.id) }
  }
  const started = await supervisor.start(runtimeId)
  return { ok: started.ok, runtimeId, state: started.state, problem: started.problem, members: spawnable.map(pkg => pkg.id) }
}

/**
 * Stop one runtime container's process (the X2 "remove runtime" path: members
 * go back to the host, the process is gone; the container's store entry is the
 * caller's `removeRuntime`).
 * @param {{ supervisor: { stop: (id: string) => Promise<{ ok: boolean, problem?: string }>, unregister: (id: string) => Promise<{ ok: boolean }> }, aekHome: string, runtimeId: string }} input
 * @returns {Promise<{ ok: boolean, runtimeId: string, problem?: string }>}
 */
export async function stopRuntimeGroup({ supervisor, aekHome, runtimeId }) {
  const stopped = await supervisor.stop(runtimeId)
  await supervisor.unregister(runtimeId)
  return stopped.ok === false && stopped.problem !== undefined
    ? { ok: false, runtimeId, problem: stopped.problem }
    : { ok: true, runtimeId }
}

/**
 * The boot-time switch for the X2 runtime model: group every stored-`isolate`
 * capability into its runtime container (one process per container, several
 * capabilities per process) and register + start each group under the
 * supervisor. `share` (stored or default) is the pre-existing in-process
 * cordis load — nothing to do there. Best-effort by design: a missing bin or
 * a failed spawn is recorded per container and never fatal to host boot.
 *
 * Legacy pruning (v1 → v2 cutover): pre-X2 stores keyed the provider
 * registry by the CAPABILITY id; v2 keys it by the RUNTIME id. Every
 * capability-keyed entry of a discovered, non-external class-① package is
 * stale after this boot (its container owns the process now, or it is back
 * on the host) and is unregistered — external wrappers (② / ③, their own
 * supervisor registrations under `aek external`) are never touched.
 *
 * `supervisor` is structural (register / start / stop / unregister / list on
 * an `external-supervisor` instance); this module stays zero-dependency.
 *
 * @param {{ supervisor: { register: (id: string, declared: unknown, extra?: { pin?: string, installPolicy?: 'self' | 'managed' }) => Promise<{ ok: boolean, problems: string[] }>, start: (id: string) => Promise<{ ok: boolean, state?: string, problem?: string }>, stop: (id: string) => Promise<{ ok: boolean, problem?: string }>, unregister: (id: string) => Promise<{ ok: boolean }>, list: () => Promise<Record<string, unknown>> }, aekHome: string, packages?: Array<{ id: string, manifest: Record<string, unknown>, packageDir?: string }> }} input
 * @returns {Promise<Record<string, { ok: boolean, state?: string, problem?: string, members?: string[] }>>}
 */
export async function bootIsolateRuntimePackages({ supervisor, aekHome, packages = [] }) {
  const doc = readRuntimeDocV2(aekHome)
  const groups = runtimeGroups(doc, packages)
  const results = {}
  for (const [runtimeId, group] of groups) {
    const spawnable = group.members.filter(pkg => customIsolateBinOf(pkg.manifest) !== undefined || isAutoIsolatable(pkg.manifest, pkg.packageDir, hostPackageDir()))
    const skipped = group.members.length - spawnable.length
    if (spawnable.length === 0 && group.explicit === false && group.members.length > 0) {
      // A stored 'isolate' choice with nothing spawnable (a bundle /
      // patch-yaml package): record, never spawn an empty non-explicit group.
      results[runtimeId] = { ok: false, problem: `stored 'isolate' choice but no spawnable entry (${String(skipped)} of ${String(group.members.length)} members lack a JS in-process part or a custom bin)`, members: group.members.map(pkg => pkg.id) }
      continue
    }
    const attach = resolveRuntimeGroupAttach({ runtimeId, label: group.label, members: spawnable })
    // In-tree class ① packages ship WITH the AEK distribution (maintained by
    // the AEK project, not installed/hand-maintained by the user) — mark the
    // container `managed` so the host-rendered compliance line says
    // "distributed by AEK" rather than "installed and maintained by the user".
    const reg = await supervisor.register(runtimeId, attach.descriptor, { installPolicy: 'managed' })
    if (reg.ok === false) {
      results[runtimeId] = { ok: false, problem: reg.problems.join('; '), members: spawnable.map(pkg => pkg.id) }
      continue
    }
    const started = await supervisor.start(runtimeId)
    results[runtimeId] = { ok: started.ok, state: started.state, problem: started.problem, members: spawnable.map(pkg => pkg.id) }
  }
  // Legacy v1 pruning: capability-keyed provider entries of discovered,
  // non-external packages are stale under the v2 runtime-keyed model.
  const byId = new Map(packages.map(pkg => [pkg.id, pkg]))
  try {
    const providers = await supervisor.list()
    for (const providerId of Object.keys(providers)) {
      const pkg = byId.get(providerId)
      if (pkg === undefined || hasExternalManifest(pkg.manifest)) continue
      await supervisor.unregister(providerId)
    }
  } catch { /* pruning is best-effort; the next boot retries */ }
  return results
}
