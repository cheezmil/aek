/**
 * AEK plugin metadata — ONE reader for classification and language detection.
 *
 * Two hard rules live here (and nowhere else):
 *
 *   1. Every AEK package MUST declare `aek.distribution` as exactly `A1`
 *      (published to the internet for global use) or `A2` (local use only).
 *      There is NO third class and NO default. An undeclared plugin does not
 *      get a fallback — it fails the build. A2 packages are excluded from
 *      every npm / release publish path.
 *   2. The class may only be changed by an explicit, confirmed user action.
 *      This module is READ-ONLY; `scripts/aek/plugin-class.mjs` owns writes
 *      and its audit log.
 *
 * Language detection is deliberately cheap: it reads directory entries and
 * file EXTENSIONS only. It never opens a source file, never parses a manifest
 * dependency tree, and stops after a bounded number of files. That is what
 * makes it safe to call from the About page on every request.
 *
 * No absolute path is hardcoded. Callers pass the repository root they are
 * running in; the module itself works on any checkout, on any OS.
 *
 * @module @cheezmil/coraek/plugin-meta
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'

/** The only two legal audience classes. */
export const PLUGIN_CLASSES = /** @type {const} */ (['A1', 'A2'])

/** Manifest key holding the audience class. */
export const DISTRIBUTION_KEY = 'distribution'

/** Human-readable meaning of each class (used by gates and the About page). */
export const CLASS_LABELS = /** @type {const} */ ({
  A1: 'public — may be published to npm / release',
  A2: 'local only — MUST be excluded from every publish',
})

/** Directories that never hold hand-written source. */
const SKIP_DIRS = new Set([
  'node_modules', 'lib', 'dist', 'build', 'out', 'coverage', '.git',
  'skills', 'docs', 'licenses', 'snapshots', '__snapshots__',
])

/** Directories that DO hold hand-written source, relative to a package root. */
const SOURCE_DIRS = ['src', 'client', 'bin', 'scripts', 'native', 'python', 'server']

/** Extension → language. Ordered so the first match wins for a file. */
const LANGUAGE_BY_EXT = new Map(Object.entries({
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JavaScript',
  '.go': 'Go', '.py': 'Python', '.rs': 'Rust', '.rb': 'Ruby', '.java': 'Java',
  '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell',
  '.css': 'CSS', '.scss': 'CSS', '.sass': 'CSS',
  '.vue': 'Vue', '.svelte': 'Svelte', '.html': 'HTML',
}))

/** Languages that describe styling/markup rather than a plugin's base stack. */
const AUX_LANGUAGES = new Set(['CSS', 'HTML', 'Shell'])

/** Hard bounds — the scan must stay cheap even in a huge checkout. */
const MAX_FILES = 300
const MAX_DEPTH = 3
const CACHE_TTL_MS = 60_000

/** @type {Map<string, { at: number, value: LanguageScan }>} */
const languageCache = new Map()

/**
 * @typedef {object} LanguageScan
 * @property {string[]} languages - every detected language, by file count desc.
 * @property {string} primary - the main implementation language.
 * @property {number} files - number of source files counted.
 * @property {boolean} truncated - true when the file cap was reached.
 */

/**
 * @typedef {object} PluginClass
 * @property {'A1' | 'A2' | ''} value - the declared class, empty when absent.
 * @property {boolean} ok - whether the declaration is legal.
 * @property {'missing' | 'invalid' | ''} reason - why it is not ok.
 */

/**
 * Read the declared class out of a parsed package.json.
 * @param {Record<string, unknown>} manifest - parsed package.json.
 * @returns {PluginClass} the class and its validity.
 */
export function pluginClassOf(manifest) {
  const aek = manifest.aek
  const declared = aek && typeof aek === 'object' && !Array.isArray(aek)
    ? /** @type {Record<string, unknown>} */ (aek)[DISTRIBUTION_KEY]
    : undefined
  if (declared === undefined || declared === null || declared === '') {
    return { value: '', ok: false, reason: 'missing' }
  }
  if (declared === 'A1' || declared === 'A2') {
    return { value: declared, ok: true, reason: '' }
  }
  return { value: String(declared), ok: false, reason: 'invalid' }
}

/**
 * Explain a bad declaration in a way a developer can act on.
 * @param {PluginClass} result - result of `pluginClassOf`.
 * @param {string} packageName - package name for the message.
 * @returns {string} friendly, actionable text.
 */
export function classViolationMessage(result, packageName) {
  const where = `${packageName}: package.json → aek.distribution`
  if (result.reason === 'invalid') {
    return `${where} is '${result.value}' — only 'A1' (public) or 'A2' (local only) are allowed.`
  }
  return `${where} is MISSING. Every AEK package must declare its audience: ` +
    `'A1' = will be published to npm / release for global use, ` +
    `'A2' = local use only and MUST be excluded from every publish. ` +
    `There is no default and no third class.`
}

/**
 * Detect a package's implementation languages without opening any file.
 *
 * @param {string} packageDir - absolute path of one package.
 * @param {{ now?: number }} [options] - clock override for tests.
 * @returns {LanguageScan} detected languages.
 */
export function scanLanguages(packageDir, options = {}) {
  const now = options.now ?? Date.now()
  const cached = languageCache.get(packageDir)
  if (cached !== undefined && now - cached.at < CACHE_TTL_MS) return cached.value

  /** @type {Map<string, number>} */
  const counts = new Map()
  let files = 0
  let truncated = false

  const visit = (dir, depth) => {
    if (truncated || depth > MAX_DEPTH) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (files >= MAX_FILES) { truncated = true; return }
      if (entry.name.startsWith('.') && entry.name !== '.mjs') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        visit(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const dot = entry.name.lastIndexOf('.')
      if (dot === -1) continue
      const language = LANGUAGE_BY_EXT.get(entry.name.slice(dot).toLowerCase())
      if (language === undefined) continue
      files += 1
      counts.set(language, (counts.get(language) ?? 0) + 1)
    }
  }

  // Prefer real source roots; fall back to the package root so a tiny plugin
  // with everything at top level is still detected.
  const roots = SOURCE_DIRS.map(name => join(packageDir, name))
  let foundAny = false
  for (const root of roots) {
    try { if (statSync(root).isDirectory()) foundAny = true } catch { /* absent */ }
    visit(root, 0)
  }
  if (!foundAny) visit(packageDir, 0)

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const value = {
    languages: sorted.map(([name]) => name),
    primary: sorted.find(([name]) => !AUX_LANGUAGES.has(name))?.[0] ?? sorted[0]?.[0] ?? 'unknown',
    files,
    truncated,
  }
  languageCache.set(packageDir, { at: now, value })
  return value
}

/** Forget cached language scans (tests / after a source change). */
export function clearLanguageCache() {
  languageCache.clear()
}

/**
 * @typedef {object} PluginMeta
 * @property {string} id - directory name of the package.
 * @property {string} dir - repository-relative package directory (posix).
 * @property {string} packageName - name from package.json.
 * @property {string} version - version from package.json.
 * @property {boolean} private - the npm `private` flag.
 * @property {PluginClass} distribution - declared class and validity.
 * @property {LanguageScan} languages - detected implementation languages.
 * @property {string} description - package description.
 */

/**
 * Walk `packages/aek/**` for every package.json. Bounded, skips build output.
 * @param {string} repoRoot - absolute repository root.
 * @returns {string[]} repository-relative package directories, sorted.
 */
export function findAekPackageDirs(repoRoot) {
  const base = join(repoRoot, 'packages', 'aek')
  /** @type {string[]} */
  const found = []
  const visit = (dir, depth) => {
    if (depth > 6 || found.length > 100) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    if (entries.some(entry => entry.isFile() && entry.name === 'package.json')) {
      found.push(relative(repoRoot, dir).split(sep).join('/'))
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      visit(join(dir, entry.name), depth + 1)
    }
  }
  visit(base, 0)
  return found.sort()
}

/**
 * Read every AEK package's metadata (classification + languages).
 * @param {string} repoRoot - absolute repository root.
 * @param {{ now?: number, languages?: boolean }} [options] - scan controls.
 * @returns {PluginMeta[]} one entry per package, sorted by directory.
 */
export function readPluginMeta(repoRoot, options = {}) {
  return findAekPackageDirs(repoRoot).map((dir) => {
    const abs = join(repoRoot, ...dir.split('/'))
    let manifest = /** @type {Record<string, unknown>} */ ({})
    try { manifest = JSON.parse(readFileSync(join(abs, 'package.json'), 'utf8')) } catch { /* missing */ }
    const scan = options.languages === false
      ? { languages: [], primary: 'unknown', files: 0, truncated: false }
      : scanLanguages(abs, options)
    return {
      id: basename(dir),
      dir,
      packageName: typeof manifest.name === 'string' ? manifest.name : basename(dir),
      version: typeof manifest.version === 'string' ? manifest.version : '',
      private: manifest.private === true,
      distribution: pluginClassOf(manifest),
      languages: scan,
      description: typeof manifest.description === 'string' ? manifest.description : '',
    }
  })
}

/**
 * Assert the classification rule for the whole tree.
 * @param {string} repoRoot - absolute repository root.
 * @returns {{ ok: boolean, violations: string[], packages: PluginMeta[] }} result.
 */
export function checkPluginClasses(repoRoot) {
  const packages = readPluginMeta(repoRoot, { languages: false })
  const violations = packages
    .filter(pkg => !pkg.distribution.ok)
    .map(pkg => classViolationMessage(pkg.distribution, pkg.packageName))
  return { ok: violations.length === 0, violations, packages }
}

/**
 * Packages that a publish path is ALLOWED to include.
 *
 * A2 is excluded unconditionally, even when someone forgot `private: true`.
 * An undeclared package is excluded too, so a broken manifest can never be
 * published by accident.
 * @param {string} repoRoot - absolute repository root.
 * @returns {PluginMeta[]} publishable packages.
 */
export function publishablePlugins(repoRoot) {
  return readPluginMeta(repoRoot, { languages: false })
    .filter(pkg => pkg.distribution.ok && pkg.distribution.value === 'A1' && !pkg.private)
}
