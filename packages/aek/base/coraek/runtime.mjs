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

import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
 * - external wrappers (② / ③): `isolate` only.
 * - class ①: always `share`; `isolate` only if `aek.runtime.isolate` is declared.
 * @param {unknown} manifest
 * @returns {{ canShare: boolean, canIsolate: boolean }}
 */
export function effectiveModes(manifest) {
  if (hasExternalManifest(manifest)) {
    return { canShare: false, canIsolate: true }
  }
  const rt = manifest && typeof manifest === 'object' ? manifest.aek?.runtime : undefined
  const canIsolate = !!rt && typeof rt === 'object' && rt.isolate !== null && typeof rt.isolate === 'object'
  return { canShare: true, canIsolate }
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
  const modes = readRuntimeModes(aekHome)
  modes[id] = mode
  const target = runtimeModesPath(aekHome)
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}`
  writeFileSync(tmp, `${JSON.stringify({ version: 1, modes }, null, 2)}\n`)
  renameSync(tmp, target)
  return { ok: true, problems: [] }
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
 * @param {string} fromUrl - the compiled coraek host module's `import.meta.url`.
 * @param {string} [cwd] - working directory for the dev layout.
 * @returns {Array<{ id: string, manifest: Record<string, unknown>, packageDir: string }>}
 */
export function discoverAekSiblingPackages(fromUrl, cwd = process.cwd()) {
  const byId = /** @type {Map<string, { id: string, manifest: Record<string, unknown>, packageDir: string }>} */ (new Map())

  /** Collect one scope dir's children (symlinks followed by name). */
  const collectScope = (scopeDir) => {
    for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const packageDir = join(scopeDir, entry.name)
      const manifest = readManifest(packageDir)
      if (manifest === undefined) continue
      byId.set(entry.name, { id: entry.name, manifest, packageDir })
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
 * Walk `packages/aek/**` (depth-bounded, skipping node_modules) and record
 * every package that carries an `aek` manifest block.
 * @param {string} rootDir
 * @param {number} depth
 * @param {Map<string, { id: string, manifest: Record<string, unknown>, packageDir: string }>} out
 */
function walkRepoAek(rootDir, depth, out) {
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
      out.set(entry.name, { id: entry.name, manifest, packageDir: dir })
    }
    if (depth > 0) walkRepoAek(dir, depth - 1, out)
  }
}

/**
 * The boot-time switch for user-selected `isolate` choices: for every class ①
 * capability whose stored mode is `isolate`, register its spawnable entry
 * under the supervisor and start it. `share` is the pre-existing in-process
 * cordis load — nothing to do there. Best-effort by design: a missing bin or
 * a failed spawn is recorded per id and never fatal to host boot.
 *
 * `supervisor` is structural (register / start / list on an
 * `external-supervisor` instance); this module stays zero-dependency.
 *
 * @param {{ supervisor: { register: (id: string, declared: unknown, extra?: { pin?: string, installPolicy?: 'self' | 'managed' }) => Promise<{ ok: boolean, problems: string[] }>, start: (id: string) => Promise<{ ok: boolean, state?: string, problem?: string }> }, aekHome: string, packages?: Array<{ id: string, manifest: Record<string, unknown>, packageDir: string }> }} input
 * @returns {Promise<Record<string, { ok: boolean, state?: string, problem?: string }>>}
 */
export async function bootIsolateRuntimePackages({ supervisor, aekHome, packages = [] }) {
  const stored = readRuntimeModes(aekHome)
  const results = {}
  for (const { id, manifest, packageDir } of packages) {
    // Only stored isolates are booted here — `share` (stored or default) is
    // the pre-existing in-process cordis load, which needs no host action.
    if (stored[id] !== 'isolate') continue
    const block = manifest && typeof manifest === 'object' && manifest.aek !== null && typeof manifest.aek === 'object'
      ? manifest.aek.runtime
      : undefined
    if (block === null || typeof block !== 'object' || !effectiveModes(manifest).canIsolate) {
      // A stored isolate choice with no spawnable declaration is a config
      // problem the host must surface, not silently ignore.
      results[id] = { ok: false, problem: "stored 'isolate' choice but the package declares no spawnable aek.runtime.isolate.bin" }
      continue
    }
    const bin = block.isolate && typeof block.isolate === 'object' ? block.isolate.bin : undefined
    if (typeof bin !== 'string' || bin.length === 0) {
      results[id] = { ok: false, problem: 'no spawnable aek.runtime.isolate.bin declared' }
      continue
    }
    const declared = {
      protocol: 'aek-capability/1',
      name: id,
      version: typeof manifest.version === 'string' ? manifest.version : '0.0.0',
      ...(typeof block.isolate.spdx === 'string' && block.isolate.spdx.length > 0
        ? { spdx: block.isolate.spdx }
        : typeof manifest.license === 'string' ? { spdx: manifest.license } : {}),
      ...(typeof manifest.repository === 'string' ? { source: manifest.repository }
        : manifest.repository?.url !== undefined && typeof manifest.repository.url === 'string'
          ? { source: manifest.repository.url }
          : {}),
      capabilities: Array.isArray(manifest.aek?.capabilities) ? manifest.aek.capabilities : [{ id: 'web' }],
      // The gate keeps `command` a relative, shell-free name; the package dir
      // travels as `attach.cwd` so the spawn lands in the package itself.
      attach: { kind: 'jsonrpc-stdio', command: bin, args: [], cwd: packageDir },
    }
    // In-tree class ① packages ship WITH the AEK distribution (maintained by
    // the AEK project, not installed/hand-maintained by the user) — mark them
    // `managed` so the host-rendered compliance line says "distributed by AEK"
    // rather than "installed and maintained by the user" (Y9).
    const reg = await supervisor.register(id, declared, { installPolicy: 'managed' })
    if (reg.ok === false) {
      results[id] = { ok: false, problem: reg.problems.join('; ') }
      continue
    }
    const started = await supervisor.start(id)
    results[id] = { ok: started.ok, state: started.state, problem: started.problem }
  }
  return results
}
