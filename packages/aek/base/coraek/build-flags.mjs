/**
 * `@cheezmil/coraek/build-flags` — the BUILD-FLAG switch (BB round,
 * 2026-11-16): the operator's persisted build-time preferences, most
 * importantly whether the aek-web console build emits source maps.
 *
 * Source maps help debugging AFTER a build (DevTools stack traces map back
 * to the original TS), at the cost of a larger, slightly slower build and
 * full source text inside the `.map` files (never ship those in a
 * distributed build). The operator toggles it in the console's 插件与程序
 * panel; the fact is a persisted file, not an in-host memory state:
 *
 *   `<AEK_HOME>/build-flags.json` = `{ "sourcemap": false }`
 *
 * Consumers read the FILE, not an API (same split as `ai-release.mjs`):
 * - the console switch writes it through the host route
 *   (`/api/aek/build-flags`, see `src/build-flags-api.ts`, 428 confirm rule);
 * - the build scripts (`release.mjs` reads the current slot, `dev-web.ts`
 *   reads the next slot) read it directly and export `AEK_WEB_SOURCEMAP=1`,
 *   which `apps/aek-web/vite.config.ts` honors — the toggle therefore takes
 *   effect on the NEXT build, not the running one.
 *
 * Missing or corrupt file = `{ sourcemap: false }` (the safe default: no
 * maps, the historical build shape).
 *
 * Zero-dependency I/O half at the package root (node builtins allowed, same
 * convention as `ai-release.mjs`); the route layer lives in
 * `src/build-flags-api.ts` (client-shaped tsconfig, no ambient node types).
 *
 * @module @cheezmil/coraek/build-flags
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The file name inside the AEK home directory. */
export const BUILD_FLAGS_FILE = 'build-flags.json'

/**
 * The store path inside the AEK home.
 * @param {string} aekHome
 * @returns {string}
 */
export function buildFlagsPath(aekHome) {
  return join(aekHome, BUILD_FLAGS_FILE)
}

/**
 * Read the build flags. Missing / corrupt / wrong-shape = the safe default
 * (sourcemap: false), never an error.
 * @param {string} aekHome
 * @returns {{ sourcemap: boolean }}
 */
export function readBuildFlags(aekHome) {
  let raw
  try {
    raw = readFileSync(buildFlagsPath(aekHome), 'utf8')
  } catch {
    return { sourcemap: false }
  }
  try {
    const doc = JSON.parse(raw)
    if (doc !== null && typeof doc === 'object' && typeof doc.sourcemap === 'boolean') {
      return { sourcemap: doc.sourcemap }
    }
  } catch {
    // fall through to the safe default
  }
  return { sourcemap: false }
}

/**
 * Persist the build flags (atomic tmp + rename).
 * @param {string} aekHome
 * @param {boolean} sourcemap
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function writeBuildFlags(aekHome, sourcemap) {
  const problems = []
  if (typeof sourcemap !== 'boolean') {
    problems.push('sourcemap must be a boolean')
    return { ok: false, problems }
  }
  if (typeof aekHome !== 'string' || aekHome.length === 0) {
    problems.push('aekHome must be a non-empty string')
    return { ok: false, problems }
  }
  const target = buildFlagsPath(aekHome)
  const tmp = join(dirname(target), `${BUILD_FLAGS_FILE}.tmp`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(tmp, JSON.stringify({ sourcemap }, null, 2) + '\n', 'utf8')
  renameSync(tmp, target)
  return { ok: true, problems }
}
