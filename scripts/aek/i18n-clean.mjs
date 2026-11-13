#!/usr/bin/env node
/**
 * i18n-clean.mjs — remove dead keys from a client `i18n.tsx` dictionary.
 *
 * A key is "dead" when it is defined in `i18n.tsx` but no source file in the
 * directory references it as a literal (`t('key')` / `tf('key')` or a schema
 * `labelKey` / `hintKey` style field). The scanner `i18n-dead-keys.mjs`
 * reports the same candidate list READ-ONLY; this script performs the
 * removal.
 *
 * Keys reachable only through a dynamic `t(variable)` call are INVISIBLE to
 * the scanner; they are protected here by the explicit `DYNAMIC_KEEP` list
 * (review it when the list changes).
 *
 * Usage (run from the repo root, from either tree):
 *   node scripts/aek/i18n-clean.mjs [dir]            # dry run (default)
 *   node scripts/aek/i18n-clean.mjs [dir] --yes      # apply
 *
 * `dir` defaults to the aek-home client source directory (a1 plugin UI).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const dir = resolve(argv.find(a => !a.startsWith('--')) ??
  'packages/aek/coraek-plugins/aek-home/src/client')
const YES = argv.includes('--yes')

/**
 * Keys referenced only via a dynamic `t(variable)` (scanner-invisible),
 * protected from deletion. Keep this list reviewed: add a key here whenever
 * a new dynamic-lookup site (e.g. a host-supplied `*Key` fallback) appears.
 */
const DYNAMIC_KEEP = new Set([
  // InfoPanels.tsx: `const noteKey = facts?.permissions.noteKey ?? 'permissions.note.other'`
  'permissions.note.other',
])

const i18nPath = join(dir, 'i18n.tsx')
const src = readFileSync(i18nPath, 'utf8')
const defs = [...new Set([...src.matchAll(/^\s*'([A-Za-z0-9_.]+)'\s*:/gim)].map(m => m[1]))]

const used = new Set()
for (const f of readdirSync(dir)) {
  if (f === 'i18n.tsx' || !/\.(tsx|ts)$/.test(f)) continue
  const t = readFileSync(join(dir, f), 'utf8')
  for (const m of t.matchAll(/\b(?:labelKey|hintKey|i18nKey|titleKey|label|hint|title)\s*:\s*'([A-Za-z0-9_.]+)'/g)) used.add(m[1])
  for (const m of t.matchAll(/\b(?:t|tf)\(\s*'([A-Za-z0-9_.]+)'/g)) used.add(m[1])
  for (const m of t.matchAll(/\b(?:t|tf)\(\s*"([A-Za-z0-9_.]+)"/g)) used.add(m[1])
}

const dead = defs.filter(k => !used.has(k) && !DYNAMIC_KEEP.has(k))
const lines = src.split('\n')
let removed = 0
const out = lines.filter((line) => {
  const m = line.match(/^\s*'([A-Za-z0-9_.]+)'\s*:/)
  if (m !== null && dead.includes(m[1])) {
    removed += 1
    if (!YES) console.log('would remove:', m[1])
    return !YES
  }
  return true
})

if (YES) writeFileSync(i18nPath, out.join('\n'))
console.log(YES
  ? `removed ${String(removed)} lines (${String(dead.length)} keys x 2 dictionaries) from ${i18nPath}`
  : `dry run: ${String(dead.length)} keys (${String(removed)} lines) would be removed; pass --yes to apply`)
if (dead.length === 0) console.log('(no dead keys)')
