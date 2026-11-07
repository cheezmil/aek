#!/usr/bin/env node
/**
 * Static enforcement: the AEK web frontend is React + Vite + TS + lightningcss,
 * and nothing else. Tailwind CSS (and the PostCSS / preprocessor / CSS-in-JS
 * toolchains it pulls in) must never enter `apps/web` or the AEK plugin layer.
 *
 * This is the code-level counterpart of the 2026-11-07 stack decision. It is
 * READ-ONLY: it never writes, renames, or deletes anything. Run it directly,
 * through `pnpm run verify:web-stack`, or as part of `check:all` / `hygiene`.
 *
 * Why this exists: the copied dsh client pipeline (`packages/client/tsdown.client.ts`)
 * compiles `*.module.css` with lightningcss and injects a hashed class map,
 * Vite minifies CSS with lightningcss by default, and PostCSS only runs when a
 * PostCSS config exists. Tailwind v4 needs either a PostCSS plugin or a separate
 * precompile step, so adding it would break a pipeline that already works.
 *
 * Scope (deliberately narrow — do not widen without a decision):
 *   - `apps/web/**`                 the Vite frontend shell
 *   - `packages/aek/**`             the AEK plugin / coraek layer
 *   - root `package.json`           workspace-level styling dependencies
 * `packages/aek-mcp/frontend` is a separate sibling subproject and is NOT in
 * scope; `packages/client/**` is faithfully copied upstream and is not in scope.
 *
 * Usage:
 *   node scripts/aek/verify-web-stack.mjs            # check, read-only
 *   node scripts/aek/verify-web-stack.mjs --json     # machine-readable
 *   node scripts/aek/verify-web-stack.mjs --selftest # verify the gate itself
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'lib', 'coverage', '.git', '.turbo', 'types', 'tests',
])
const SCAN_ROOTS = ['apps/web', 'packages/aek']
const SOURCE_EXT = /\.(?:ts|tsx|mjs|js|jsx|css|html)$/u
const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/** The declared stack, printed by the check for humans. */
export const ALLOWED_STACK = ['react', 'react-dom', 'vite', 'typescript', 'lightningcss', '@vitejs/plugin-react']

/**
 * Dependencies that bring a foreign styling pipeline. Each entry is
 * `[label, exact-name-or-pattern]`. Patterns are anchored, so a package whose
 * name merely contains "css" is never matched.
 * @type {ReadonlyArray<readonly [string, RegExp]>}
 */
const FORBIDDEN_DEPS = [
  ['Tailwind CSS core', /^tailwindcss$/u],
  ['Tailwind CSS v4 plugins', /^@tailwindcss\//u],
  ['Tailwind utility helpers', /^(?:tailwind-merge|tailwindcss-animate|tailwind-variants|daisyui)$/u],
  ['PostCSS (not used by this stack)', /^postcss$/u],
  ['PostCSS plugins', /^(?:autoprefixer|postcss-.+)$/u],
  ['CSS preprocessors', /^(?:sass|node-sass|sass-loader|less|less-loader|stylus|stylus-loader)$/u],
  ['CSS-in-JS runtimes', /^(?:styled-components|styled-jsx|@emotion\/.+|@linaria\/.+)$/u],
]

/** Config files that would switch Vite's CSS pipeline away from lightningcss. */
const FORBIDDEN_CONFIG = /^(?:postcss\.config\.[^/]*|tailwind\.config\.[^/]*)$/u

/**
 * Source-level evidence of a foreign pipeline. Comments and documentation are
 * intentionally not scanned: prose about Tailwind is allowed, real directives
 * and imports are not.
 * @type {ReadonlyArray<readonly [string, RegExp]>}
 */
const FORBIDDEN_SOURCE = [
  ['@tailwind directive', /@tailwind\s+(?:base|components|utilities|variants)\b/u],
  ['@apply directive', /@apply\s+[^;{]+;/u],
  ['@config pointing at Tailwind', /@config\s+['"][^'"]*tailwind/iu],
  [
    'import of a forbidden styling package',
    /(?:from\s*|import\s*\(?\s*|require\s*\(\s*|@import\s+)['"](?:tailwindcss|@tailwindcss\/[^'"]*|tailwind-merge|tailwindcss-animate|tailwind-variants|daisyui|postcss(?:-[^'"]*)?|autoprefixer|sass|less|stylus|styled-components|styled-jsx|@emotion\/[^'"]*|@linaria\/[^'"]*)['"]/u,
  ],
]

/** @param {string} start @returns {string} */
function findProjectRoot(start) {
  let dir = start
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}

/** @param {string} dir @param {(path: string) => void} visit */
function walk(dir, visit) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, visit)
    else if (entry.isFile()) visit(full)
  }
}

/** @param {string} file @returns {unknown} */
function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

/**
 * Scan one package manifest's dependency declarations.
 * @param {string} relPath @param {Record<string, unknown>} manifest
 * @returns {string[]} violations
 */
export function scanManifest(relPath, manifest) {
  const violations = []
  for (const key of DEP_KEYS) {
    const deps = manifest[key]
    if (deps === undefined || typeof deps !== 'object' || deps === null) continue
    for (const name of Object.keys(deps)) {
      for (const [label, pattern] of FORBIDDEN_DEPS) {
        if (!pattern.test(name)) continue
        violations.push(`${relPath}: ${key}.${JSON.stringify(name)} — ${label} is outside the React + Vite + TS + lightningcss stack`)
      }
    }
  }
  return violations
}

/**
 * Scan one source or config file's text.
 * @param {string} relPath @param {string} text
 * @returns {string[]} violations
 */
export function scanSourceText(relPath, text) {
  const violations = []
  for (const [label, pattern] of FORBIDDEN_SOURCE) {
    if (pattern.test(text)) violations.push(`${relPath}: ${label}`)
  }
  return violations
}

/**
 * Scan one file name for a foreign-pipeline config file.
 * @param {string} relPath
 * @returns {string[]} violations
 */
export function scanFileName(relPath) {
  return FORBIDDEN_CONFIG.test(basename(relPath))
    ? [`${relPath}: config file switches Vite's CSS pipeline; this stack uses lightningcss directly`]
    : []
}

/** @param {string} root @returns {{ violations: string[], stats: object }} */
function scanRepository(root) {
  const violations = []
  const stats = { manifests: 0, sourceFiles: 0, configFiles: 0 }

  const rootPkg = readJson(join(root, 'package.json'))
  if (rootPkg !== null && typeof rootPkg === 'object') {
    stats.manifests++
    violations.push(...scanManifest('package.json', rootPkg))
  }

  for (const scanRoot of SCAN_ROOTS) {
    const absolute = join(root, scanRoot)
    if (!existsSync(absolute)) continue
    walk(absolute, (file) => {
      const relPath = relative(root, file)
      if (file === SELF) return
      violations.push(...scanFileName(relPath))
      if (FORBIDDEN_CONFIG.test(basename(file))) stats.configFiles++
      if (basename(file) === 'package.json') {
        const manifest = readJson(file)
        if (manifest === null || typeof manifest !== 'object') return
        stats.manifests++
        violations.push(...scanManifest(relPath, manifest))
        return
      }
      if (!SOURCE_EXT.test(file)) return
      stats.sourceFiles++
      violations.push(...scanSourceText(relPath, readFileSync(file, 'utf8')))
    })
  }

  return { violations, stats }
}

/** Verify the gate itself rejects foreign tooling and accepts the declared stack. */
function selftest() {
  const failures = []
  const expectViolation = (label, found) => {
    if (found.length === 0) failures.push(`${label}: expected a violation, got none`)
  }
  const expectClean = (label, found) => {
    if (found.length !== 0) failures.push(`${label}: expected clean, got ${JSON.stringify(found)}`)
  }

  expectViolation('tailwindcss dependency', scanManifest('fixture/package.json', {
    devDependencies: { tailwindcss: '^4.0.0' },
  }))
  expectViolation('postcss plugin dependency', scanManifest('fixture/package.json', {
    devDependencies: { '@tailwindcss/postcss': '^4.0.0' },
  }))
  expectViolation('sass dependency', scanManifest('fixture/package.json', {
    devDependencies: { sass: '^1.0.0' },
  }))
  expectClean('declared stack', scanManifest('apps/web/package.json', {
    devDependencies: { react: '^18.2.0', vite: '^6.0.0', typescript: '^6.0.0', lightningcss: '^1.33.0' },
    dependencies: { '@vitejs/plugin-react': '^4.7.0' },
  }))
  expectClean('unrelated package name', scanManifest('fixture/package.json', {
    dependencies: { 'css-tree': '^3.0.0', 'react-dom': '^18.2.0' },
  }))

  expectViolation('@tailwind directive', scanSourceText('fixture.css', '@tailwind base;'))
  expectViolation('@apply directive', scanSourceText('fixture.css', '.x { @apply flex p-4; }'))
  expectViolation('tailwind import', scanSourceText('fixture.ts', `import x from 'tailwindcss'`))
  expectViolation('postcss import', scanSourceText('fixture.ts', `import postcss from 'postcss'`))
  expectClean('CSS Modules import', scanSourceText('Home.tsx', `import css from './Home.module.css'`))
  expectClean('lightningcss usage', scanSourceText('katex-fonts.ts', `import { transform } from 'lightningcss'`))
  expectClean('prose mentioning Tailwind', scanSourceText('notes.ts', '// Tailwind is not used here'))

  expectViolation('postcss config file', scanFileName('apps/web/postcss.config.cjs'))
  expectViolation('tailwind config file', scanFileName('apps/web/tailwind.config.ts'))
  expectClean('vite config file', scanFileName('apps/web/vite.config.ts'))
  expectClean('CSS Modules file', scanFileName('apps/web/src/Home.module.css'))

  for (const name of ALLOWED_STACK) {
    let blocked = false
    for (const [, pattern] of FORBIDDEN_DEPS) {
      if (pattern.test(name)) blocked = true
    }
    if (blocked) failures.push(`declared stack member ${JSON.stringify(name)} is blocked by the gate`)
  }
  return failures
}

function main() {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  if (args.includes('--selftest')) {
    const failures = selftest()
    if (failures.length > 0) {
      console.error('aek web stack selftest: FAIL')
      for (const failure of failures) console.error(`  - ${failure}`)
      process.exit(1)
    }
    console.log('aek web stack selftest: OK')
    return
  }

  const root = findProjectRoot(HERE)
  const { violations, stats } = scanRepository(root)
  const ok = violations.length === 0

  if (asJson) {
    console.log(JSON.stringify({ ok, allowedStack: ALLOWED_STACK, violations, stats }, null, 2))
  } else {
    console.log(`aek web frontend stack: ${ok ? 'OK' : 'FAIL'}`)
    console.log(`  stack: ${ALLOWED_STACK.join(' + ')}`)
    console.log(`  scanned ${stats.manifests} manifests, ${stats.sourceFiles} source files, ${stats.configFiles} foreign config files`)
    for (const line of violations) console.error(`  - ${line}`)
    if (!ok) console.error('\nUse CSS Modules (*.module.css) compiled by lightningcss; do not add Tailwind/PostCSS/preprocessors.')
  }
  process.exit(ok ? 0 : 1)
}

main()
