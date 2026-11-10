#!/usr/bin/env node
/**
 * Repo-wide gate: no AEK-authored file may contain a real user's home directory.
 *
 * AEK ships to users on macOS, Linux and Windows. A path like
 * `/Users/<someone>` or `C:\Users\<someone>` inside the tree is always a
 * mistake, no matter where it hides:
 *   - in code it makes the file machine-specific;
 *   - in a comment or doc it leaks one developer's account name into every
 *     fork, screenshot and translation;
 *   - in a test fixture it bakes that account into the repository forever;
 *   - in a generated template it is copied into every user's data directory.
 *
 * `verify-aek-home.mjs` cannot cover this: it only rejects hardcoded data-root
 * builders, skips comments, and skips `test`/`tests`. This gate reads every
 * plain-text file in the AEK-owned tree, comments included.
 *
 * Scope: `packages/aek`, `scripts/aek`, `apps/web`, `apps/aek-desktop`, plus the
 * repository root files. The faithfully copied dsh upstream is NOT part of the
 * gate — its fixtures legitimately use names like `/home/node` or
 * `C:\Users\runneradmin`. `--all` scans the whole tree for a manual review and
 * only fails with `--strict`.
 *
 * Placeholders are expected and allowed: `<user>`, `~`, `$HOME`, `%USERPROFILE%`,
 * `user`, `me`, `test`, `tester`, `fixture`, `mock`, `alice`, `node`, …
 * The allowlist is a literal Set on purpose — a fuzzy "looks like a username"
 * rule either misses real names or rejects legitimate documentation.
 *
 * Read-only. Non-zero exit means the check must fail the build.
 *
 * Usage:
 *   node scripts/aek/verify-user-paths.mjs            # AEK-owned tree, gate
 *   node scripts/aek/verify-user-paths.mjs --all      # whole repo, advisory
 *   node scripts/aek/verify-user-paths.mjs --artifacts # also scan built artifacts
 *   node scripts/aek/verify-user-paths.mjs --all --strict
 *   node scripts/aek/verify-user-paths.mjs --json
 *   node scripts/aek/verify-user-paths.mjs --selftest
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)

/** Directories that hold generated or third-party output, never hand-written text. */
const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', '.turbo', '.next', '.nuxt', '.cache', '.venv', 'venv',
  'node_modules', 'lib', 'lib-cjs', 'dist', 'build', 'out', 'output', 'coverage',
  'target', 'bin', 'obj', 'vendor', '__pycache__', '.idea', '.vscode-test',
])

/** Extensions we treat as text. Anything else is skipped without reading. */
const TEXT_EXT = new Set([
  '.c', '.cc', '.cfg', '.cjs', '.conf', '.cpp', '.css', '.cts', '.diff', '.env',
  '.fish', '.go', '.gradle', '.h', '.hpp', '.htm', '.html', '.ini', '.java',
  '.js', '.json', '.json5', '.jsonc', '.jsx', '.kt', '.kts', '.md', '.mdx',
  '.mjs', '.mts', '.patch', '.plist', '.properties', '.ps1', '.py', '.rb',
  '.rs', '.scss', '.sh', '.sql', '.svelte', '.swift', '.toml', '.ts', '.tsx',
  '.txt', '.vue', '.xml', '.yaml', '.yml', '.zsh',
])

/** Files that are generated, hashed or contain unrelated high-entropy data. */
const SKIP_FILES = new Set([
  'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb',
  'Cargo.lock', 'go.sum', 'poetry.lock', 'composer.lock',
])

/** Names that are placeholders or service accounts, not people. Lower-cased. */
const NOT_A_PERSON = new Set([
  'user', 'users', 'username', 'usuario', 'benutzer', 'usager',
  'me', 'you', 'someone', 'somebody', 'some-user', 'someuser', 'yourname',
  'name', 'example', 'sample', 'demo', 'placeholder', 'foo', 'bar', 'baz',
  'test', 'tester', 'testing', 'testuser', 'test-user', 'fixture', 'mock',
  'dummy', 'agent', 'runner', 'build', 'ci', 'dev', 'developer', 'admin',
  'alice', 'bob', 'carol', 'dave', 'jane', 'john', 'jdoe', 'qyj',
  'user1', 'user2', 'u', 'u2', 'x', 'a', 'n', 'shared', 'guest', 'node',
  // Windows built-in profiles.
  'public', 'default', 'default user', 'all users', 'defaultuser0',
  'wdagutilityaccount', 'defaultaccount',
])

/**
 * A home path with a concrete account segment.
 *
 * Alternatives, all capturing the segment after `Users`/`home`:
 *   `/Users/someone`            macOS, and the tail of `/mnt/c/Users/someone`
 *   `/home/someone`             Linux
 *   `C:\Users\someone`          Windows native, escaped or not
 */
const HOME_PATH = /(?:\/(?:Users|home)|[A-Za-z]:[\\/]{1,2}Users)[\\/]{1,2}([A-Za-z0-9._$-]+)/gu

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

/** Build output trees: shipped artifacts must not carry the build machine's home. */
const ARTIFACT_ROOTS = ['packages', 'apps', 'vendor']

/** AEK-authored trees. Everything here is ours to keep clean. */
const OWNED_ROOTS = ['packages/aek', 'scripts/aek', 'apps/web', 'apps/aek-desktop']
/** Root files that belong to us as well. */
const OWNED_FILES = ['AGENTS.md', 'README.md', 'package.json']

const MAX_BYTES = 2 * 1024 * 1024

/** @param {string} p @returns {string} */
function rel(p) {
  return relative(ROOT, p).split(sep).join('/')
}

/**
 * Decide whether one account segment can name a real person.
 * @param {string} segment - captured text after `Users/` or `home/`.
 * @returns {boolean} true when it must be reported.
 */
export function isRealAccount(segment) {
  // Path punctuation clings to the segment: `Public.` or `me"`.
  const raw = segment.replace(/[.\s]+$/u, '').trim()
  if (raw === '' || raw === '~' || raw === '.') return false
  // Placeholder syntax: `<user>`, `${HOME}`, `%USERPROFILE%`
  if (/^[<${%]/u.test(raw)) return false
  // Dot directories (`.dsh`, `.aek`) name a directory, not an account.
  if (raw.startsWith('.')) return false
  return !NOT_A_PERSON.has(raw.toLowerCase())
}

/**
 * Check one text blob. Exported for --selftest.
 * @param {string} relPath - repo-relative path (posix) used in the report.
 * @param {string} text - file contents.
 * @returns {{ file: string, line: number, rule: string, text: string }[]}
 */
export function checkText(relPath, text) {
  const found = []
  const lines = text.split(/\r?\n/u)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.length > 4000) continue // minified single-line bundles
    for (const match of line.matchAll(HOME_PATH)) {
      if (!isRealAccount(match[1])) continue
      found.push({
        file: relPath,
        line: i + 1,
        rule: 'real-user-home',
        text: line.trim().slice(0, 160),
      })
      break
    }
  }
  return found
}

/**
 * Walk a directory, visiting every text file that is not generated output.
 * @param {string} dir - absolute directory.
 * @param {(file: string) => void} visit - called with absolute file paths.
 */
function walk(dir, visit) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full, visit)
      continue
    }
    if (!entry.isFile()) continue
    if (SKIP_FILES.has(entry.name)) continue
    const dot = entry.name.lastIndexOf('.')
    const ext = dot === -1 ? '' : entry.name.slice(dot).toLowerCase()
    if (!TEXT_EXT.has(ext)) continue
    visit(full)
  }
}

/**
 * @param {string} file - absolute path.
 * @returns {{ file: string, line: number, rule: string, text: string }[]}
 */
function checkFile(file) {
  if (file === SELF) return []
  let stat
  try { stat = statSync(file) } catch { return [] }
  if (stat.size > MAX_BYTES) return []
  let text
  try { text = readFileSync(file, 'utf8') } catch { return [] }
  if (text.includes('\u0000')) return []
  return checkText(rel(file), text)
}

/**
 * @param {{ all?: boolean }} options - `all` widens the scan to the whole repo.
 * @returns {{ file: string, line: number, rule: string, text: string }[]}
 */
function scan(options = {}) {
  const found = []
  if (options.all === true) {
    walk(ROOT, (file) => found.push(...checkFile(file)))
    return found
  }
  for (const root of OWNED_ROOTS) walk(join(ROOT, root), (file) => found.push(...checkFile(file)))
  for (const name of OWNED_FILES) {
    const file = join(ROOT, name)
    if (existsSync(file)) found.push(...checkFile(file))
  }
  return found
}

/**
 * Build artifacts that still carry THIS machine's home directory.
 *
 * A published bundle must read the same for every user. The bundler used to
 * inline absolute stylesheet paths into the emitted `//#region` comments, so
 * every consumer received the build machine's home path.
 * @returns {{ file: string, line: number, rule: string, text: string }[]}
 */
function scanArtifacts() {
  const home = homedir()
  if (!/^\/(?:Users|home)\//u.test(home)) return []
  const found = []
  const artifactDirs = new Set(['lib', 'dist', 'build', 'out'])
  const visit = (dir) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) && !artifactDirs.has(entry.name)) continue
        visit(full)
      } else if (entry.isFile()) {
        const dot = entry.name.lastIndexOf('.')
        const ext = dot === -1 ? '' : entry.name.slice(dot).toLowerCase()
        if (!TEXT_EXT.has(ext)) continue
        let stat
        try { stat = statSync(full) } catch { continue }
        if (stat.size > MAX_BYTES) continue
        let text
        try { text = readFileSync(full, 'utf8') } catch { continue }
        if (text.includes('\u0000')) continue
        text.split(/\r?\n/u).forEach((line, index) => {
          if (!line.includes(home)) return
          found.push({
            file: rel(full),
            line: index + 1,
            rule: 'artifact-home-path',
            text: line.trim().slice(0, 160),
          })
        })
      }
    }
  }
  for (const root of ARTIFACT_ROOTS) {
    const dir = join(ROOT, root)
    if (!existsSync(dir)) continue
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      visit(join(dir, entry.name))
    }
  }
  return found
}

function selftest() {
  const shouldFail = [
    'const ROOT = "/Users/zhangsan/project"',
    "const p = path.join('/home/mallory', 'data')",
    'process.env.HOME = "C:\\\\Users\\\\liwei"',
    'const wsl = "/mnt/c/Users/wangwu/AppData/Local"',
    '// 本机路径：/Users/zhangsan/.aek',
    '  home: "C:/Users/LiWei/work"',
  ]
  const shouldPass = [
    "const dir = join(homedir(), 'project')",
    'defaults to ~/.aek/current',
    'const p = `/mnt/c/Users/<user>/AppData`',
    'const p = join(home, ".claude", "CLAUDE.md")',
    "const p = 'C:\\\\Users\\\\Public\\\\dsh-acl'",
    "const p = '/Users/fixture/project'",
    'const p = "/mnt/c/Users/test/AppData/Local"',
    'expect(home).toBe("%USERPROFILE%")',
    "const p = '/home/.dsh/.env'",
  ]
  const failures = []
  for (const line of shouldFail) {
    const hits = checkText('selftest/fixture.ts', line)
    if (!hits.some((h) => h.rule === 'real-user-home')) failures.push(`missed: ${line}`)
  }
  for (const line of shouldPass) {
    const hits = checkText('selftest/fixture.ts', line)
    if (hits.length > 0) failures.push(`false positive: ${line}`)
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(`selftest FAIL: ${f}`)
    process.exit(1)
  }
  console.log(`selftest OK: ${shouldFail.length} rejected, ${shouldPass.length} accepted`)
  process.exit(0)
}

const args = process.argv.slice(2)
if (args.includes('--selftest')) selftest()
else {
  const all = args.includes('--all')
  const strict = args.includes('--strict')
  const artifacts = args.includes('--artifacts')
  const violations = [...scan({ all }), ...(artifacts ? scanArtifacts() : [])]
  const failing = all && !strict ? false : violations.length > 0
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: !failing, scope: all ? 'repo' : 'aek', artifacts, violations }, null, 2))
  } else if (violations.length === 0) {
    console.log(`verify-user-paths: OK — no real user home directory in the ${all ? 'repo' : 'AEK-owned tree'}${artifacts ? ' and no build-machine home path in the artifacts' : ''}.`)
  } else {
    const label = failing ? 'violation(s)' : 'advisory finding(s) (vendored upstream; not failing)'
    console.error(`verify-user-paths: ${violations.length} ${label}`)
    for (const v of violations) console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`)
    console.error('Fix: use ~ / $HOME / %USERPROFILE% or a placeholder like <user>; in tests use tester/fixture.')
  }
  process.exit(failing ? 1 : 0)
}
