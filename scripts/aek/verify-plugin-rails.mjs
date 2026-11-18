#!/usr/bin/env node
/**
 * The second-level rail (二级侧边栏) CONTRACT gate (R2 round, 2026-11-18).
 *
 * User ruling: EVERY AEK plugin that has a webui face must own a second-level
 * sidebar on its family row — with a home page (the rail's synthetic
 * "{name}首页" row, the family root itself) and a settings page. And the three
 * built-in pages (插件与程序管理 / 基础设置 / 关于) carry the same rail.
 * Rail tabs are free to either position the SAME page at one of its own
 * sections (`anchor` + `data-nav-anchor`) or switch to a DIFFERENT page
 * (their own panel id) — this gate enforces the CONTRACT, not the choice:
 *
 *   1. PLUGIN SETTINGS PAGE — every top-level nav entry of the `plugins`
 *      drawer owns a `panel.*Settings` route on its family rail. No webui
 *      plugin may have a rail with only a home row.
 *   2. BUILT-IN PAGES — the `runtime` / `settings` / `about` families exist
 *      in NAV. `runtime` and `settings` own a non-empty set of rail routes
 *      (their section tabs). `about` deliberately owns NONE: by the 2026-11-18
 *      user ruling the 关于 page carries ONLY the desktop version number, so
 *      it has no sections to position and renders no second-level rail.
 *   3. ANCHOR TARGETS — every `anchor` value declared in the nav model has
 *      a live `data-nav-anchor="<value>"` site in the console source (a tab
 *      that points at a section that does not render is a broken position).
 *
 * Read-only, zero side effects (the safe default for `scripts/aek/**`): it
 * parses `apps/aek-web/src/nav-model.ts` and greps the console source. The
 * same contract is pinned by `apps/aek-web/tests/nav-model.spec.ts`.
 *
 * Usage:
 *   node scripts/aek/verify-plugin-rails.mjs          # human-readable
 *   node scripts/aek/verify-plugin-rails.mjs --quiet  # violations only
 *
 * @module scripts/aek/verify-plugin-rails
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
const NAV_MODEL = join(ROOT, 'apps', 'aek-web', 'src', 'nav-model.ts')
const CONSOLE_SRC = join(ROOT, 'apps', 'aek-web', 'src')

/** The three built-in families that own a section-tab rail. */
const BUILT_IN_FAMILIES = ['runtime', 'settings', 'about']

/** Recursively list the .ts/.tsx files under `dir` (node_modules excluded). */
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
 * Extract the `NAV` entry objects from `nav-model.ts` without importing the
 * module (it drags in react + the preference layer; a gate must not).
 * Each entry is a single-line object literal starting with `{ id: '...'`
 * with no nested braces — one non-greedy match per entry is exact.
 * @param {string} source - the nav-model text.
 * @returns {{ id: string, group: string, subOf: string | undefined, labelKey: string, anchor: string | undefined }[]}
 */
function parseNavEntries(source) {
  const navStart = source.indexOf('export const NAV')
  if (navStart < 0) throw new Error('export const NAV not found in nav-model.ts')
  // The array ends at the first line-level closing bracket after the start.
  const arrayEnd = source.indexOf('\n]', navStart)
  if (arrayEnd < 0) throw new Error('NAV array terminator not found in nav-model.ts')
  const block = source.slice(navStart, arrayEnd)
  const entries = []
  for (const match of block.matchAll(/\{\s*id:\s*'([^']+)'\s*[^{}]*\}/g)) {
    const raw = match[0]
    const id = match[1]
    const group = (raw.match(/\bgroup:\s*'([^']+)'/) ?? [])[1]
    const subOfMatch = raw.match(/\bsubOf:\s*'([^']+)'/)
    const labelKey = (raw.match(/\blabelKey:\s*'([^']+)'/) ?? [])[1]
    const anchorMatch = raw.match(/\banchor:\s*'([^']+)'/)
    entries.push({
      id,
      group,
      subOf: subOfMatch ? subOfMatch[1] : undefined,
      labelKey,
      anchor: anchorMatch ? anchorMatch[1] : undefined,
    })
  }
  if (entries.length === 0) throw new Error('no NAV entries parsed from nav-model.ts')
  return entries
}

const quiet = process.argv.includes('--quiet')
const violations = []

const source = readFileSync(NAV_MODEL, 'utf8')
const entries = parseNavEntries(source)
const byId = new Map(entries.map(entry => [entry.id, entry]))
const topLevel = entries.filter(entry => entry.subOf === undefined)
const routesOf = (familyId) => entries.filter(entry => entry.subOf === familyId)

// 1 — PLUGIN SETTINGS PAGE: every webui plugin (the `plugins` drawer's
// top-level rows) owns a `panel.*Settings` route on its family rail.
for (const entry of topLevel.filter(item => item.group === 'plugins')) {
  const routes = routesOf(entry.id)
  const hasSettings = routes.some(route => /^panel\.[A-Za-z0-9]+Settings$/.test(route.labelKey))
  if (!hasSettings) {
    violations.push(`plugin-settings: family "${entry.id}" (${entry.labelKey}) has no panel.*Settings route on its rail`)
  }
}

// 2 — BUILT-IN PAGES: each exists in NAV. `runtime` / `settings` own a
// NON-EMPTY set of rail routes (their section tabs); `about` owns NONE by
// design (the 2026-11-18 user ruling reduced the page to the desktop version
// number — no sections, so no rail).
for (const familyId of BUILT_IN_FAMILIES) {
  if (!byId.has(familyId)) {
    violations.push(`built-in-rail: family "${familyId}" is missing from NAV entirely`)
    continue
  }
  const routes = routesOf(familyId)
  if (familyId === 'about') {
    if (routes.length > 0) {
      violations.push(`built-in-rail: family "about" owns ${String(routes.length)} rail route(s) — the 关于 page is version-only by user ruling and must stay rail-less`)
    }
    continue
  }
  if (routes.length === 0) {
    violations.push(`built-in-rail: family "${familyId}" owns no rail routes — its second-level sidebar is empty`)
  }
}

// 3 — ANCHOR TARGETS: every declared anchor value has a live
// `data-nav-anchor="<value>"` site somewhere in the console source.
const anchorValues = new Set(entries.filter(entry => entry.anchor !== undefined).map(entry => entry.anchor))
const srcFiles = walkTs(CONSOLE_SRC)
for (const value of anchorValues) {
  const site = `[data-nav-anchor="${value}"]`
  const found = srcFiles.some(file => readFileSync(file, 'utf8').includes(`data-nav-anchor="${value}"`))
  if (!found) {
    violations.push(`anchor-target: no data-nav-anchor="${value}" site in the console source (${site})`)
  }
}

// Sanity guard (gate must not pass on an empty / narrowed corpus — scripts
// AGENTS rule): the parse must have seen BOTH drawers.
const groupsSeen = new Set(topLevel.map(entry => entry.group))
if (!groupsSeen.has('plugins') || !groupsSeen.has('other')) {
  violations.push(`corpus-guard: parsed NAV lacks the "${[...groupsSeen].join('", "')}" drawer(s) — parse boundary regressed`)
}

if (quiet) {
  for (const violation of violations) console.log(violation)
} else {
  if (violations.length === 0) {
    console.log(`verify-plugin-rails: OK — ${topLevel.length} top-level rows, ` +
      `${entries.length - topLevel.length} rail routes, ${anchorValues.size} anchor tabs, all contract sites present.`)
  } else {
    for (const violation of violations) console.log(violation)
    console.log(`verify-plugin-rails: ${violations.length} violation(s) (see ${relative(ROOT, NAV_MODEL)} + ${relative(ROOT, CONSOLE_SRC)}/)`)
  }
}

process.exit(violations.length === 0 ? 0 : 1)
