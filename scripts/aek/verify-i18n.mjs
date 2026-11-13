#!/usr/bin/env node
/**
 * i18n completeness gate for the AEK console (X round).
 *
 * User rule (2026-11-13): unfinished i18n must not pass the build. A raw key
 * such as `settings.group.sidebar` or `permissions.note.mac` rendered on screen
 * is exactly what this gate refuses.
 *
 * Checks (all read-only, no side effects — safe to run on every compile):
 *
 * 1. LOCALE PARITY — the zh-CN and en-US dictionaries in the aek-home client
 *    `i18n.tsx` must define the SAME key set (a key missing in either locale
 *    is a violation; the fallback-to-ZH rule hides it at runtime).
 * 2. CONSOLE SCOPE — every `t('dotted.key')` / `tf('dotted.key')` literal,
 *    key-bearing field (`labelKey` / `hintKey` / `i18nKey` / `titleKey` /
 *    `noteKey` / `messageKey` / …), `?? 'dotted.key'` fallback and dynamic
 *    template inside the aek-home package must resolve in BOTH dictionaries.
 * 3. FACTS SCOPE — key-bearing field literals anywhere else in the AEK
 *    packages (host-supplied facts such as `noteKey: 'permissions.note.mac'`
 *    in aek-websearch) must resolve in both dictionaries. Plain `t()` calls
 *    outside the console are OUT of scope: the plugin card layer owns its
 *    own host-supplied translation namespace.
 *
 * Dynamic templates (`t(\`ns.prefix.${var}\`)`) resolve their candidate
 * values from the array literal assigned to `var` (or `var` + "s") in the
 * SAME file; every `ns.prefix.<value>` must exist in both dictionaries, and
 * an unresolvable candidate list is a violation on its own (unknown keys are
 * incomplete i18n by definition).
 *
 * Usage:
 *   node scripts/aek/verify-i18n.mjs          # run the gate (read-only)
 *   node scripts/aek/verify-i18n.mjs --quiet  # only print violations
 *
 * @module scripts/aek/verify-i18n
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
const CONSOLE_SRC = join(ROOT, 'packages', 'aek', 'coraek-plugins', 'aek-home', 'src')
const I18N_TSX = join(CONSOLE_SRC, 'client', 'i18n.tsx')
const AEK_SRC = join(ROOT, 'packages', 'aek')

/**
 * The closed set of i18n key namespaces the console speaks. A DOTTED string
 * literal under one of them, in a key-bearing context (a t()/tf() argument,
 * a `labelKey` / `hintKey` / … field, a `??` fallback, a dynamic template),
 * is an i18n key and must exist in BOTH dictionaries. Bare literals in other
 * contexts are deliberately NOT checked: dotted names like the Cordis
 * slot-map ids `plugins.bundle.config` / `plugins.row.config` or data-file
 * names (`plugins.json`) would false-positive.
 */
const KEY_NAMESPACES = /^(nav|panel|settings|permissions|access|runtime|about|websearch|keys|plugins|managers|brand|footer|common)\.[A-Za-z0-9_.]+$/u

/**
 * Key-bearing field NAMES. A line assigning one of these is scanned for ALL
 * quoted dotted literals under an i18n namespace on that line — this covers
 * plain values, ternaries (`noteKey: isMac ? 'a' : 'b'`) and object literals
 * in one line, while ignoring bare `label:`/`title:` text that is not a key.
 */
const KEY_FIELD_LINE_RE = /\b(?:labelKey|hintKey|i18nKey|titleKey|noteKey|messageKey|label|hint|title)\s*:/u
/** `?? 'dotted.key'` fallbacks (the client-side default noteKey, …). */
const FALLBACK_RE = /\?\?\s*'([A-Za-z0-9_.]+)'/g
/** @param {string} text @param {string} rel @returns void */
function scanKeyFields(text, rel) {
  for (const line of text.split('\n')) {
    if (!KEY_FIELD_LINE_RE.test(line)) continue
    for (const match of line.matchAll(/'([A-Za-z0-9_.]+)'/g)) {
      if (KEY_NAMESPACES.test(match[1])) requireKey(match[1], `field line in ${rel}`)
    }
  }
}

/** @param {string} start @returns every .ts/.tsx file under start (recursive). */
function walkTs(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'lib' || name === 'dist') continue
    const full = join(dir, name)
    const info = statSync(full)
    if (info.isDirectory()) out.push(...walkTs(full))
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/**
 * Extract one dictionary block (`const ZH: Record<...> = { … }`) from the
 * i18n source and return its key list. Brace-matched, so values with `}` are
 * safe.
 * @param {string} source @param {string} name @returns {string[]} keys.
 */
function dictKeys(source, name) {
  const start = source.indexOf(`const ${name}: Record<string, string> = {`)
  if (start < 0) throw new Error(`dictionary ${name} not found in i18n.tsx`)
  let depth = 0
  let end = -1
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end < 0) throw new Error(`unbalanced dictionary ${name}`)
  const block = source.slice(start, end + 1)
  return [...block.matchAll(/^\s*'([A-Za-z0-9_.]+)'\s*:/gim)].map(match => match[1])
}

/** Recursively list the host-side AEK source files (client included). */
function hostFiles() {
  const files = []
  for (const dir of readdirSync(AEK_SRC)) {
    const full = join(AEK_SRC, dir)
    if (statSync(full).isDirectory()) files.push(...walkTs(full))
  }
  return files
}

const quiet = process.argv.includes('--quiet')
const violations = []

const source = readFileSync(I18N_TSX, 'utf8')
const zh = dictKeys(source, 'ZH')
const en = dictKeys(source, 'EN')
const zhSet = new Set(zh)
const enSet = new Set(en)

// 1 — locale parity
for (const key of zhSet) if (!enSet.has(key)) violations.push(`locale-parity: "${key}" missing from en-US`)
for (const key of enSet) if (!zhSet.has(key)) violations.push(`locale-parity: "${key}" missing from zh-CN`)

/** @param {string} key @param {string} where @returns void */
function requireKey(key, where) {
  if (zhSet.has(key) && enSet.has(key)) return
  const missing = [!zhSet.has(key) ? 'zh-CN' : null, !enSet.has(key) ? 'en-US' : null].filter(Boolean)
  violations.push(`missing-key: "${key}" (${where}) missing from ${missing.join(' + ') || 'both locales'}`)
}

// 2 + 3 — CONSOLE scope (aek-home): t()/tf() literals, key-bearing fields,
// ?? fallbacks, dynamic templates. Every `t` here renders through the
// aek-home dictionary. (Other plugins' client cards carry their own
// host-supplied `t`, so they are NOT part of this scope — see SCOPE B.)
for (const file of walkTs(CONSOLE_SRC)) {
  if (file === I18N_TSX) continue
  const text = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)
  for (const match of text.matchAll(/\b(?:t|tf)\(\s*['"]([A-Za-z0-9_.]+)['"]/g)) requireKey(match[1], `t() in ${rel}`)
  scanKeyFields(text, rel)
  for (const match of text.matchAll(FALLBACK_RE)) {
    if (KEY_NAMESPACES.test(match[1])) requireKey(match[1], `fallback in ${rel}`)
  }
  for (const match of text.matchAll(/\bt\(\s*`([A-Za-z][\w.]*)\.\$\{(\w+)}`/g)) {
    const prefix = match[1]
    const variable = match[2]
    // Candidate values: the array literal assigned to `variable` or
    // `variable + "s"` in the same file.
    const arrayPattern = new RegExp(`(?:const|let)\\s+${variable}s?\\s*[^=]*?=\\s*\\[([^\\]]*)\\]`, 'g')
    let candidates = []
    for (const arr of text.matchAll(arrayPattern)) {
      candidates.push(...[...arr[1].matchAll(/'([A-Za-z0-9_.]+)'/g)].map(item => item[1]))
    }
    if (candidates.length === 0) {
      violations.push(`dynamic-key: t(\`${prefix}.\${${variable}}\`) in ${rel} — no candidate array found for "${variable}"`)
      continue
    }
    for (const value of new Set(candidates)) requireKey(`${prefix}.${value}`, `dynamic t(\`${prefix}.\${${variable}}\`) in ${rel}`)
  }
}

// 3 (host half) — FACTS SCOPE: key-bearing field literals (`noteKey: …` etc.)
// anywhere in the AEK packages. These values flow into the console dictionary
// as host-supplied facts. Plain `t()` calls elsewhere are out of scope (the
// plugin card layer owns its own translation namespace).
for (const file of hostFiles()) {
  if (file.startsWith(CONSOLE_SRC)) continue // checked above
  const text = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)
  scanKeyFields(text, rel)
}

if (violations.length > 0) {
  console.error(`verify-i18n: ${violations.length} violation(s) — i18n is incomplete; the build must fail.`)
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}
if (!quiet) {
  console.log(`verify-i18n: OK — ${zhSet.size} keys in zh-CN, ${enSet.size} in en-US, all usages resolve.`)
}
