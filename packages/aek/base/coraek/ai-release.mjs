/**
 * `@cheezmil/coraek/ai-release` — the AI auto-release switch (S7, 2026-11-15).
 *
 * The operator can pre-authorize the AI agent to merge a finished dev tree
 * build into the stable tree and run it (`release.mjs --yes`, which
 * interrupts the live stable instance). That authorization is a persisted,
 * machine-readable fact: `<AEK_HOME>/ai-release.json` = `{ "allowed": false }`.
 *
 * Consumers read the FILE, not an API:
 * - the console's "运行实例" switch writes it through the host route
 *   (`/api/aek/ai-release`, see `src/ai-release-api.ts`, 428 confirm rule);
 * - release scripts and the AI agent itself read it directly, so the switch
 *   stays meaningful even when no host is running.
 *
 * Missing or corrupt file = `{ allowed: false }` (the safe default: the AI
 * must ask in conversation).
 *
 * Zero-dependency I/O half at the package root (node builtins allowed, same
 * convention as `runtime.mjs` / `runtimes.mjs`); the route layer lives in
 * `src/ai-release-api.ts` (client-shaped tsconfig, no ambient node types).
 *
 * @module @cheezmil/coraek/ai-release
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The file name inside the AEK home directory. */
export const AI_RELEASE_FILE = 'ai-release.json'

/**
 * The store path inside the AEK home.
 * @param {string} aekHome
 * @returns {string}
 */
export function aiReleasePath(aekHome) {
  return join(aekHome, AI_RELEASE_FILE)
}

/**
 * Read the switch. Missing / corrupt / wrong-shape = the safe default
 * (allowed: false), never an error.
 * @param {string} aekHome
 * @returns {{ allowed: boolean }}
 */
export function readAiRelease(aekHome) {
  let raw
  try {
    raw = readFileSync(aiReleasePath(aekHome), 'utf8')
  } catch {
    return { allowed: false }
  }
  try {
    const doc = JSON.parse(raw)
    if (doc !== null && typeof doc === 'object' && typeof doc.allowed === 'boolean') {
      return { allowed: doc.allowed }
    }
  } catch {
    // fall through to the safe default
  }
  return { allowed: false }
}

/**
 * Persist the switch (atomic tmp + rename).
 * @param {string} aekHome
 * @param {boolean} allowed
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function writeAiRelease(aekHome, allowed) {
  const problems = []
  if (typeof allowed !== 'boolean') {
    problems.push('allowed must be a boolean')
    return { ok: false, problems }
  }
  if (typeof aekHome !== 'string' || aekHome.length === 0) {
    problems.push('aekHome must be a non-empty string')
    return { ok: false, problems }
  }
  const target = aiReleasePath(aekHome)
  const tmp = join(dirname(target), `${AI_RELEASE_FILE}.tmp`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(tmp, JSON.stringify({ allowed }, null, 2) + '\n', 'utf8')
  renameSync(tmp, target)
  return { ok: true, problems }
}
