/**
 * Browser reader for the remote Web Search ranking.
 *
 * This module mirrors the host's JSON shape; it deliberately does NOT import
 * from `@cheezmil/aek-websearch` (a client bundle must not value-import host
 * modules). It contains no tier names, no provider-to-tier mapping and no
 * ranks — all of that arrives from `/api/aek/websearch/ranking`, whose data
 * comes from the GitHub-hosted file. When the host reports
 * `classified: false`, the caller renders a flat, ungrouped list.
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
}

/** Live ranking state exposed to the Web Search panel. */
export interface RankingState {
  /** `undefined` until the first read resolves. */
  snapshot: RankingSnapshot | undefined
  /** True while a read is in flight. */
  loading: boolean
  /** Transport-level error; a host-side no-classification result is NOT an error. */
  error: string | undefined
  /** Force a fresh read. */
  refresh: () => void
}

/** @param filter - the filter to send. @returns the request URL. */
export function rankingQuery(filter: RankingFilter): string {
  const query = new URLSearchParams({ free: filter.free })
  if (filter.phone) query.set('phone', '1')
  if (filter.card) query.set('card', '1')
  return `${RANKING_API}?${query.toString()}`
}

/** @param cause - unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Read the remote ranking whenever the filter changes.
 * @param filter - host-persisted filter (see `preferences.tsx`).
 * @returns the live ranking state.
 */
export function useWebsearchRanking(filter: RankingFilter): RankingState {
  const [snapshot, setSnapshot] = useState<RankingSnapshot | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [revision, setRevision] = useState(0)
  const { free, phone, card } = filter

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void fetch(rankingQuery({ free, phone, card }), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return await response.json() as RankingSnapshot
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setSnapshot(data)
        setError(undefined)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(messageOf(cause))
        setLoading(false)
      })
    return () => { controller.abort() }
  }, [free, phone, card, revision])

  const refresh = useCallback(() => setRevision(value => value + 1), [])
  return { snapshot, loading, error, refresh }
}
