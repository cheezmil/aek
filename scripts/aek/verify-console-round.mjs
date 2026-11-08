#!/usr/bin/env node
/**
 * Static acceptance gate for the R1–R25 console round. READ-ONLY by design:
 * it never writes, never starts a process, never talks to the network.
 *
 * Checks (all derived from the user's 2026-11-09 requirements):
 *  1. R24 — every collection in the console client is an unordered list:
 *     no `<ol>`, `<table>` or `<dl>` element in any `.tsx` source line.
 *  2. R0 / hard rule — no developer absolute path in AEK-owned sources or
 *     scripts (paths must be resolved at runtime).
 *  3. R6 — the recycle bin is a host route and its TTL is a setting field,
 *     not a hardcoded number in the UI.
 *  4. R1 — disable reasons exist in both dictionaries.
 *  5. R7 — both Web Search and Settings render the shared in-page search box.
 *  6. R10 — the Electron main process has NO hiddenInset / empty title /
 *     page-title-updated interception left.
 *
 * Usage: node scripts/aek/verify-console-round.mjs [--json]
 * @module scripts/aek/verify-console-round
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Walk up from this script until `pnpm-workspace.yaml` is found. */
function findRoot(start) {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('cannot locate pnpm-workspace.yaml above scripts/aek')
}

const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)))
const CLIENT = join(ROOT, 'packages', 'aek', 'coraek-plugins', 'aek-home', 'src', 'client')
const WEBSEARCH = join(ROOT, 'packages', 'aek', 'coraek-plugins', 'aek-websearch', 'src')
const DESKTOP = join(ROOT, 'apps', 'aek-desktop', 'v0', 'src', 'main')
const SCRIPTS = join(ROOT, 'scripts', 'aek')

const results = []

/** @param {string} name @param {boolean} ok @param {string} detail */
function check(name, ok, detail) {
  results.push({ name, ok, detail })
}

/** @param {string} dir @param {string[]} exts @returns {string[]} absolute file paths */
function filesIn(dir, exts) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(name => exts.some(ext => name.endsWith(ext))).map(name => join(dir, name))
}

/** @param {string} file @returns {string} */
function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/**
 * Remove comments before looking for banned CODE tokens. Several source files
 * legitimately explain that hiddenInset / page-title-updated were removed.
 * @param {string} source - file contents.
 * @returns {string} code only.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .map(line => line.replace(/\/\/.*$/u, ''))
    .join('\n')
}

/** R24: source lines only — documentation comments may legitimately mention the banned tags. */
const bannedListTag = /<(ol|table|dl)\b/u
const listOffenders = []
for (const file of filesIn(CLIENT, ['.tsx'])) {
  read(file).split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return
    if (bannedListTag.test(line)) listOffenders.push(`${relative(ROOT, file)}:${String(index + 1)} ${trimmed}`)
  })
}
check('R24 unordered lists', listOffenders.length === 0, listOffenders.join(' | ') || 'no <ol>/<table>/<dl> element in console client')

/** R0: source must never contain a developer home path. */
const absPathOffenders = []
// `verify-*.mjs` gates carry negative fixtures on purpose (e.g. a fake
// `/Users/someone/...` string used to prove the detector works). Scanning
// those would always be a false positive, so gates are excluded here.
const scanned = [
  ...filesIn(CLIENT, ['.ts', '.tsx']),
  ...filesIn(WEBSEARCH, ['.ts']),
  ...filesIn(SCRIPTS, ['.mjs']).filter(file => !file.split('/').pop().startsWith('verify-')),
  ...filesIn(DESKTOP, ['.ts']),
]
for (const file of scanned) {
  read(file).split('\n').forEach((line, index) => {
    if (/\/(Users|home)\/[A-Za-z0-9._-]+\//u.test(line)) {
      absPathOffenders.push(`${relative(ROOT, file)}:${String(index + 1)}`)
    }
  })
}
check('R0 no absolute paths', absPathOffenders.length === 0, absPathOffenders.join(' | ') || `${scanned.length} files scanned`)

const admin = read(join(WEBSEARCH, 'admin.ts'))
const keyPool = read(join(WEBSEARCH, 'key-pool.ts'))
const schema = read(join(CLIENT, 'settings-schema.ts'))
check(
  'R6 recycle route + TTL setting',
  admin.includes('WEBSEARCH_KEYS_RECYCLE_API_PATH')
    && admin.includes('purgeExpiredKeys')
    && keyPool.includes('purgeExpired')
    && schema.includes('aek-home.keyRetentionDays'),
  'route / startup purge / purgeExpired / schema field',
)

const i18n = read(join(CLIENT, 'i18n.tsx'))
check(
  'R1 disable reasons in both dictionaries',
  (i18n.match(/'keys\.reason\.balance':/gu) ?? []).length === 2
    && (i18n.match(/'keys\.reason\.manual':/gu) ?? []).length === 2
    && (i18n.match(/'keys\.reason\.invalid':/gu) ?? []).length === 2,
  'zh-CN + en-US',
)

const websearchPanel = read(join(CLIENT, 'WebSearchPanel.tsx'))
const infoPanels = read(join(CLIENT, 'InfoPanels.tsx'))
check(
  'R7 in-page search on both pages',
  websearchPanel.includes('<PanelSearch') && infoPanels.includes('<PanelSearch'),
  'WebSearchPanel + SettingsPanel',
)

const desktopMain = stripComments(read(join(DESKTOP, 'index.ts')))
check(
  'R10 native Electron title bar',
  !desktopMain.includes('hiddenInset')
    && !desktopMain.includes('page-title-updated')
    && /title:\s*SLOT_CFG\.productName/u.test(desktopMain),
  'no hiddenInset / no title interception / real product title',
)

const failed = results.filter(item => !item.ok)
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ root: ROOT, results, failed: failed.length }, null, 2)}\n`)
} else {
  for (const item of results) {
    process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}\n`)
  }
  process.stdout.write(`\n${String(results.length - failed.length)}/${String(results.length)} checks passed\n`)
}
process.exit(failed.length === 0 ? 0 : 1)
