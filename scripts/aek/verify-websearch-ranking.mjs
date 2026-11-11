#!/usr/bin/env node
/**
 * Read-only gate for the remote Web Search ranking (2026-11-11).
 *
 * User rule: tier membership, in-tier rank, tier names/order and the
 * free-tier metadata must NEVER be hardcoded in product code. They live in
 * `data/provider-ranking.json` and are fetched at runtime from GitHub raw;
 * if GitHub cannot be reached, the console shows no classification at all.
 *
 * This gate proves that contract locally:
 *   1. the data file is schema-valid (6 ordered tiers, exactly one catch-all,
 *      consecutive ranks, metadata for every adapter kind);
 *   2. NO product source file contains a tier id or a provider kind literal
 *      from that data file (a ranking hardcoded in code would fail here);
 *   3. no machine-local absolute path leaked into the new files.
 *
 * Default (no args) = read-only report. `--live <base>` additionally probes a
 * running host; `--json` prints machine-readable results. Nothing is written,
 * nothing is started, no remote is contacted in the default mode.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const WEBSEARCH = join(ROOT, 'packages', 'aek', 'coraek-plugins', 'aek-websearch')
const DATA = join(WEBSEARCH, 'data', 'provider-ranking.json')
const DEFAULTS = join(WEBSEARCH, 'src', 'defaults.ts')

/** Data/transport layer: no tier id AND no provider kind literal. */
const DATA_LAYER_SOURCES = [
  join(WEBSEARCH, 'src', 'ranking.ts'),
  join(ROOT, 'packages', 'aek', 'coraek-plugins', 'aek-home', 'src', 'client', 'useWebsearchRanking.ts'),
]

/** UI/host layer: no provider kind literal (tier ids like "trash" collide
 *  with unrelated icon names, so only provider kinds are checked here). */
const UI_SOURCES = [
  join(WEBSEARCH, 'src', 'admin.ts'),
  join(ROOT, 'packages', 'aek', 'coraek-plugins', 'aek-home', 'src', 'client', 'WebSearchPanel.tsx'),
]

const RANKING_SOURCES = [...DATA_LAYER_SOURCES, ...UI_SOURCES]

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const liveIndex = args.indexOf('--live')
const liveBase = liveIndex >= 0 ? args[liveIndex + 1] : undefined
const results = []

/** @param label - check name. @param ok - outcome. @param detail - evidence. */
function record(label, ok, detail) {
  results.push({ label, ok, detail })
}

/** @param file - path. @returns file text, or undefined when unreadable. */
function text(file) {
  try { return readFileSync(file, 'utf8') } catch { return undefined }
}

/** @returns the adapter kinds from the single source of truth. */
function providerKinds() {
  const source = text(DEFAULTS) ?? ''
  const match = /export const PROVIDER_KINDS = \[([^\]]+)\]/u.exec(source)
  return match?.[1] === undefined ? [] : [...match[1].matchAll(/'([^']+)'/gu)].map(item => item[1] ?? '')
}

/** @returns the parsed data file, or undefined. */
function readData() {
  const source = text(DATA)
  if (source === undefined) return undefined
  try { return JSON.parse(source) } catch { return undefined }
}

const data = readData()
record('ranking data file exists and parses', data !== undefined,
  data === undefined ? DATA : `${Object.keys(data.providers ?? {}).length} provider entries`)

if (data !== undefined) {
  const tiers = Array.isArray(data.tiers) ? data.tiers : []
  const positions = tiers.map(tier => tier.position).sort((a, b) => a - b)
  record('schema is 1', data.schema === 1, `schema=${String(data.schema)}`)
  record('exactly six tiers at positions 1..6',
    tiers.length === 6 && positions.join(',') === '1,2,3,4,5,6',
    positions.join(','))
  record('exactly one catch-all tier',
    tiers.filter(tier => tier.catchAll === true).length === 1,
    tiers.filter(tier => tier.catchAll === true).map(tier => String(tier.id)).join(',') || 'none')
  record('every tier has zh + en labels',
    tiers.every(tier => typeof tier.label?.zh === 'string' && typeof tier.label?.en === 'string'
      && tier.label.zh.length > 0 && tier.label.en.length > 0),
    tiers.map(tier => `${String(tier.id)}:${String(tier.label?.en ?? '?')}`).join(' '))

  const kinds = providerKinds()
  record('provider kinds discovered from defaults.ts', kinds.length > 0, kinds.join(','))
  const entries = Object.entries(data.providers ?? {})
  record('every adapter kind has metadata',
    kinds.length > 0 && kinds.every(kind => entries.some(([key]) => key === kind))
      && entries.every(([key]) => kinds.includes(key)),
    `${String(entries.length)} entries / ${String(kinds.length)} kinds`)

  const tierIds = new Set(tiers.map(tier => tier.id))
  const catchAllId = tiers.find(tier => tier.catchAll === true)?.id
  const ranked = entries.filter(([, meta]) => meta.tier !== undefined)
  const invalidTier = ranked.some(([, meta]) => !tierIds.has(meta.tier) || meta.tier === catchAllId)
  record('ranked members point at real ranked tiers', !invalidTier,
    `${String(ranked.length)} ranked members`)
  const byTier = new Map()
  for (const [, meta] of ranked) {
    const list = byTier.get(meta.tier) ?? []
    list.push(meta.rank)
    byTier.set(meta.tier, list)
  }
  const consecutive = [...byTier.values()].every(ranks => {
    const sorted = [...ranks].sort((a, b) => a - b)
    return sorted.every((rank, index) => Number.isInteger(rank) && rank === index + 1)
  })
  record('in-tier ranks are consecutive integers from 1', consecutive,
    [...byTier.entries()].map(([id, ranks]) => `${String(id)}=[${[...ranks].sort((a, b) => a - b).join(',')}]`).join(' '))

  const tri = value => value === null || typeof value === 'boolean'
  record('freeTier / phone / card are boolean or null (never invented)',
    entries.every(([, meta]) => tri(meta.freeTier) && tri(meta.phone) && tri(meta.card)),
    `unverified freeTier=${String(entries.filter(([, meta]) => meta.freeTier === null).length)}`)

  // The hard rule: a ranking constant compiled into product code fails here.
  const scans = [
    ...DATA_LAYER_SOURCES.map(file => [file, [...tierIds, ...kinds]]),
    ...UI_SOURCES.map(file => [file, kinds]),
  ]
  const leaks = []
  for (const [file, forbidden] of scans) {
    const source = text(file)
    if (source === undefined) { leaks.push(`${file}: MISSING`); continue }
    for (const word of forbidden) {
      const pattern = new RegExp(`['"\`]${word}['"\`]`, 'u')
      if (pattern.test(source)) leaks.push(`${file.replace(`${ROOT}/`, '')}: '${word}'`)
    }
  }
  record('no tier id or provider kind literal in ranking product code',
    leaks.length === 0, leaks.length === 0 ? 'zero hardcoded ranking facts' : leaks.join(' | '))

  // Print the ACTUAL board (read dynamically) so the report has hard data
  // without the gate itself hardcoding any rank.
  const board = tiers.map(tier => {
    const members = entries
      .filter(([, meta]) => (meta.tier ?? catchAllId) === tier.id)
      .map(([kind, meta]) => ({ kind, rank: meta.rank ?? null }))
      .sort((left, right) => (left.rank ?? 999) - (right.rank ?? 999))
    return { position: tier.position, id: tier.id, en: tier.label?.en, members }
  })
  if (!asJson) {
    console.log('=== 数据文件实际榜单（动态读取，脚本零硬编码） ===')
    for (const tier of board) {
      const members = tier.members.map(item => item.rank === null ? item.kind : `${item.kind}#${String(item.rank)}`)
      console.log(`  ${String(tier.position)} ${String(tier.en)}: ${members.join(', ') || '(empty)'}`)
    }
  }
}

const pathLeaks = []
for (const file of [DATA, ...RANKING_SOURCES]) {
  const source = text(file) ?? ''
  if (/\/Users\/|\/home\/[a-z]/u.test(source)) pathLeaks.push(file.replace(`${ROOT}/`, ''))
}
record('no machine-local absolute path in the new files', pathLeaks.length === 0,
  pathLeaks.length === 0 ? 'zero hits' : pathLeaks.join(', '))

if (liveBase !== undefined) {
  const url = `${liveBase.replace(/\/$/u, '')}/api/aek/websearch/ranking`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
    const body = await response.json()
    record(`live ${url} answers 200`, response.status === 200, `HTTP ${String(response.status)}`)
    record('live snapshot shape is complete',
      typeof body.classified === 'boolean' && Array.isArray(body.groups) && Array.isArray(body.providers),
      `classified=${String(body.classified)} groups=${String((body.groups ?? []).length)} reason=${String(body.reason ?? '')}`)
  } catch (error) {
    record(`live ${url} answers 200`, false, error instanceof Error ? error.message : String(error))
  }
}

const failed = results.filter(result => !result.ok)
if (asJson) {
  console.log(JSON.stringify({ ok: failed.length === 0, checks: results }, null, 2))
} else {
  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.label}  —  ${result.detail}`)
  }
  console.log(`\n${String(results.length - failed.length)}/${String(results.length)} PASS`)
}
process.exit(failed.length === 0 ? 0 : 1)
