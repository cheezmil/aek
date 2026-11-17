/**
 * `@cheezmil/coraek/icon-sets` — the open-source icon-set catalog store
 * (V6 round: 图标管理 → 图标大全).
 *
 * The webui's icon manager shows the AEK framework registry plus curated
 * open-source sets that `scripts/aek/gen-icon-sets.mjs` vendored into the
 * aek-icon-manager plugin's data directory (GitHub tarballs via the `gh`
 * CLI — no icon web services). This module is the zero-dependency I/O half
 * at the package root (node builtins allowed, same convention as
 * `runtime.mjs` / `ai-release.mjs`); the route layer lives in
 * `src/icon-sets-api.ts` (client-shaped tsconfig, no ambient node types).
 *
 * @module @cheezmil/coraek/icon-sets
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve the vendored icon-set data directory relative to this package's
 * own tree location: the coraek root → the sibling coraek-plugins tree.
 * Every host tree (dev next / stable current) carries the same layout, so
 * the relative jump works per tree without env plumbing.
 * @returns {string | undefined} the data directory, or undefined when the tree layout is off.
 */
export function resolveIconSetsDir() {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidate = join(here, '..', '..', 'coraek-plugins', 'aek-icon-manager', 'data', 'icon-sets')
  return existsSync(candidate) ? candidate : undefined
}

/**
 * Read one set's catalog (or the manifest, as `<name>.json`) when it exists
 * in the data directory.
 * @param {string | undefined} dataDir - the icon-set data directory.
 * @param {string} name - the set's file name, e.g. `lucide.json` or `manifest.json`.
 * @returns {string | undefined} the raw JSON text, or undefined when absent.
 */
export function readIconSetFile(dataDir, name) {
  if (dataDir === undefined) return undefined
  if (!/^[a-z0-9-]+\.json$/u.test(name)) return undefined
  const file = join(dataDir, name)
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}
