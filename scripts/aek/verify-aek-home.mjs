#!/usr/bin/env node
/**
 * Static enforcement: AEK source must never rebuild the data root by hand.
 *
 * Every package, CLI, bin bootstrap and host half resolves its data directory
 * through `@cheezmil/coraek/home` (`resolveAekHome` / `aekHomePath`). Re-deriving
 * `~/.aek` locally makes a second installation (AEK Next with `~/.aek-next`)
 * silently read and write the first installation's keys, skills and prompts.
 * The same rule covers hardcoded absolute paths: this repository ships to
 * users on every platform, so no machine-specific path may enter the source.
 *
 * This gate is READ-ONLY. It never writes, renames or deletes anything. A
 * non-zero exit means the build/typecheck chain must stop.
 *
 * Scope (AEK-authored code only — the faithfully copied dsh upstream is not
 * scanned): `packages/aek`, `apps/aek-web`, `apps/aek-desktop`, `scripts/aek`.
 *
 * Usage:
 *   node scripts/aek/verify-aek-home.mjs             # check, read-only
 *   node scripts/aek/verify-aek-home.mjs --json      # machine-readable
 *   node scripts/aek/verify-aek-home.mjs --selftest  # verify the gate itself
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)

const SCAN_ROOTS = ['packages/aek', 'apps/aek-web', 'apps/aek-desktop', 'scripts/aek']
const SKIP_DIRS = new Set([
  'node_modules', 'lib', 'dist', 'build', 'coverage', '.git', '.turbo',
  'types', 'test', 'tests', '__fixtures__', 'fixtures',
])
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|mjs|cjs|js|jsx)$/u

/** Files whose `.aek` literal is legitimate. Every entry needs a reason. */
const ALLOWED_FILES = new Set([
  // The single source of truth for the data root and its type surface.
  'packages/aek/base/coraek/home.mjs',
  'packages/aek/base/coraek/home.d.mts',
  // This gate itself contains the patterns it enforces.
  'scripts/aek/verify-aek-home.mjs',
  // The user-home gate holds sample paths as self-test fixtures.
  'scripts/aek/verify-user-paths.mjs',
  // Project-local prompt rules live under <project>/.aek/, derived from cwd —
  // that is a repository layout, not a user data root.
  'packages/aek/coraek-plugins/aek-prompt-manager/src/project-rules.js',
])

const AEK_DIR_LITERAL = /['"`]\.aek['"`]/u
const PATH_BUILDER = /\b(?:join|resolve|path\.join|path\.resolve|join\.apply)\s*\(/u
const HOME_SOURCE = /\b(?:homedir\s*\(|os\.homedir\s*\(|process\.env\.HOME\b)/u
const ABSOLUTE_PATH = /['"`](?:\/Users\/|\/home\/|\/System\/|\/Volumes\/|[A-Za-z]:[\\/])/u
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#)/u

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

const ROOT = findProjectRoot(HERE)

/** @param {string} dir @param {(path: string) => void} visit */
function walk(dir, visit) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, visit)
    else if (entry.isFile() && SOURCE_EXT.test(entry.name)) visit(full)
  }
}

/** @param {string} p @returns {string} */
function rel(p) {
  return relative(ROOT, p).split(sep).join('/')
}

/**
 * Check one source file. Exported for --selftest.
 * @param {string} relPath - repo-relative path (posix).
 * @param {string} text - file contents.
 * @returns {{ file: string, line: number, rule: string, text: string }[]}
 */
export function checkSource(relPath, text) {
  if (ALLOWED_FILES.has(relPath)) return []
  const lines = text.split(/\r?\n/u)
  const usesHomeSource = lines.some((line) => !COMMENT_LINE.test(line) && HOME_SOURCE.test(line))
  const found = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (COMMENT_LINE.test(line)) continue
    const trimmed = line.trim()
    if (AEK_DIR_LITERAL.test(line) && (PATH_BUILDER.test(line) || usesHomeSource)) {
      found.push({
        file: relPath, line: i + 1, rule: 'hardcoded-aek-home',
        text: trimmed.slice(0, 160),
      })
      continue
    }
    if (ABSOLUTE_PATH.test(line)) {
      found.push({
        file: relPath, line: i + 1, rule: 'hardcoded-absolute-path',
        text: trimmed.slice(0, 160),
      })
    }
  }
  return found
}

/** @returns {{ file: string, line: number, rule: string, text: string }[]} */
function scan() {
  const found = []
  for (const root of SCAN_ROOTS) {
    walk(join(ROOT, root), (file) => {
      if (file === SELF) return
      let text
      try { text = readFileSync(file, 'utf8') } catch { return }
      found.push(...checkSource(rel(file), text))
    })
  }
  return found
}

function selftest() {
  const shouldFail = [
    ["const DIR = join(homedir(), '.aek')", 'hardcoded-aek-home'],
    ["return join(process.env.HOME ?? '', '.aek', 'websearch')", 'hardcoded-aek-home'],
    ["const d = path.join(os.homedir(), '.aek', 'skill-manager')", 'hardcoded-aek-home'],
    ["const AEK_HOME = process.env.AEK_HOME ?? resolve(homedir(), '.aek')", 'hardcoded-aek-home'],
    ["const BASELINE = '/Users/someone/project'", 'hardcoded-absolute-path'],
  ]
  const shouldPass = [
    "return aekHomePath('websearch', 'providers.yml')",
    "import { resolveAekHome } from '@cheezmil/coraek/home'",
    "// docs: defaults to ~/.aek/skill-manager",
    "const hint = 'Leave empty for the default ~/.aek/skill-manager'",
    "const devDataDir = join(resolveAekHome(), 'desktop-dev')",
  ]
  const failures = []
  for (const [line, rule] of shouldFail) {
    const hits = checkSource('selftest/fixture.ts', line)
    if (!hits.some((h) => h.rule === rule)) failures.push(`missed: ${line}`)
  }
  for (const line of shouldPass) {
    const hits = checkSource('selftest/fixture.ts', line)
    if (hits.length > 0) failures.push(`false positive: ${line}`)
  }
  if (checkSource('packages/aek/base/coraek/home.mjs', "return join(homedir(), '.aek')").length > 0) {
    failures.push('allowlist did not protect the canonical implementation')
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(`selftest FAIL: ${f}`)
    process.exit(1)
  }
  console.log(`selftest OK: ${shouldFail.length} rejected, ${shouldPass.length} accepted, allowlist honored`)
}

const args = process.argv.slice(2)
if (args.includes('--selftest')) selftest()
else {
  const violations = scan()
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: violations.length === 0, scannedRoots: SCAN_ROOTS, violations }, null, 2))
  } else if (violations.length === 0) {
    console.log(`verify-aek-home: OK (${SCAN_ROOTS.join(', ')})`)
    console.log('All AEK data-root paths resolve through @cheezmil/coraek/home; no hardcoded absolute paths.')
  } else {
    console.error(`verify-aek-home: ${violations.length} violation(s)`)
    for (const v of violations) console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`)
    console.error('Fix: use resolveAekHome() / aekHomePath() from @cheezmil/coraek/home.')
    console.error('No source file may reconstruct the data root or embed a machine-specific path.')
  }
  process.exit(violations.length === 0 ? 0 : 1)
}
