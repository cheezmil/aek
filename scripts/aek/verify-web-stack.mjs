#!/usr/bin/env node
/**
 * Static enforcement: the AEK web frontend stack is React + Vite + TS +
 * Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui (open-code components) +
 * `@shadcn/lint` (agent-first design-system rules via the repo's oxlint).
 * Nothing else — no PostCSS pipeline, no CSS preprocessors, no CSS-in-JS
 * runtimes, no Tailwind v3-era tooling. CSS Modules residue is policed by
 * `verify-console-css.mjs`; this gate polices the stack itself.
 *
 * Decision history:
 *   - 2026-11-07: the stack was pinned to "React + Vite + TS + lightningcss,
 *     no Tailwind / PostCSS / runtime styling" and this gate enforced it.
 *   - 2026-11-17 (FF round): the user overruled that decision — the console
 *     moves to Tailwind CSS v4 + shadcn/ui + @shadcn/lint, so this gate was
 *     rewritten to the new allowed stack. The 11-07 prose ("no Tailwind") in
 *     `apps/aek-web/vite.config.ts` and in `references/20261107-前端技术栈订正.md`
 *     (dev notes) is superseded.
 *
 * READ-ONLY: it never writes, renames, or deletes anything. Run it directly,
 * through `pnpm run verify:web-stack`, or as part of `check:all` / `hygiene`.
 *
 * Why this still exists: the FF stack decision must stay machine-enforced,
 * not prose. The gate (a) rejects foreign pipelines (PostCSS, preprocessors,
 * CSS-in-JS, Tailwind v3-era tooling) at the dependency / config / source
 * level, and (b) proves both faces with its selftest.
 *
 * Scope (deliberately narrow — do not widen without a decision):
 *   - `apps/aek-web/**`            the AEK console (standalone Vite SPA)
 *   - `packages/aek/**`            the AEK plugin / coraek layer
 *   - root `package.json`          workspace-level styling dependencies
 * `packages/client/**` is faithfully copied upstream and is not in scope.
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
const SCAN_ROOTS = ['apps/aek-web', 'packages/aek']
const SOURCE_EXT = /\.(?:ts|tsx|mjs|js|jsx|css|html)$/u
const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/** The declared stack, printed by the check for humans. */
export const ALLOWED_STACK = [
  'react', 'react-dom', 'vite', 'typescript', '@vitejs/plugin-react',
  'tailwindcss', '@tailwindcss/vite', '@shadcn/lint',
  'cn', 'radix-ui', 'shadcn', 'tw-animate-css',
  'class-variance-authority', 'lucide-react',
]

/**
 * Dependencies that bring a foreign styling pipeline or a pipeline regression.
 * Each entry is `[label, exact-name-or-pattern]`. Patterns are anchored, so a
 * package whose name merely contains "css" is never matched. The shadcn/ui
 * runtime companions (clsx / tailwind-merge / class-variance-authority /
 * lucide-react / Radix or Base UI primitives) are part of the declared stack
 * and are NOT listed here.
 * @type {ReadonlyArray<readonly [string, RegExp]>}
 */
const FORBIDDEN_DEPS = [
  ['Tailwind v3-era plugins (v4 configures via CSS `@theme`)', /^(?:tailwindcss-animate|tailwind-variants|daisyui)$/u],
  ['Tailwind v4 PostCSS pipeline (the stack builds with `@tailwindcss/vite`)', /^@tailwindcss\/postcss$/u],
  ['Tailwind v4 runtime browser package', /^@tailwindcss\/browser$/u],
  ['PostCSS (not used by this stack)', /^postcss$/u],
  ['PostCSS plugins', /^(?:autoprefixer|postcss-.+)$/u],
  ['CSS preprocessors', /^(?:sass|node-sass|sass-loader|less|less-loader|stylus|stylus-loader)$/u],
  ['CSS-in-JS runtimes', /^(?:styled-components|styled-jsx|@emotion\/.+|@linaria\/.+|@vanilla-extract\/.+|stylex)$/u],
]

/** Config files that would switch the pipeline back to a foreign stack. */
const FORBIDDEN_CONFIG = /^(?:postcss\.config\.[^/]*|tailwind\.config\.[^/]*)$/u

/**
 * Source-level evidence of a foreign pipeline. Comments and documentation are
 * intentionally not scanned: prose about Tailwind is allowed, real v3-era
 * directives and forbidden imports are not.
 * @type {ReadonlyArray<readonly [string, RegExp]>}
 */
const FORBIDDEN_SOURCE = [
  ['Tailwind v3 `@tailwind` directive (v4 uses `@import "tailwindcss"`)', /@tailwind\s+(?:base|components|utilit(?:ies)?|variants)\b/u],
  ['`@config` pointing at a Tailwind config file (v3-era)', /@config\s+['"][^'"]*tailwind/iu],
  [
    'import of a forbidden styling package',
    /(?:from\s*|import\s*\(?\s*|require\s*\(\s*|@import\s+)['"](?:postcss(?:-[^'"]*)?|autoprefixer|sass|node-sass|less|stylus|styled-components|styled-jsx|@emotion\/[^'"]*|@linaria\/[^'"]*|@vanilla-extract\/[^'"]*|stylex|@tailwindcss\/postcss|@tailwindcss\/browser|tailwindcss-animate|tailwind-variants|daisyui)['"]/u,
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
        violations.push(`${relPath}: ${key}.${JSON.stringify(name)} — ${label} is outside the FF stack (React + Vite + TS + Tailwind v4 + shadcn/ui + @shadcn/lint)`)
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
    ? [`${relPath}: config file belongs to a foreign / v3-era pipeline; the FF stack builds Tailwind v4 through @tailwindcss/vite with CSS-first configuration`]
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

  // Declared stack members must pass the manifest scan.
  expectClean('FF stack dependencies', scanManifest('apps/aek-web/package.json', {
    dependencies: {
      react: '^18.2.0', 'react-dom': '^18.2.0',
      'class-variance-authority': '^0.7.0',
      cn: '^0.5.0', 'radix-ui': '^1.8.0', shadcn: '^4.0.0',
      'tw-animate-css': '^1.0.0', 'lucide-react': '^1.0.0',
    },
    devDependencies: {
      vite: '^6.4.0', typescript: '^6.0.0', '@vitejs/plugin-react': '^4.7.0',
      tailwindcss: '^4.0.0', '@tailwindcss/vite': '^4.0.0', '@shadcn/lint': '^0.2.0',
    },
  }))
  expectClean('unrelated package name', scanManifest('fixture/package.json', {
    dependencies: { 'css-tree': '^3.0.0' },
  }))

  // Foreign pipelines must be rejected at the dependency level.
  for (const [key, deps] of [
    ['postcss dependency', { devDependencies: { postcss: '^8.4.0' } }],
    ['autoprefixer dependency', { devDependencies: { autoprefixer: '^10.4.0' } }],
    ['sass dependency', { devDependencies: { sass: '^1.0.0' } }],
    ['tailwind v3-era plugin', { devDependencies: { daisyui: '^4.0.0' } }],
    ['tailwind v4 postcss plugin', { devDependencies: { '@tailwindcss/postcss': '^4.0.0' } }],
    ['tailwind v4 browser runtime', { dependencies: { '@tailwindcss/browser': '^4.0.0' } }],
    ['css-in-js runtime', { dependencies: { 'styled-components': '^6.0.0' } }],
  ]) {
    expectViolation(key, scanManifest('fixture/package.json', deps))
  }

  // Source level: v3-era directives and forbidden imports are violations;
  // the FF stack's own CSS/TS constructs are clean.
  expectViolation('tailwind v3 directive', scanSourceText('fixture.css', '@tailwind base;'))
  expectViolation('tailwind v3 @config', scanSourceText('fixture.css', `@config '../../../tailwind.config.js';`))
  expectViolation('postcss import', scanSourceText('fixture.ts', `import postcss from 'postcss'`))
  expectClean('tailwind v4 css import', scanSourceText('index.css', '@import "tailwindcss";'))
  expectClean('tailwind v4 theme block', scanSourceText('index.css', '@theme { --color-primary: oklch(0.5 0.2 250); }'))
  expectClean('tailwind vite plugin import', scanSourceText('vite.config.ts', `import tailwindcss from '@tailwindcss/vite'`))
  expectClean('shadcn lint in oxlint config', scanSourceText('.oxlintrc.json', '{"jsPlugins": ["@shadcn/lint"]}'))
  expectClean('prose mentioning Tailwind', scanSourceText('notes.ts', '// Tailwind v4 is the FF-round stack'))

  // Config file level.
  expectViolation('postcss config file', scanFileName('apps/aek-web/postcss.config.cjs'))
  expectViolation('tailwind v3 config file', scanFileName('apps/aek-web/tailwind.config.ts'))
  expectClean('vite config file', scanFileName('apps/aek-web/vite.config.ts'))
  expectClean('plain css file', scanFileName('apps/aek-web/src/index.css'))

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
    console.log(`aek web frontend stack (FF round): ${ok ? 'OK' : 'FAIL'}`)
    console.log(`  stack: ${ALLOWED_STACK.join(' + ')}`)
    console.log(`  scanned ${stats.manifests} manifests, ${stats.sourceFiles} source files, ${stats.configFiles} foreign config files`)
    for (const line of violations) console.error(`  - ${line}`)
    if (!ok) console.error('\nUse the FF stack: Tailwind CSS v4 via `@tailwindcss/vite` + shadcn/ui + @shadcn/lint; do not add PostCSS / preprocessors / CSS-in-JS / v3-era tooling.')
  }
  process.exit(ok ? 0 : 1)
}

main()
