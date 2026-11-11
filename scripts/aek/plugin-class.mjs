#!/usr/bin/env node
/**
 * plugin-class — the single owner of the A1 / A2 audience rule.
 *
 * RULES (confirmed by the user on 2026-11-11)
 *   - There are exactly TWO classes: A1 (will be published to npm / release
 *     for global use) and A2 (local use only, excluded from EVERY publish).
 *   - "Undeclared" is NOT a class. A package without `aek.distribution`, or
 *     with any other value, fails the build (see verify-build-rules.mjs).
 *   - Changing A1 <-> A2 requires the user's explicit permission. This script
 *     never changes anything by default; `set` needs both `--confirm` and a
 *     `--reason`, and every change is appended to an audit log in the data
 *     root. Nothing else in the repo writes `aek.distribution`.
 *
 * SAFETY: no arguments = read-only `check`. `list` / `publish-list` are also
 * read-only. Only `set ... --confirm` writes.
 *
 * Usage:
 *   node scripts/aek/plugin-class.mjs                       # check (read-only)
 *   node scripts/aek/plugin-class.mjs check [--json]
 *   node scripts/aek/plugin-class.mjs list [--json]
 *   node scripts/aek/plugin-class.mjs publish-list [--json] # A1 only
 *   node scripts/aek/plugin-class.mjs set <pkg> <A1|A2> --reason "..." --confirm
 *   node scripts/aek/plugin-class.mjs guide
 *
 * @module scripts/aek/plugin-class
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLASS_LABELS,
  PLUGIN_CLASSES,
  checkPluginClasses,
  publishablePlugins,
  readPluginMeta,
} from '../../packages/aek/base/coraek/plugin-meta.mjs'
import { aekHomePath } from '../../packages/aek/base/coraek/home.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Repository root: walk up from this file until the workspace marker appears.
 * @returns {string} absolute repository root.
 */
export function repoRoot() {
  let dir = HERE
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

/** Audit log lives in the slot's data root, never in the repository. */
function auditFile() {
  return aekHomePath('logs', 'plugin-class-changes.jsonl')
}

/**
 * Build-gate entry point, also used by verify-build-rules.mjs.
 * @param {string} [root] - repository root override.
 * @returns {{ ok: boolean, violations: string[], count: number }} result.
 */
export function runCheck(root = repoRoot()) {
  const result = checkPluginClasses(root)
  return { ok: result.ok, violations: result.violations, count: result.packages.length }
}

/**
 * Print the check result with an actionable footer.
 * @param {string} root - repository root.
 * @param {boolean} json - machine-readable output.
 * @returns {number} process exit code.
 */
function check(root, json) {
  const result = checkPluginClasses(root)
  if (json) {
    console.log(JSON.stringify({ ok: result.ok, packages: result.packages.map(pkg => ({
      name: pkg.packageName,
      dir: pkg.dir,
      distribution: pkg.distribution.value,
      ok: pkg.distribution.ok,
      private: pkg.private,
    })), violations: result.violations }, null, 2))
    return result.ok ? 0 : 1
  }
  console.log(`plugin-class: ${result.packages.length} AEK packages checked`)
  for (const pkg of result.packages) {
    const flag = pkg.distribution.ok ? '  ' : '!!'
    console.log(`  ${flag} ${pkg.distribution.value.padEnd(4)} ${pkg.packageName}`)
  }
  if (!result.ok) {
    console.error('\nplugin-class: BUILD BLOCKED — classification is mandatory.\n')
    for (const message of result.violations) console.error(`  - ${message}`)
    console.error('\nFix each package.json, then re-run. Changing an existing A1/A2 value')
    console.error('requires the user\'s permission: use `set <pkg> <A1|A2> --reason "..." --confirm`.')
    return 1
  }
  console.log('plugin-class: OK — every AEK package declares A1 or A2.')
  return 0
}

/**
 * List every package with its class and detected languages.
 * @param {string} root - repository root.
 * @param {boolean} json - machine-readable output.
 * @returns {number} process exit code.
 */
function list(root, json) {
  const packages = readPluginMeta(root)
  const rows = packages.map(pkg => ({
    name: pkg.packageName,
    dir: pkg.dir,
    distribution: pkg.distribution.value,
    publishable: pkg.distribution.value === 'A1' && !pkg.private,
    primaryLanguage: pkg.languages.primary,
    languages: pkg.languages.languages,
    sourceFiles: pkg.languages.files,
  }))
  if (json) {
    console.log(JSON.stringify(rows, null, 2))
    return 0
  }
  for (const row of rows) {
    const mark = row.publishable ? 'publish' : 'LOCAL  '
    console.log(`  [${row.distribution}] ${mark}  ${row.primaryLanguage.padEnd(11)} ${row.name}`)
    if (row.languages.length > 1) console.log(`        also: ${row.languages.slice(1).join(', ')}`)
  }
  return 0
}

/**
 * The exact set a publish path may include. A2 never appears here.
 * @param {string} root - repository root.
 * @param {boolean} json - machine-readable output.
 * @returns {number} process exit code.
 */
function publishList(root, json) {
  const allowed = publishablePlugins(root)
  const names = allowed.map(pkg => pkg.packageName)
  const dirs = allowed.map(pkg => pkg.dir)
  if (json) console.log(JSON.stringify({ names, dirs }, null, 2))
  else for (const name of names) console.log(name)
  return 0
}

/**
 * Change one package's class — the ONLY writer of `aek.distribution`.
 *
 * Requires both `--confirm` and `--reason`; without `--confirm` it is a pure
 * dry run that prints what WOULD change. Every real change is audited.
 * @param {string[]} args - CLI arguments after `set`.
 * @param {string} root - repository root.
 * @returns {number} process exit code.
 */
function setClass(args, root) {
  const positional = args.filter(arg => !arg.startsWith('--'))
  const confirm = args.includes('--confirm')
  const reasonAt = args.indexOf('--reason')
  const reason = reasonAt === -1 ? '' : String(args[reasonAt + 1] ?? '').trim()
  const [selector, target] = positional

  if (selector === undefined || target === undefined || !PLUGIN_CLASSES.includes(target)) {
    console.error('usage: node scripts/aek/plugin-class.mjs set <pkg> <A1|A2> --reason "..." --confirm')
    return 2
  }
  const packages = readPluginMeta(root, { languages: false })
  const match = packages.find(pkg => pkg.id === selector || pkg.packageName === selector)
  if (match === undefined) {
    console.error(`unknown AEK package: ${selector}`)
    return 2
  }
  const file = join(root, ...match.dir.split('/'), 'package.json')
  let manifest
  try { manifest = JSON.parse(readFileSync(file, 'utf8')) } catch (error) {
    console.error(`cannot read ${file}: ${error.message}`)
    return 2
  }
  const before = match.distribution.value || '(undeclared)'
  console.log(`${match.packageName}: ${before} -> ${target}`)
  console.log(`  ${CLASS_LABELS[target]}`)

  if (!confirm) {
    console.log('\nDRY RUN — nothing was written.')
    console.log('Class changes require the user\'s permission. Re-run with --confirm and --reason "..."')
    console.log('only after the user explicitly approved this change.')
    return 0
  }
  if (reason.length === 0) {
    console.error('refusing to change a class without --reason "..." (audit trail)')
    return 2
  }

  // Preserve the file's indentation and trailing newline.
  const raw = readFileSync(file, 'utf8')
  const ending = raw.endsWith('\n') ? '\n' : ''
  manifest.aek = { ...(manifest.aek ?? {}), distribution: target }
  writeFileSync(file, JSON.stringify(manifest, null, 2) + ending, 'utf8')

  const audit = auditFile()
  mkdirSync(dirname(audit), { recursive: true })
  appendFileSync(audit, JSON.stringify({
    at: new Date().toISOString(),
    package: match.packageName,
    dir: match.dir,
    from: before,
    to: target,
    reason,
    actor: 'explicit user-approved CLI invocation',
  }) + '\n', 'utf8')
  console.log(`\nwritten. audit → ${audit}`)
  return 0
}

/** @returns {number} exit code. */
function guide() {
  console.log(`AEK plugin audience classes

  A1  will be published to npm / release for global use
  A2  local use only — excluded from EVERY publish path

Rules:
  - Every package under packages/aek/** MUST declare aek.distribution.
  - There is no default, no fallback, and no third class.
  - Undeclared / illegal values fail the build (verify-build-rules.mjs).
  - A1 <-> A2 changes require the user's explicit permission and are audited.

Add to a package.json:
  "aek": { "distribution": "A1" }

Change a class (only after the user says yes):
  node scripts/aek/plugin-class.mjs set <pkg> A2 --reason "..." --confirm

Check what a release may publish:
  node scripts/aek/plugin-class.mjs publish-list`)
  return 0
}

/** CLI dispatch. */
function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const command = args.find(arg => !arg.startsWith('--')) ?? 'check'
  const root = repoRoot()
  /** @type {Record<string, () => number>} */
  const commands = {
    check: () => check(root, json),
    list: () => list(root, json),
    'publish-list': () => publishList(root, json),
    guide,
    help: guide,
  }
  if (command === 'set') {
    process.exit(setClass(args.slice(args.indexOf('set') + 1), root))
  }
  const run = commands[command]
  if (run === undefined) {
    console.error(`unknown subcommand: ${command}`)
    guide()
    process.exit(2)
  }
  process.exit(run())
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
