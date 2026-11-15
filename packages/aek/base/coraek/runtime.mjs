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
    // T round: the spawn entry resolves to the declared CUSTOM bin when the
    // package supplies one, else the coraek generic runner — every TS/JS
    // capability is isolatable without declaring anything.
    const attach = resolveIsolateAttach({ id, manifest, packageDir })
    if (!attach.custom && !isAutoIsolatable(manifest, packageDir, hostPackageDir())) {
      // No JS in-process part to move (a bundle / patch-yaml package) and
      // no custom bin: a stored isolate choice with nothing spawnable.
      results[id] = { ok: false, problem: "stored 'isolate' choice but the package has no spawnable entry (no JS in-process part, no aek.runtime.isolate.bin)" }
      continue
    }
    const declared = {
      protocol: 'aek-capability/1',
      name: id,
      version: typeof manifest.version === 'string' ? manifest.version : '0.0.0',
      ...(typeof block?.isolate?.spdx === 'string' && block.isolate.spdx.length > 0
        ? { spdx: block.isolate.spdx }
        : typeof manifest.license === 'string' ? { spdx: manifest.license } : {}),
      ...(typeof manifest.repository === 'string' ? { source: manifest.repository }
        : manifest.repository?.url !== undefined && typeof manifest.repository.url === 'string'
          ? { source: manifest.repository.url }
          : {}),
      capabilities: Array.isArray(manifest.aek?.capabilities) ? manifest.aek.capabilities : [{ id: 'web' }],
      // The custom bin stays a relative, shell-free name resolved against
      // `attach.cwd`; the generic runner is `node <absolute coraek path>` —
      // the command must be a relative executable name, the absolute path
      // travels as an argv token (the capability's own dir is `attach.cwd`,
      // so a relative command could not reach coraek's bin).
      attach: { kind: 'jsonrpc-stdio', command: attach.command, args: attach.args, cwd: attach.cwd },
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
