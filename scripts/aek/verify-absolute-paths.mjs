#!/usr/bin/env node
/**
 * Advisory compiler check: warn on hardcoded absolute-path literals in AEK
 * source (BO round, 2026-11-23, m00001 ③).
 *
 * The hard blocker for user-machine paths (`/Users/...`, `C:\Users\...`,
 * `/mnt/<drive>/Users/...`) already lives in `verify-aek-home.mjs` and gates
 * the whole build/typecheck/lint chain. This script adds the WARNING surface
 * the user asked for: generic machine-specific paths (`/opt/`, `/usr/`,
 * `/var/`, `/etc/`, `/tmp/`, `/private/`, `/mnt/`) that the hard gate does
 * not cover. It never blocks by default — it reminds, with the rule stated
 * at every hit:
 *
 *   1. Source ships to users on every platform: no machine-specific path may
 *      enter the source. Resolve data roots through @cheezmil/coraek/home.
 *   2. Any host-absolute path DISPLAYED in the UI must go through
 *      `formatDisplayPath` (apps/aek-web/src/paths.ts) with the
 *      `aek-home.pathStyle` setting; copy buttons always copy the raw path.
 *
 * Usage:
 *   node scripts/aek/verify-absolute-paths.mjs            # advisory (exit 0)
 *   node scripts/aek/verify-absolute-paths.mjs --strict    # fail on warnings
 *   node scripts/aek/verify-absolute-paths.mjs --quiet     # one-line summary
 *   node scripts/aek/verify-absolute-paths.mjs --json
 *   node scripts/aek/verify-absolute-paths.mjs --selftest
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)

const SCAN_ROOTS = ['packages/aek', 'apps/aek-web', 'apps/aek-desktop', 'apps/cli', 'scripts/aek']
const SKIP_DIRS = new Set([
  'node_modules', 'lib', 'dist', 'build', 'coverage', '.git', '.turbo',
  'types', 'test', 'tests', '__fixtures__', 'fixtures',
])
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|mjs|cjs|js|jsx)$/u
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#)/u

/**
 * Generic machine-specific absolute prefixes (the hard gate owns
 * /Users/, /home/, /System/, /Volumes/ and drive letters).
 */
const GENERIC_ABS = /['"`](?:\/opt\/|\/usr\/|\/var\/|\/etc\/|\/tmp\/|\/private\/|\/mnt\/)/u

/**
 * Files whose absolute-path literals are legitimate, with reasons.
 * Extend deliberately; every entry needs a reason.
 */
const ALLOWED_FILES = new Map([
  // WSL dual-write: the posix mapping of C:\ drives to /mnt/<drive> is the
  // very subject of this module.
  ['packages/aek/coraek-plugins/aek-prompt-manager/src/core.js', 'WSL /mnt/<drive> path mapping (intentional)'],
  // Vendor CLI detection: `devin` lives at /opt/.devin on its own platforms.
  ['packages/aek/coraek-plugins/aek-skill-manager/src/core/catalog/extract.ts', 'vendor path-exists detection (/opt/.devin)'],
  // Dev tooling shells out to macOS system binaries.
  ['scripts/aek/data-root.mjs', 'macOS system binary /usr/sbin/lsof'],
  ['scripts/aek/desktop.mjs', 'macOS system binary /usr/libexec/PlistBuddy'],
  ['scripts/aek/promote.mjs', 'macOS system binary /usr/sbin/lsof'],
  ['scripts/aek/shared-logic.mjs', 'macOS system binaries lsof / PlistBuddy'],
  ['scripts/aek/slot-ops.mjs', 'macOS system binary /usr/sbin/lsof'],
  ['scripts/aek/spotlight-report.mjs', 'macOS system binaries PlistBuddy / mdfind'],
  ['scripts/aek/verify-live-console.mjs', 'macOS system binary PlistBuddy'],
  ['scripts/aek/service.mjs', 'PATH candidate dirs (/opt/homebrew, /usr/local/bin, /usr/bin)'],
  // Gate self-test fixtures.
  ['scripts/aek/rules-selftest.mjs', 'gate self-test fixture'],
  ['scripts/aek/verify-command-namespace.mjs', 'gate self-test fixture'],
  ['scripts/aek/verify-user-paths.mjs', 'gate self-test fixture (sample paths)'],
  // This gate holds the pattern it enforces.
  ['scripts/aek/verify-absolute-paths.mjs', 'the gate itself'],
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

const ROOT = findProjectRoot(HERE)

/** @param {string} p @returns {string} */
function rel(p) {
  return relative(ROOT, p).split(sep).join('/')
}

/**
 * Check one source file. Exported for --selftest.
 * @param {string} relPath - repo-relative path (posix).
 * @param {string} text - file contents.
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function checkSource(relPath, text) {
  if (ALLOWED_FILES.has(relPath)) return []
  const lines = text.split(/\r?\n/u)
  const found = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (COMMENT_LINE.test(line)) continue
    if (GENERIC_ABS.test(line)) {
      found.push({ file: relPath, line: i + 1, text: line.trim().slice(0, 160) })
    }
  }
  return found
}

/** @returns {{ warnings: Array<{ file: string, line: number, text: string }>, scanned: number }} */
function scan() {
  const warnings = []
  let scanned = 0
  for (const root of SCAN_ROOTS) {
    walk(join(ROOT, root), (file) => {
      if (file === SELF) return
      let text
      try { text = readFileSync(file, 'utf8') } catch { return }
      scanned += 1
      warnings.push(...checkSource(rel(file), text))
    })
  }
  return { warnings, scanned }
}

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

function selftest() {
  const shouldWarn = [
    "const bin = '/usr/local/bin/aekws'",
    'return `/opt/homebrew/bin/node`',
    "const tmp = '/tmp/aek-probe'",
    "const wsl = '/mnt/d/work' // generic drive mount",
    "const priv = '/private/var/tmp/x'",
  ]
  const shouldPass = [
    "return aekHomePath('websearch', 'providers.yml')",
    "const hint = 'Leave empty for the default ~/.aek/skill-manager'",
    "import { resolveAekHome } from '@cheezmil/coraek/home'",
    "const api = '/api/aek/console/facts'",
    "const alias = '@/lib/utils'",
    "'#!/usr/bin/env node'",
    "// docs: uses /usr/bin/mdfind on macOS",
  ]
  const failures = []
  for (const line of shouldWarn) {
    if (checkSource('selftest/fixture.mjs', line).length === 0) failures.push(`missed: ${line}`)
  }
  for (const line of shouldPass) {
    const hits = checkSource('selftest/fixture.mjs', line)
    if (hits.length > 0) failures.push(`false positive: ${line}`)
  }
  if (checkSource('scripts/aek/verify-user-paths.mjs', "const wsl = '/mnt/c/Users/wangwu/x'").length > 0) {
    failures.push('allowlist did not protect the fixture gate')
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(`selftest FAIL: ${f}`)
    process.exit(1)
  }
  console.log(`selftest OK: ${shouldWarn.length} warned, ${shouldPass.length} accepted, allowlist honored`)
}

const args = process.argv.slice(2)
if (args.includes('--selftest')) selftest()
else {
  const { warnings, scanned } = scan()
  if (scanned === 0) {
    console.error('verify-absolute-paths: scanned ZERO source files — corpus guard, treat as failure')
    process.exit(1)
  }
  const strict = args.includes('--strict')
  const quiet = args.includes('--quiet')
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: strict ? warnings.length === 0 : true, scanned, warnings }, null, 2))
  } else if (warnings.length === 0) {
    console.log(quiet
      ? `verify-absolute-paths: OK (${scanned} files, 0 machine-path warnings)`
      : `verify-absolute-paths: OK — ${scanned} files scanned, no generic machine-specific absolute paths.\nReminder: UI path display must go through formatDisplayPath (apps/aek-web/src/paths.ts); never hardcode machine paths in source.`)
  } else {
    if (!quiet) {
      console.log(`verify-absolute-paths: ${warnings.length} warning(s) in ${scanned} files (advisory)`)
      for (const w of warnings) console.log(`  ${w.file}:${w.line}  ${w.text}`)
      console.log('')
      console.log('  提醒 / reminder:')
      console.log('  1) 源码面向全球用户：机器相关路径一律不进源码（数据根走 @cheezmil/coraek/home）。')
      console.log('  2) 任何要【显示】的宿主绝对路径必须走 formatDisplayPath（apps/aek-web/src/paths.ts）')
      console.log('     + aek-home.pathStyle 设置（简写 ~ / %USERPROFILE% 或完整）；复制按钮永远复制原始路径。')
    } else {
      console.log(`verify-absolute-paths: ${warnings.length} warning(s), ${scanned} files (advisory — see --no-quiet for the list)`)
    }
  }
  process.exit(strict && warnings.length > 0 ? 1 : 0)
}
