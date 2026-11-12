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

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
