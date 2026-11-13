/**
 * Remote, runtime-fetched Web Search provider ranking (2026-11-11).
 *
 * HARD RULE (user): tier membership, in-tier rank, tier names/order and the
 * free-tier / phone / card metadata must NEVER be hardcoded in product code.
 * They live in ONE data file inside this repository and are fetched at runtime
 * from GitHub raw. If GitHub cannot be reached, the payload is malformed, or
 * the schema is invalid, the console degrades to `classified: false` — an
 * unclassified flat list — instead of showing a stale or invented ranking.
 *
 * The only things hardcoded here are the SCHEMA SHAPE and the provider kind
 * whitelist (`defaults.ts`). The whitelist is the list of adapters this
 * package can drive, not a ranking: no kind is assigned a tier or a position.
 *
 * Override the fetch URL with `AEK_WEBSEARCH_RANKING_URL` (http/https only)
 * for self-hosted mirrors and offline verification. The default is this
 * repository's `main` branch on GitHub raw.
 *
 * @module aek-websearch/ranking
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import type { Context } from '@cheezmil/coraek/types'
import { PROVIDER_KINDS } from './defaults.ts'

/** The ranking route the AEK console talks to. */
export const RANKING_API_PATH = '/api/aek/websearch/ranking'

/** Env override for self-hosted mirrors / offline verification. */
export const RANKING_URL_ENV = 'AEK_WEBSEARCH_RANKING_URL'

/** Default remote data file (a URL, never a machine-local filesystem path). */
export const DEFAULT_RANKING_URL = 'https://raw.githubusercontent.com/cheezmil/agent-enhance-kit/main/packages/aek/coraek-plugins/aek-websearch/data/provider-ranking.json'

/** One fetch must never hold a console request longer than this. */
export const RANKING_TIMEOUT_MS = 4000

/** Successful payloads are cached for 5 minutes. */
export const RANKING_TTL_MS = 5 * 60 * 1000

/** Failures are cached briefly so an offline host does not time out on every click. */
export const RANKING_FAILURE_TTL_MS = 30 * 1000

/** The one accepted schema version. */
export const RANKING_SCHEMA = 1

/** Exactly six groups: five ranked tiers + one catch-all. */
export const RANKING_TIER_COUNT = 6

/** The one mandatory (and mutually exclusive) first-level choice. */
export type FreeFilter = 'yes' | 'no'

/** Second-level choices; both may be selected at once (OR semantics). */
export interface RankingFilter {
  /** `yes` = has a free tier; `no` = everything else (incl. unverified). */
  free: FreeFilter
  /** Show providers that require a phone number at signup. */
  phone: boolean
  /** Show providers that require a credit card at signup. */
  card: boolean
}

/** One bilingual tier label, straight from the remote data file. */
export interface TierLabel { zh: string; en: string }

/** One tier definition from the remote data file. */
export interface RankingTier {
  id: string
  position: number
  label: TierLabel
  /** Exactly one tier carries this; every provider without a tier lands there. */
  catchAll: boolean
}

/** One provider's remote metadata (never a ranking constant in code). */
export interface ProviderMeta {
  kind: string
  /** `undefined` = no explicit tier → the catch-all group. */
  tier?: string
  /** `undefined` = no explicit rank → ordered by the adapter whitelist. */
  rank?: number
  /** `null` = unverified, NOT "no free tier". */
  freeTier: boolean | null
  /** `null` = unverified. */
  phone: boolean | null
  /** `null` = unverified. */
  card: boolean | null
  note: string
  verifiedAt: string | null
  source: string | null
}

/** The validated remote payload. */
export interface RankingData {
  schema: number
  updatedAt: string
  tiers: RankingTier[]
  providers: ProviderMeta[]
  catchAllId: string
}

/** One group as the browser renders it. */
export interface RankingGroup {
  id: string
  position: number
  label: TierLabel
  catchAll: boolean
  /** Filtered members, ordered by rank then by the adapter whitelist. */
  kinds: string[]
  /** Original in-tier rank per kind, so filtering never renumbers the board. */
  ranks: Record<string, number>
}

/** Why a fetch did not produce a classification. */
export type RankingFailure = '' | 'timeout' | 'http-error' | 'invalid-json' | 'invalid-schema' | 'network-error'

/** The API snapshot. `classified: false` means "show a flat, ungrouped list". */
export interface RankingSnapshot {
  ok: boolean
  classified: boolean
  reason: RankingFailure
  message: string
  url: string
  fetchedAt: string
  updatedAt: string
  filter: RankingFilter
  groups: RankingGroup[]
  /** ALL provider metadata, including rows hidden by the filter. */
  providers: ProviderMeta[]
  /** How many providers survived the filter. */
  totalVisible: number
  /**
   * W round: the board came back from a cache whose TTL already passed; a
   * background refresh is in flight. Sent so the console can render the
   * (cached) board instantly and show a transient "updating" hint instead of
   * blocking the first paint on a GitHub round-trip.
   */
  stale?: boolean
}

/** Minimal fetch seam, injectable in unit tests. */
export type RankingFetcher = (url: string, init: {
  signal: AbortSignal
  headers: Record<string, string>
}) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

/** Options for {@link loadRanking}; every field has a safe default. */
export interface RankingOptions {
  /** Override the URL (tests / self-hosted mirrors). */
  url?: string
  /** Override the environment (tests). */
  env?: NodeJS.ProcessEnv
  /** Override the fetcher (tests). */
  fetcher?: RankingFetcher
  /** Override the clock (tests). */
  now?: () => number
  /** Override the success TTL (tests / the `ttl` query parameter, in hours). */
  ttlMs?: number
  /** Override the failure TTL (tests). */
  failureTtlMs?: number
  /** The filter to apply to the fetched ranking. */
  filter?: Partial<RankingFilter>
  /** Bypass the success cache and fetch a fresh payload (the `force` query parameter). */
  force?: boolean
  /**
   * W round: a file the last successful board is persisted to (the slot's
   * `websearch/ranking-board.json`). A backend that just restarted serves
   * THAT file instantly and refreshes in the background, so a cold boot
   * never blocks the panel's first paint on GitHub either. Omitted in unit
   * tests: no disk involved.
   */
  persistPath?: string | undefined
}

/**
 * The refresh interval the console uses, in hours. The board is remote data,
 * not a live stream: the host caches successful fetches for this window and
 * only talks to GitHub again when it expires (or when `force` says so).
 */
export const RANKING_TTL_MIN_HOURS = 1
export const RANKING_TTL_MAX_HOURS = 168
export const RANKING_TTL_DEFAULT_HOURS = 24

/** A guard supplied by `admin.ts` so a switched-off plugin answers 503. */
export type RankingGuard = (res: ServerResponse) => boolean

/** The narrow web-server seam (same local shape as `admin.ts`). */
interface RankingWebServer {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

interface CacheEntry {
  url: string
  at: number
  data: RankingData | undefined
  failure: RankingFailure
  message: string
}

let cache: CacheEntry | undefined

/** @returns the URL to fetch; only http/https overrides are honoured. */
export function rankingUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[RANKING_URL_ENV]
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_RANKING_URL
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : DEFAULT_RANKING_URL
  } catch {
    return DEFAULT_RANKING_URL
  }
}

/** @param raw - untrusted value. @returns true for `boolean | null`. */
function isTriBool(raw: unknown): raw is boolean | null {
  return raw === null || raw === true || raw === false
}

/** @param raw - untrusted value. @returns true for a non-empty short string. */
function isText(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 512
}

/**
 * Validate and normalize the remote payload. ANY deviation fails the whole
 * payload: a partially valid ranking must never be rendered.
 * @param raw - parsed JSON.
 * @returns the validated data.
 * @throws when the schema is violated.
 */
export function parseRanking(raw: unknown): RankingData {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('ranking payload is not an object')
  const doc = raw as Record<string, unknown>
  if (doc.schema !== RANKING_SCHEMA) throw new Error('unsupported ranking schema')
  if (typeof doc.updatedAt !== 'string') throw new Error('ranking updatedAt must be a string')
  if (!Array.isArray(doc.tiers) || doc.tiers.length !== RANKING_TIER_COUNT) {
    throw new Error('ranking must define exactly six tiers')
  }

  const tiers: RankingTier[] = []
  const positions = new Set<number>()
  const ids = new Set<string>()
  let catchAllId = ''
  for (const item of doc.tiers) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new Error('tier is not an object')
    const tier = item as Record<string, unknown>
    if (!isText(tier.id) || !/^[a-z][a-z0-9-]{0,31}$/u.test(tier.id)) throw new Error('tier id is invalid')
    if (ids.has(tier.id)) throw new Error('duplicate tier id')
    ids.add(tier.id)
    if (typeof tier.position !== 'number' || !Number.isInteger(tier.position) || tier.position < 1 || tier.position > RANKING_TIER_COUNT) {
      throw new Error('tier position must be 1..6')
    }
    if (positions.has(tier.position)) throw new Error('duplicate tier position')
    positions.add(tier.position)
    const label = tier.label
    if (label === null || typeof label !== 'object' || Array.isArray(label)) throw new Error('tier label is not an object')
    const pair = label as Record<string, unknown>
    if (!isText(pair.zh) || !isText(pair.en)) throw new Error('tier label needs zh and en')
    if (tier.catchAll !== undefined && typeof tier.catchAll !== 'boolean') throw new Error('tier catchAll must be boolean')
    const catchAll = tier.catchAll === true
    if (catchAll) {
      if (catchAllId !== '') throw new Error('more than one catch-all tier')
      catchAllId = tier.id
    }
    tiers.push({ id: tier.id, position: tier.position, label: { zh: pair.zh, en: pair.en }, catchAll })
  }
  if (catchAllId === '') throw new Error('ranking has no catch-all tier')
  if (positions.size !== RANKING_TIER_COUNT) throw new Error('tier positions must cover 1..6')
  tiers.sort((left, right) => left.position - right.position)

  if (doc.providers === null || typeof doc.providers !== 'object' || Array.isArray(doc.providers)) {
    throw new Error('ranking providers is not an object')
  }
  const manifest = doc.providers as Record<string, unknown>
  const known = new Set<string>(PROVIDER_KINDS)
  for (const key of Object.keys(manifest)) {
    if (!known.has(key)) throw new Error(`unknown provider kind in ranking: ${key}`)
  }
  const providers: ProviderMeta[] = []
  const rankSeen = new Map<string, Set<number>>()
  for (const kind of PROVIDER_KINDS) {
    const entry = manifest[kind]
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`missing provider metadata: ${kind}`)
    }
    const meta = entry as Record<string, unknown>
    if (meta.freeTier === undefined || meta.phone === undefined || meta.card === undefined) {
      throw new Error(`incomplete provider metadata: ${kind}`)
    }
    if (!isTriBool(meta.freeTier) || !isTriBool(meta.phone) || !isTriBool(meta.card)) {
      throw new Error(`provider metadata must be boolean or null: ${kind}`)
    }
    const hasTier = meta.tier !== undefined && meta.tier !== null
    const hasRank = meta.rank !== undefined && meta.rank !== null
    if (hasTier !== hasRank) throw new Error(`tier and rank must come in pairs: ${kind}`)
    let tier: string | undefined
    let rank: number | undefined
    if (hasTier) {
      if (typeof meta.tier !== 'string' || !ids.has(meta.tier)) throw new Error(`unknown tier: ${kind}`)
      const tierDef = tiers.find(item => item.id === meta.tier)
      if (tierDef?.catchAll === true) throw new Error(`catch-all tier cannot hold ranked members: ${kind}`)
      if (typeof meta.rank !== 'number' || !Number.isInteger(meta.rank) || meta.rank < 1) {
        throw new Error(`rank must be a positive integer: ${kind}`)
      }
      tier = meta.tier
      rank = meta.rank
      const seen = rankSeen.get(tier) ?? new Set<number>()
      if (seen.has(rank)) throw new Error(`duplicate in-tier rank: ${kind}`)
      seen.add(rank)
      rankSeen.set(tier, seen)
    }
    if (meta.note !== undefined && typeof meta.note !== 'string') throw new Error(`note must be a string: ${kind}`)
    if (meta.verifiedAt !== undefined && meta.verifiedAt !== null && typeof meta.verifiedAt !== 'string') {
      throw new Error(`verifiedAt must be a string or null: ${kind}`)
    }
    if (meta.source !== undefined && meta.source !== null && typeof meta.source !== 'string') {
      throw new Error(`source must be a string or null: ${kind}`)
    }
    providers.push({
      kind,
      ...(tier !== undefined && rank !== undefined ? { tier, rank } : {}),
      freeTier: meta.freeTier,
      phone: meta.phone,
      card: meta.card,
      note: typeof meta.note === 'string' ? meta.note : '',
      verifiedAt: typeof meta.verifiedAt === 'string' ? meta.verifiedAt : null,
      source: typeof meta.source === 'string' ? meta.source : null,
    })
  }
  return { schema: RANKING_SCHEMA, updatedAt: doc.updatedAt, tiers, providers, catchAllId }
}

/** @param partial - untrusted filter. @returns a complete, normalized filter. */
export function normalizeFilter(partial: Partial<RankingFilter> | undefined): RankingFilter {
  return {
    free: partial?.free === 'no' ? 'no' : 'yes',
    phone: partial?.phone === true,
    card: partial?.card === true,
  }
}

/**
 * The first level is mandatory and exclusive; the second level is a
 * multi-select OR. Unverified metadata (`null`) never claims a requirement.
 * @param meta - one provider's remote metadata.
 * @param filter - the normalized filter.
 * @returns whether the provider is visible.
 */
export function matchesFilter(meta: ProviderMeta, filter: RankingFilter): boolean {
  const freeOk = filter.free === 'yes' ? meta.freeTier === true : meta.freeTier !== true
  if (!freeOk) return false
  if (!filter.phone && !filter.card) return true
  return (filter.phone && meta.phone === true) || (filter.card && meta.card === true)
}

/**
 * Build the six groups from validated remote data, applying the filter.
 * Original ranks are preserved so filtering never renumbers the board.
 * @param data - validated remote payload.
 * @param filter - normalized filter.
 * @returns the ordered groups plus the visible count.
 */
export function buildGroups(data: RankingData, filter: RankingFilter): { groups: RankingGroup[]; totalVisible: number } {
  const order = new Map<string, number>(PROVIDER_KINDS.map((kind, index) => [kind, index]))
  const groups: RankingGroup[] = data.tiers.map(tier => ({
    id: tier.id,
    position: tier.position,
    label: tier.label,
    catchAll: tier.catchAll,
    kinds: [],
    ranks: {},
  }))
  const byId = new Map(groups.map(group => [group.id, group]))
  const catchAll = byId.get(data.catchAllId)
  if (catchAll === undefined) throw new Error('catch-all tier is missing')
  let totalVisible = 0
  for (const meta of data.providers) {
    if (!matchesFilter(meta, filter)) continue
    totalVisible += 1
    const group = meta.tier === undefined ? catchAll : byId.get(meta.tier)
    if (group === undefined) throw new Error(`provider points at an unknown tier: ${meta.kind}`)
    group.kinds.push(meta.kind)
    if (meta.rank !== undefined) group.ranks[meta.kind] = meta.rank
  }
  for (const group of groups) {
    group.kinds.sort((left, right) => {
      const l = group.ranks[left]
      const r = group.ranks[right]
      if (l !== undefined && r !== undefined) return l - r
      if (l !== undefined) return -1
      if (r !== undefined) return 1
      return (order.get(left) ?? 0) - (order.get(right) ?? 0)
    })
  }
  return { groups, totalVisible }
}

/** @param cause - unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** @param options - caller overrides. @returns the fetcher to use. */
function fetcherOf(options: RankingOptions): RankingFetcher {
  return options.fetcher ?? ((url, init) => fetch(url, init))
}

/**
 * Fetch the remote ranking (with a short TTL cache) and build the snapshot.
 * Every failure path returns `classified: false`; there is NO local fallback
 * ranking of any kind.
 * @param options - caller overrides, all optional.
 * @returns the API snapshot.
 */
export async function loadRanking(options: RankingOptions = {}): Promise<RankingSnapshot> {
  const url = options.url ?? rankingUrl(options.env)
  const filter = normalizeFilter(options.filter)
  const now = options.now ?? (() => Date.now())
  const ttl = options.ttlMs ?? RANKING_TTL_MS
  const failureTtl = options.failureTtlMs ?? RANKING_FAILURE_TTL_MS
  const base = {
    url,
    filter,
    fetchedAt: new Date(now()).toISOString(),
  }
  let cached = cache?.url === url ? cache : undefined
  // W round: a backend that just restarted has no in-memory cache — seed it
  // from the on-disk board so the FIRST request of the new process is also
  // answered instantly (a cold start must not block the panel on GitHub).
  if (cached === undefined && options.persistPath !== undefined) {
    const seeded = await persistedEntry(options.persistPath, url)
    if (seeded !== undefined) cached = seeded
  }

  // W round: a plain read that holds a CLASSIFIED board never blocks on a
  // GitHub round-trip. Fresh → return it; past its TTL → return it flagged
  // `stale` and refresh in the background, so the panel's first paint is
  // instant and the "updating" chip is the only freshness hint.
  if (options.force !== true && cached !== undefined && cached.data !== undefined) {
    const snapshot = snapshotFrom(cached, base, filter)
    if (now() - cached.at >= ttl) {
      snapshot.stale = true
      backgroundRefresh(options, url, now)
    }
    return snapshot
  }

  // A FRESH failure is also served from cache: the short failure TTL keeps an
  // offline host from hammering GitHub on every panel visit (pre-existing
  // behaviour, preserved through the W-round restructure).
  if (options.force !== true && cached !== undefined && cached.data === undefined && now() - cached.at < failureTtl) {
    return snapshotFrom(cached, base, filter)
  }

  // Cold (no usable data anywhere) or an explicit `force` (the user asked
  // for a fresh answer, even after a recent failure): fetch and wait.
  const entry = await fetchEntry(options, url, now)
  if (cached !== undefined && cached.data !== undefined && entry.data === undefined) {
    // The wait/refresh FAILED: keep serving the last good board (flagged
    // stale) instead of swapping the visible ranking for an error — the
    // client-cache rule (V round) mirrored on the host. The in-memory cache
    // is left at the last success, so the NEXT read re-triggers the
    // background refresh.
    const snapshot = snapshotFrom(cached, base, filter)
    snapshot.stale = true
    return snapshot
  }
  cache = entry
  if (entry.data !== undefined && options.persistPath !== undefined) {
    persistBoard(options.persistPath, entry)
  }
  return snapshotFrom(entry, base, filter)
}

/** The single fetch block of {@link loadRanking}, shared by the waiting and
 *  the background paths. */
async function fetchEntry(options: RankingOptions, url: string, now: () => number): Promise<CacheEntry> {
  let entry: CacheEntry
  try {
    const response = await fetcherOf(options)(url, {
      signal: AbortSignal.timeout(RANKING_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      entry = { url, at: now(), data: undefined, failure: 'http-error', message: `GitHub answered HTTP ${String(response.status)}` }
    } else {
      const text = await response.text()
      let data: RankingData
      try {
        data = parseRanking(JSON.parse(text) as unknown)
      } catch (cause) {
        const failure: RankingFailure = text.trimStart().startsWith('{') ? 'invalid-schema' : 'invalid-json'
        entry = { url, at: now(), data: undefined, failure, message: messageOf(cause) }
        cache = entry
        return entry
      }
      entry = { url, at: now(), data, failure: '', message: '' }
    }
  } catch (cause) {
    const aborted = cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')
    entry = {
      url,
      at: now(),
      data: undefined,
      failure: aborted ? 'timeout' : 'network-error',
      message: messageOf(cause),
    }
  }
  return entry
}

/** One in-flight background refresh per module: repeat reads share it. */
let background: Promise<void> | undefined

/** @param options - the request options. @param url - the board URL. @param now - the clock. */
function backgroundRefresh(options: RankingOptions, url: string, now: () => number): void {
  if (background !== undefined) return
  background = (async (): Promise<void> => {
    try {
      const entry = await fetchEntry(options, url, now)
      if (entry.data !== undefined) {
        cache = entry
        if (options.persistPath !== undefined) persistBoard(options.persistPath, entry)
      }
    } catch {
      // The fetch never throws (fetchEntry catches); kept so the Promise can
      // never reject into the void.
    } finally {
      background = undefined
    }
  })()
}

/** @param path - the persisted board file. @param url - the board it must belong to. */
async function persistedEntry(path: string, url: string): Promise<CacheEntry | undefined> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as { url?: string; at?: number; data?: unknown }
    if (parsed.url !== url || typeof parsed.at !== 'number' || parsed.data === undefined) return undefined
    return { url, at: parsed.at, data: parseRanking(parsed.data), failure: '', message: '' }
  } catch {
    return undefined
  }
}

/** @param path - the persisted board file. @param entry - the successful fetch. */
function persistBoard(path: string, entry: CacheEntry): void {
  const body = JSON.stringify({ url: entry.url, at: entry.at, data: entry.data })
  void writeFile(path, body, 'utf8').catch(() => { /* a dead disk must not take the ranking down */ })
}

/** @param base - common snapshot fields. @returns a fresh snapshot shell. */
function snapshotBase(base: {
  url: string
  filter: RankingFilter
  fetchedAt: string
}): RankingSnapshot {
  return {
    ok: false,
    classified: false,
    reason: '',
    message: '',
    ...base,
    updatedAt: '',
    groups: [],
    providers: [],
    totalVisible: 0,
  }
}

/**
 * @param entry - cached success or failure.
 * @param base - common snapshot fields.
 * @param filter - normalized filter.
 * @returns the snapshot the API sends.
 */
function snapshotFrom(entry: CacheEntry, base: {
  url: string
  filter: RankingFilter
  fetchedAt: string
}, filter: RankingFilter): RankingSnapshot {
  // `fetchedAt` must reflect WHEN THE DATA WAS ACTUALLY PULLED from GitHub
  // (the cache entry's write time), not the moment this snapshot object was
  // built. Without this, every cache hit would stamp "now" and the client's
  // "榜单更新于 …" line would lie about freshness.
  const snapshot = snapshotBase({ ...base, fetchedAt: new Date(entry.at).toISOString() })
  if (entry.data === undefined) {
    snapshot.reason = entry.failure
    snapshot.message = entry.message
    return snapshot
  }
  const built = buildGroups(entry.data, filter)
  snapshot.ok = true
  snapshot.classified = true
  snapshot.updatedAt = entry.data.updatedAt
  snapshot.groups = built.groups
  snapshot.providers = entry.data.providers
  snapshot.totalVisible = built.totalVisible
  return snapshot
}

/** Clear the in-memory cache (tests / explicit host reload). */
export function clearRankingCache(): void {
  cache = undefined
}

/** @param url - a request URL. @returns the normalized filter from its query. */
export function filterFromQuery(url: string | undefined): RankingFilter {
  const query = url === undefined ? new URLSearchParams() : new URL(url, 'http://localhost').searchParams
  const flag = (key: string): boolean => {
    const value = query.get(key)
    return value === '1' || value === 'true'
  }
  return normalizeFilter({ free: query.get('free') === 'no' ? 'no' : 'yes', phone: flag('phone'), card: flag('card') })
}

/**
 * The refresh interval the client asked for, in MILLISECONDS.
 * `?ttl=<hours>` is clamped to 1–168; absent or malformed values fall back to
 * the caller-supplied TTL (the 5-minute default for pre-Q-round clients).
 * @param url - a request URL. @param fallbackMs - TTL used when the query says nothing.
 * @returns the success-cache TTL in milliseconds.
 */
export function ttlMsFromQuery(url: string | undefined, fallbackMs: number = RANKING_TTL_MS): number {
  const query = url === undefined ? new URLSearchParams() : new URL(url, 'http://localhost').searchParams
  const raw = query.get('ttl')
  if (raw === null) return fallbackMs
  const hours = Number(raw)
  if (!Number.isFinite(hours)) return fallbackMs
  const clamped = Math.min(RANKING_TTL_MAX_HOURS, Math.max(RANKING_TTL_MIN_HOURS, hours))
  return Math.round(clamped * 3_600_000)
}

/** @param url - a request URL. @returns whether a fresh fetch was requested. */
export function forceFromQuery(url: string | undefined): boolean {
  const query = url === undefined ? new URLSearchParams() : new URL(url, 'http://localhost').searchParams
  const value = query.get('force')
  return value === '1' || value === 'true'
}

/**
 * Register `GET /api/aek/websearch/ranking` on the composition's web server.
 * @param ctx - the plugin context.
 * @param guard - the plugin's switched-off guard (returns true after replying).
 * @param persistPath - W round: where the last successful board is kept on
 *   disk (the slot's `websearch/ranking-board.json`) so a restarted backend
 *   answers instantly. Omitted in tests / bare compositions.
 */
export function registerRanking(ctx: Context, guard: RankingGuard, persistPath?: string): void {
  const server = (ctx as unknown as { webServer?: RankingWebServer }).webServer
  if (server === undefined) return
  ctx.effect(() => server.register({
    kind: 'exact',
    path: RANKING_API_PATH,
    handler: async (req, res) => {
      if (guard(res)) return
      if (req.method !== 'GET') {
        res.setHeader('allow', 'GET')
        send(res, 405, { code: 'method-not-allowed', message: 'use GET' })
        return
      }
      const snapshot = await loadRanking({
        filter: filterFromQuery(req.url),
        ttlMs: ttlMsFromQuery(req.url),
        force: forceFromQuery(req.url),
        persistPath,
      })
      send(res, 200, snapshot)
    },
  }), 'aek-websearch: remote provider ranking')
}

/** @param res - response. @param status - HTTP status. @param body - JSON body. */
function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}
