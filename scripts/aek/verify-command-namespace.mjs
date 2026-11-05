#!/usr/bin/env node
/**
 * Static enforcement: no `dsh`-prefixed command may operate the plugins in
 * `packages/`.
 *
 * This is the code-level counterpart of the rule in AGENTS.md / the dev notes.
 * It is READ-ONLY: it never writes, renames, or deletes anything. Run it
 * directly, through `pnpm run verify-command-namespace`, or as part of
 * `check:all`. A non-zero exit means a forbidden operator surface exists.
 *
 * What counts as an operator surface (and nothing else — the copied upstream
 * contains thousands of unrelated `dsh` strings in docs, manifest fields and
 * test fixtures, and rewriting those is both wrong and a merge liability):
 *   1. `packages/<group>/<pkg>/package.json` -> `bin` names
 *   2. root `package.json` -> `scripts` names and the commands they invoke
 *   3. every .mjs under `scripts/aek` and every .ts/.mjs/.js under
 *      `packages/aek` -> process launcher calls (spawn / exec / execFile)
 *
 * Usage:
 *   node scripts/aek/verify-command-namespace.mjs            # check, read-only
 *   node scripts/aek/verify-command-namespace.mjs --json     # machine-readable
 *   node scripts/aek/verify-command-namespace.mjs --selftest # verify the gate itself
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AEK_COMMAND_PREFIX,
  FORBIDDEN_COMMAND_PREFIXES,
  FORBIDDEN_COMMAND_HINT,
  commandName,
  isForbiddenDshCommand,
  isAekCommand,
} from './command-namespace.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'lib', 'coverage', '.git', '.turbo', 'types',
])
const SOURCE_EXT = /\.(?:ts|mjs|js)$/u
const LAUNCHER_CALL = /\b(?:spawn|spawnSync|exec|execSync|execFileSync|execFile)\s*\(\s*(['"`])([\s\S]*?)\1/gu
const SHELL_WRAPPERS = new Set(['pnpm', 'npm', 'npx', 'yarn', 'node', 'tsx', 'bash', 'sh', 'env'])

/**
 * Bins belonging to the faithfully copied upstream, not to an AEK plugin.
 * They are reported but do not fail the gate. Any NEW entry must be added
 * here explicitly with a reason — an undeclared dsh bin fails the gate.
 */
const ALLOWED_LEGACY_UPSTREAM_BINS = new Set([
  'dsh-pack-vfs-image', // @deepseek-ai/dsh-experimental-webworker-packer (upstream copy)
])

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

/** @param {string} name @returns {boolean} */
function isForbiddenBin(name) {
  return isForbiddenDshCommand(name)
}

/**
 * Scan one package manifest's `bin` declarations.
 * @param {string} relPath @param {Record<string, unknown>} manifest
 * @returns {{ violations: string[], legacy: string[] }}
 */
export function scanPackageManifest(relPath, manifest) {
  const violations = []
  const legacy = []
  const bin = manifest.bin
  const names = typeof bin === 'string'
    ? [(manifest.name ?? '').split('/').pop() ?? ''].filter(Boolean)
    : (bin && typeof bin === 'object' ? Object.keys(bin) : [])
  for (const name of names) {
    if (!isForbiddenBin(name)) continue
    if (ALLOWED_LEGACY_UPSTREAM_BINS.has(name)) {
      legacy.push(`${relPath}: bin ${JSON.stringify(name)} (declared upstream copy)`)
    } else {
      violations.push(
        `${relPath}: bin ${JSON.stringify(name)} is a forbidden dsh-prefixed command; ${FORBIDDEN_COMMAND_HINT}`,
      )
    }
  }
  return { violations, legacy }
}

/**
 * Scan the root package's npm scripts (names and invoked commands).
 * @param {Record<string, string>} scripts
 * @returns {{ violations: string[], legacy: string[] }}
 */
export function scanRootScripts(scripts) {
  const violations = []
  const legacy = []
  for (const [name, value] of Object.entries(scripts ?? {})) {
    if (isForbiddenBin(name)) {
      violations.push(
        `package.json: script ${JSON.stringify(name)} is a forbidden dsh-prefixed command; ${FORBIDDEN_COMMAND_HINT}`,
      )
    }
    // Each shell segment: check the command itself and, for a wrapper such as
    // `pnpm dsh web`, the next non-flag token that the wrapper will invoke.
    for (const segment of String(value).split(/&&|\|\||;|\|/u)) {
      const tokens = segment.trim().split(/\s+/u).filter(Boolean)
      if (tokens.length === 0) continue
      const candidates = [tokens[0]]
      if (SHELL_WRAPPERS.has(commandName(tokens[0]))) {
        const next = tokens.slice(1).find(token => !token.startsWith('-'))
        if (next) candidates.push(next)
      }
      for (const candidate of candidates) {
        if (!isForbiddenBin(candidate)) continue
        violations.push(
          `package.json: script ${JSON.stringify(name)} invokes ${JSON.stringify(candidate)}; ${FORBIDDEN_COMMAND_HINT}`,
        )
      }
    }
  }
  return { violations, legacy }
}

/**
 * Scan process-launcher calls in one source file.
 * @param {string} relPath @param {string} text
 * @returns {{ violations: string[], legacy: string[] }}
 */
export function scanSourceText(relPath, text) {
  const violations = []
  const legacy = []
  for (const match of text.matchAll(LAUNCHER_CALL)) {
    const literal = match[2]
    if (!isForbiddenBin(literal)) continue
    violations.push(
      `${relPath}: launcher call runs ${JSON.stringify(literal.trim())}; ${FORBIDDEN_COMMAND_HINT}`,
    )
  }
  return { violations, legacy }
}

/** @param {string} root @returns {{ violations: string[], legacy: string[], stats: object }} */
function scanRepository(root) {
  const violations = []
  const legacy = []
  const stats = { packageManifests: 0, rootScripts: 0, sourceFiles: 0 }

  walk(join(root, 'packages'), (file) => {
    if (basename(file) !== 'package.json') return
    const manifest = readJson(file)
    if (!manifest || typeof manifest !== 'object') return
    stats.packageManifests++
    const found = scanPackageManifest(relative(root, file), manifest)
    violations.push(...found.violations)
    legacy.push(...found.legacy)
  })

  const rootPkg = readJson(join(root, 'package.json'))
  if (rootPkg && typeof rootPkg === 'object') {
    const scripts = rootPkg.scripts ?? {}
    stats.rootScripts = Object.keys(scripts).length
    const found = scanRootScripts(scripts)
    violations.push(...found.violations)
    legacy.push(...found.legacy)
  }

  for (const sourceRoot of [join(root, 'scripts', 'aek'), join(root, 'packages', 'aek')]) {
    if (!existsSync(sourceRoot)) continue
    walk(sourceRoot, (file) => {
      if (!SOURCE_EXT.test(file) || file === SELF) return
      stats.sourceFiles++
      const found = scanSourceText(relative(root, file), readFileSync(file, 'utf8'))
      violations.push(...found.violations)
      legacy.push(...found.legacy)
    })
  }

  return { violations, legacy, stats }
}

/** Verify the gate itself rejects forbidden and accepts legal commands. */
function selftest() {
  const cases = [
    ['dsh', true], ['dsh web', true], ['dsh plugin install', true],
    ['dsh-pack-vfs-image', true], ['/usr/bin/dsh-helper', true], ['DSH', true],
    ['aek', false], ['aek web', false], ['aekws status', false],
    ['aekpm status', false], ['aeksm doctor', false],
    ['node apps/cli/lib/bin.js', false], ['@deepseek-ai/dsh-desktop', false], ['', false],
  ]
  const failures = []
  for (const [input, expected] of cases) {
    if (isForbiddenDshCommand(input) !== expected) {
      failures.push(`isForbiddenDshCommand(${JSON.stringify(input)}) != ${expected}`)
    }
  }
  if (!isAekCommand('aek web') || isForbiddenDshCommand('aek web')) {
    failures.push('aek web must be legal')
  }
  const manifest = scanPackageManifest('fixture/package.json', {
    name: '@cheezmil/aek-fixture', bin: { 'dsh-fixture': 'bin/x.mjs' },
  })
  if (manifest.violations.length !== 1) {
    failures.push('synthetic dsh bin must produce exactly one violation')
  }
  const scripts = scanRootScripts({ dsh: 'node apps/cli/src/bin.ts' })
  if (scripts.violations.length === 0) {
    failures.push('synthetic root dsh script must be rejected')
  }
  // Build the fixture at runtime so this gate never flags its own source.
  const source = scanSourceText('fixture.mjs', `spawn(${JSON.stringify('d' + 'sh')}, ['web'])`)
  if (source.violations.length === 0) {
    failures.push('synthetic dsh launcher call must be rejected')
  }
  return failures
}

function main() {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  if (args.includes('--selftest')) {
    const failures = selftest()
    if (failures.length > 0) {
      console.error('aek command namespace selftest: FAIL')
      for (const failure of failures) console.error(`  - ${failure}`)
      process.exit(1)
    }
    console.log('aek command namespace selftest: OK')
    return
  }

  const root = findProjectRoot(HERE)
  const { violations, legacy, stats } = scanRepository(root)
  const ok = violations.length === 0

  if (asJson) {
    console.log(JSON.stringify({ ok, violations, legacy, stats }, null, 2))
  } else {
    console.log(`aek command namespace: ${ok ? 'OK' : 'FAIL'}`)
    console.log(
      `  scanned ${stats.packageManifests} package manifests, ${stats.rootScripts} root scripts, ${stats.sourceFiles} AEK source files`,
    )
    console.log(`  legal prefix: ${JSON.stringify(AEK_COMMAND_PREFIX)}; forbidden: ${FORBIDDEN_COMMAND_PREFIXES.join(', ')}`)
    for (const line of legacy) console.log(`  legacy (reported, not a violation): ${line}`)
    for (const line of violations) console.error(`  - ${line}`)
    if (!ok) console.error(`\n${FORBIDDEN_COMMAND_HINT}`)
  }
  process.exit(ok ? 0 : 1)
}

main()
