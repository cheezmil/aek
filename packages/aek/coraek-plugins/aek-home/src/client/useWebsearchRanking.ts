/**
 * Browser reader for the remote Web Search ranking.
 *
 * This module mirrors the host's JSON shape; it deliberately does NOT import
 * from `@cheezmil/aek-websearch` (a client bundle must not value-import host
 * modules). It contains no tier names, no provider-to-tier mapping and no
 * ranks — all of that arrives from `/api/aek/websearch/ranking`, whose data
 * comes from the GitHub-hosted file. When the host reports
 * `classified: false`, the panel keeps the last classified board on screen
 * (stale) instead of collapsing the layout.
 *
 * Q round (2026-11-12): the board is INTERVAL-driven, not visit-driven. A
 * module-level cache renders the last snapshot instantly on panel remount
 * (no re-request, no layout shift, no skeleton flash), a background timer
 * re-reads only after the configured TTL (default 24 h, the Web Search
 * plugin setting), and the sidebar refresh button forces a fresh read via
 * `force=1`.
 *
 * V round (2026-11-13): the cache only ever stores CLASSIFIED snapshots. A
 * failed or unclassified read never clobbers the last good board — the
 * panel keeps its grouped shape, shows a stale notice, and self-heals the
 * moment a read succeeds again (background sweep or manual force).
 *
 * @module @cheezmil/aek-home/src/client/useWebsearchRanking
 */
import { useCallback, useEffect, useState } from 'react'

/** The host route that serves the remote ranking. */
export const RANKING_API = '/api/aek/websearch/ranking'

/** The mandatory, exclusive first-level choice. */
export type FreeFilter = 'yes' | 'no'

/** The filter sent to the host. */
export interface RankingFilter {
  /** `yes` = has a free tier; `no` = everything else, including unverified. */
  free: FreeFilter
  /** Second-level multi-select (OR semantics on the host). */
  phone: boolean
  /** Second-level multi-select (OR semantics on the host). */
  card: boolean
}

/** One bilingual group label, straight from the remote data file. */
export interface TierLabel { zh: string; en: string }

/** One of the six groups. */
export interface RankingGroup {
  id: string
  position: number
  label: TierLabel
  catchAll: boolean
  kinds: string[]
  /** Original in-tier rank per kind (filtering never renumbers the board). */
  ranks: Record<string, number>
}

/** One provider's remote metadata. `null` means "not verified". */
export interface ProviderMeta {
  kind: string
  tier?: string
  rank?: number
  freeTier: boolean | null
  phone: boolean | null
  card: boolean | null
  note: string
  verifiedAt: string | null
  source: string | null
}

/** The host snapshot. `classified: false` means "do not group anything". */
export interface RankingSnapshot {
  ok: boolean
  classified: boolean
  reason: string
  message: string
  url: string
  fetchedAt: string
  updatedAt: string
  filter: RankingFilter
  groups: RankingGroup[]
  /** ALL provider metadata, including rows hidden by the filter. */
  providers: ProviderMeta[]
  totalVisible: number
  /**
   * W round: true when the host served this board from its (or the
   * on-disk) cache because the TTL has passed, and a background refresh is
   * in flight. The board is shown INSTANTLY — the chip in the panel is the
   * only freshness hint; no blocking wait on the panel's first paint.
   */
  stale?: boolean
}

/** Live ranking state exposed to the Web Search panel. */
export interface RankingState {
  /**
   * The last CLASSIFIED snapshot for this filter, or `undefined` when no
   * read has ever succeeded. Failed / unclassified reads never replace it
   * (V round), so the visible board keeps its grouped shape.
   */
  snapshot: RankingSnapshot | undefined
  /** True while a read is in flight. */
  loading: boolean
  /**
   * The reason the latest read failed or reported no classification
   * (transport error OR host-side `classified: false`). `undefined` while
   * the visible board is fresh.
   */
  error: string | undefined
  /** Force a fresh read. */
  refresh: () => void
}

/** Options controlling one read of the ranking board. */
export interface RankingReadOptions {
  /** Refresh interval in hours (the Web Search plugin setting, default 24). */
  ttlHours?: number | undefined
  /** Manual refresh: bypass the host cache entirely. */
  force?: boolean | undefined
  /**
   * The external force signal (the sidebar refresh button, or the panel's
   * own refresh). `> 0` forces a fresh read on that tick.
   */
  forceSignal?: number | undefined
}

/** @param filter - the filter to send. @param options - TTL / force. @returns the request URL. */
export function rankingQuery(filter: RankingFilter, options: RankingReadOptions = {}): string {
  const query = new URLSearchParams({ free: filter.free })
  if (filter.phone) query.set('phone', '1')
  if (filter.card) query.set('card', '1')
  if (options.ttlHours !== undefined) query.set('ttl', String(options.ttlHours))
  if (options.force === true) query.set('force', '1')
  return `${RANKING_API}?${query.toString()}`
}

/**
 * Module-level ranking cache (Q round): switching away from the Web Search
 * page remounts the panel, and every remount used to re-request the board —
 * which, after the host's 5-minute TTL, re-fetched GitHub every visit. The
 * board is interval-driven now: the cached snapshot renders instantly on
 * remount, and a background timer re-reads only once the TTL passes.
 */
interface CacheEntry {
  snapshot: RankingSnapshot
  /** When THIS client read succeeded (ms), not the host fetch time. */
  readAtMs: number
}
const rankingCache = new Map<string, CacheEntry>()
/** Key: the same filter values two mounts share. */
function cacheKey(filter: RankingFilter): string {
  return `${filter.free}:${filter.phone ? 1 : 0}:${filter.card ? 1 : 0}`
}
/** The interval a background re-read is allowed to idle before it runs. */
const STALENESS_CHECK_MS = 60_000

/** @param cause - unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Default refresh interval in hours (the Web Search plugin setting default). */
export const RANKING_TTL_DEFAULT_HOURS = 24

/**
 * Read the remote ranking with interval semantics (Q round).
 *
 * - A cache hit for the current filter renders INSTANTLY on mount: switching
 *   back to the Web Search page never re-fetches, so the board neither flickers
 *   nor causes a layout shift (skeletons show only on the very first read).
 * - The host re-fetches GitHub at most every `ttlHours` (default 24) — the
 *   `ttl` query parameter tells it the interval; the background timer below
 *   only ever RE-READS the host route once that window has passed.
 * - `forceSignal` (the sidebar refresh button) bumps on every user click and
 *   triggers a `force=1` read that bypasses every cache.
 *
 * @param filter - host-persisted filter (see `preferences.tsx`).
 * @param options - TTL hours and the external force signal.
 * @returns the live ranking state.
 */
export function useWebsearchRanking(filter: RankingFilter, options: RankingReadOptions = {}): RankingState {
  const [snapshot, setSnapshot] = useState<RankingSnapshot | undefined>(
    () => rankingCache.get(cacheKey(filter))?.snapshot,
  )
  const [loading, setLoading] = useState<boolean>(
    () => rankingCache.get(cacheKey(filter)) === undefined,
  )
  const [error, setError] = useState<string | undefined>(undefined)
  const [manualTick, setManualTick] = useState(0)
  const { free, phone, card } = filter
  const key = cacheKey({ free, phone, card })
  const ttlHours = options.ttlHours
  const forceSignal = options.forceSignal ?? 0

  useEffect(() => {
    const controller = new AbortController()
    const ttlMs = (ttlHours ?? RANKING_TTL_DEFAULT_HOURS) * 3_600_000
    const doRead = (opts: { force: boolean; silent: boolean }): void => {
      if (!opts.silent) setLoading(true)
      void fetch(rankingQuery({ free, phone, card }, { ttlHours, force: opts.force }), {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
          return await response.json() as RankingSnapshot
        })
        .then((data) => {
          if (controller.signal.aborted) return
          if (data.ok && data.classified) {
            // Only a classified board enters the cache and the visible state —
            // a failed/unclassified read must never reshape the board.
            rankingCache.set(key, { snapshot: data, readAtMs: Date.now() })
            setSnapshot(data)
            setError(undefined)
          } else {
            // V round: GitHub unreachable / unclassified payload → keep the
            // last classified snapshot (or nothing, on the first read ever)
            // and surface the reason so the panel shows a stale notice
            // instead of a layout-jumping fallback list.
            setError(data.reason || data.message || 'ranking unavailable')
          }
          if (!opts.silent) setLoading(false)
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return
          // V round: transport errors also preserve the visible board — only
          // the SNAPSHOT state is protected, and the error reason surfaces as
          // a stale notice next to it.
          setError(messageOf(cause))
          if (!opts.silent) setLoading(false)
        })
    }
    const cached = rankingCache.get(key)
    const forced = forceSignal > 0 || manualTick > 0
    if (cached === undefined || forced) {
      // First read ever, or the user's manual refresh (force bypasses even
      // the host cache). A filter change to an UNSEEN filter is a cache MISS
      // by key, so a plain read is enough there.
      doRead({ force: forced, silent: forced && cached !== undefined })
    } else {
      // X round: switching BACK to a filter that was read before is a cache
      // HIT — the effect used to do nothing, leaving the VISIBLE snapshot on
      // the previous filter's board ("点筛选怎么都没变化"). Sync the cached
      // snapshot into the visible state instantly (no network); the
      // background sweep below handles its TTL.
      setSnapshot(cached.snapshot)
      setError(undefined)
    }
    // Background sweep: once the TTL window has passed, re-read SILENTLY —
    // the visible board stays put until the fresh answer lands.
    const timer = setInterval(() => {
      const entry = rankingCache.get(key)
      if (entry === undefined || Date.now() - entry.readAtMs < ttlMs) return
      doRead({ force: true, silent: true })
    }, STALENESS_CHECK_MS)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [free, phone, card, key, ttlHours, forceSignal, manualTick])

  /** Manual force read (kept for API compatibility with earlier panels). */
  const refresh = useCallback(() => setManualTick(value => value + 1), [])
  return { snapshot, loading, error, refresh }
}
