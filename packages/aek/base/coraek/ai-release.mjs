/**
 * `@cheezmil/coraek/ai-release` — the AI auto-release switch (S7, 2026-11-15)
 * + the auto-close-next switch (S9, 2026-11-18).
 *
 * The operator can pre-authorize the AI agent to merge a finished dev tree
 * build into the stable tree and run it (`release.mjs --yes`, which
 * interrupts the live stable instance). That authorization is a persisted,
 * machine-readable fact: `<AEK_HOME>/ai-release.json` =
 * `{ "allowed": false, "autoCloseNext": true }`.
 *
 * The second switch (S9) pre-authorizes the AI to CLOSE the AEK Next
 * instances it opened during a dev round (the next-slot backend + the dev
 * shell), so a dev-only round that never releases leaves no residual next
 * instances behind. `close-next.mjs` reads this file as its gate.
 *
 * Consumers read the FILE, not an API:
 * - the console's "运行实例" switches write through the host route
 *   (`/api/aek/ai-release`, see `src/ai-release-api.ts`, 428 confirm rule);
 * - release scripts, `close-next.mjs` and the AI agent itself read it
 *   directly, so the switches stay meaningful even when no host is running.
 *
 * Per-key defaults, evaluated INDEPENDENTLY (S9 ruling 2026-11-18):
 *   - `allowed`         missing / corrupt / not-a-boolean = `false`
 *     (the safe default: the AI must ask in conversation);
 *   - `autoCloseNext`   missing / corrupt / not-a-boolean = `true`
 *     (user ruling: auto-closing the AI's own dev instances is the expected
 *     behavior; only an EXPLICIT `false` opts out).
 * A valid JSON document missing one key still defaults that key alone —
 * never "corrupt file = all fields to defaults" one-size-fits-all.
 *
 * Zero-dependency I/O half at the package root (node builtins allowed, same
 * convention as `runtime.mjs` / `runtimes.mjs` / `build-flags.mjs`); the
 * route layer lives in `src/ai-release-api.ts` (client-shaped tsconfig, no
 * ambient node types).
 *
 * @module @cheezmil/coraek/ai-release
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The file name inside the AEK home directory. */
export const AI_RELEASE_FILE = 'ai-release.json'

/**
 * The per-key safe defaults. The two keys intentionally differ: `allowed`
 * defaults to `false` (asking is the safe behavior), `autoCloseNext` to
 * `true` (closing the AI's own dev instances is the expected behavior —
 * S9 user ruling 2026-11-18).
 */
export const AI_RELEASE_DEFAULTS = Object.freeze({
  allowed: false,
  autoCloseNext: true,
})

/** The document keys this store knows about. */
const KEYS = Object.freeze(['allowed', 'autoCloseNext'])

/**
 * The store path inside the AEK home.
 * @param {string} aekHome
 * @returns {string}
 */
export function aiReleasePath(aekHome) {
  return join(aekHome, AI_RELEASE_FILE)
}

/**
 * Read the switches. Each key falls back to its own default when the file is
 * missing / corrupt or the key is absent / not a boolean — independently, so
 * `{ "allowed": true }` (the pre-S9 shape) still yields
 * `{ allowed: true, autoCloseNext: true }`.
 * @param {string} aekHome
 * @returns {{ allowed: boolean, autoCloseNext: boolean }}
 */
export function readAiRelease(aekHome) {
  const doc = { ...AI_RELEASE_DEFAULTS }
  let raw
  try {
    raw = readFileSync(aiReleasePath(aekHome), 'utf8')
  } catch {
    return doc
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return doc
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return doc
  for (const key of KEYS) {
    if (typeof parsed[key] === 'boolean') doc[key] = parsed[key]
  }
  return doc
}

/**
 * Validate a partial patch: a plain object carrying at least one known key,
 * and every carried key typed `boolean`. Returns a problem string or null.
 * @param {unknown} patch
 * @returns {string|null}
 */
function patchProblem(patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return 'patch must be an object of boolean fields'
  }
  let carried = 0
  for (const key of KEYS) {
    if (key in patch) {
      if (typeof patch[key] !== 'boolean') return `${key} must be a boolean`
      carried++
    }
  }
  for (const key of Object.keys(patch)) {
    if (!KEYS.includes(key)) return `unknown switch: ${key}`
  }
  if (carried === 0) return 'pass at least one of: allowed, autoCloseNext'
  return null
}

/**
 * Persist a partial patch, merged over the document currently on disk
 * (absent keys keep their stored value; nothing stored keeps its default).
 * Atomic tmp + rename.
 * @param {string} aekHome
 * @param {{ allowed?: boolean, autoCloseNext?: boolean }} patch
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function writeAiRelease(aekHome, patch) {
  const problems = []
  if (typeof aekHome !== 'string' || aekHome.length === 0) {
    problems.push('aekHome must be a non-empty string')
    return { ok: false, problems }
  }
  const problem = patchProblem(patch)
  if (problem) {
    problems.push(problem)
    return { ok: false, problems }
  }
  const next = { ...AI_RELEASE_DEFAULTS }
  // Merge order: file on disk (when readable) first, then the patch.
  try {
    const stored = JSON.parse(readFileSync(aiReleasePath(aekHome), 'utf8'))
    if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const key of KEYS) {
        if (typeof stored[key] === 'boolean') next[key] = stored[key]
      }
    }
  } catch {
    // absent / corrupt file: the defaults stand for the untouched keys
  }
  for (const key of KEYS) {
    if (key in patch) next[key] = patch[key]
  }
  const target = aiReleasePath(aekHome)
  const tmp = join(dirname(target), `${AI_RELEASE_FILE}.tmp`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(tmp, JSON.stringify({ allowed: next.allowed, autoCloseNext: next.autoCloseNext }, null, 2) + '\n', 'utf8')
  renameSync(tmp, target)
  return { ok: true, problems }
}
