/**
 * Remote Web Search ranking: schema validation, filtering, degradation and
 * cache behaviour.
 *
 * NOTE (user rule): NO test below hardcodes which provider sits in which tier
 * or at which rank. Those facts live in `data/provider-ranking.json` and are
 * read dynamically. These specs pin the SCHEMA and the BEHAVIOUR, so editing
 * the data file can change the board without touching any product code.
 *
 * @module aek-websearch/tests/ranking.spec
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PROVIDER_KINDS } from '../src/defaults.ts'
import {
  buildGroups,
  clearRankingCache,
  RANKING_REFRESH_BACKOFF_MS,
  filterFromQuery,
  loadRanking,
  matchesFilter,
  normalizeFilter,
  parseRanking,
  rankingUrl,
} from '../src/ranking.ts'
import type { ProviderMeta, RankingData, RankingFetcher, RankingFilter } from '../src/ranking.ts'

const DATA_PATH = fileURLToPath(new URL('../data/provider-ranking.json', import.meta.url))
const DATA_TEXT = readFileSync(DATA_PATH, 'utf8')
const REAL = parseRanking(JSON.parse(DATA_TEXT) as unknown)
const URL_A = 'https://ranking.example.test/board.json'
const URL_B = 'https://mirror.example.test/board.json'

/** @param text - body to return. @param ok - HTTP success. @returns a fetcher. */
function fetcherOf(text: string, ok = true): RankingFetcher {
  return async () => ({ ok, status: ok ? 200 : 404, text: async () => text })
}

/** @param data - validated ranking. @returns its catch-all tier id. */
function catchAllOf(data: RankingData): string {
  return data.catchAllId
}

/** @param freeTier - free-tier fact. @param phone - phone fact. @param card - card fact. @returns metadata. */
function metaOf(freeTier: boolean | null, phone: boolean | null, card: boolean | null): ProviderMeta {
  return { kind: 'fixture', freeTier, phone, card, note: '', verifiedAt: null, source: null }
}

/** @returns the first ranked (non catch-all) tier id from the real data file. */
function firstRankedTier(): string {
  return REAL.tiers.find(tier => !tier.catchAll)?.id ?? ''
}

beforeEach(() => { clearRankingCache() })

describe('the repository data file', () => {
  it('is a valid schema-1 payload with six ordered tiers', () => {
    expect(REAL.schema).toBe(1)
    expect(REAL.tiers).toHaveLength(6)
    expect(REAL.tiers.map(tier => tier.position)).toEqual([1, 2, 3, 4, 5, 6])
    expect(REAL.tiers.filter(tier => tier.catchAll)).toHaveLength(1)
  })

  it('describes every adapter this package can drive', () => {
    expect(REAL.providers.map(meta => meta.kind)).toEqual([...PROVIDER_KINDS])
  })

  it('has consecutive ranks inside every ranked tier', () => {
    for (const tier of REAL.tiers.filter(item => !item.catchAll)) {
      const ranks = REAL.providers
        .filter(meta => meta.tier === tier.id)
        .map(meta => meta.rank ?? 0)
        .sort((left, right) => left - right)
      expect(ranks).toEqual(ranks.map((_, index) => index + 1))
    }
  })

  it('puts every provider without an explicit tier into the catch-all group', () => {
    const grouped = buildGroups(REAL, normalizeFilter({ free: 'yes' }))
    const catchAll = grouped.groups.find(group => group.id === catchAllOf(REAL))
    expect(catchAll).toBeDefined()
    const expected = REAL.providers
      .filter(meta => meta.tier === undefined && matchesFilter(meta, normalizeFilter({ free: 'yes' })))
      .map(meta => meta.kind)
    expect(catchAll?.kinds).toEqual(expected)
  })
})

describe('parseRanking (strict validation)', () => {
  /** @param mutate - patch applied to a deep clone. @returns the clone. */
  const patched = (mutate: (doc: Record<string, unknown>) => void): unknown => {
    const doc = JSON.parse(DATA_TEXT) as Record<string, unknown>
    mutate(doc)
    return doc
  }
  /** @param patch - provider patch. @returns a patched payload. */
  const withProvider = (patch: Record<string, unknown>): unknown => patched((doc) => {
    const providers = doc.providers as Record<string, Record<string, unknown>>
    const first = providers[PROVIDER_KINDS[0] ?? '']
    if (first !== undefined) Object.assign(first, patch)
  })

  const invalid: ReadonlyArray<readonly [string, () => unknown]> = [
    ['a non-object payload', () => null],
    ['a wrong schema', () => patched((doc) => { doc.schema = 99 })],
    ['five tiers', () => patched((doc) => { doc.tiers = (doc.tiers as unknown[]).slice(0, 5) })],
    ['no catch-all tier', () => patched((doc) => {
      doc.tiers = (doc.tiers as Record<string, unknown>[]).map(tier => ({ ...tier, catchAll: false }))
    })],
    ['two catch-all tiers', () => patched((doc) => {
      doc.tiers = (doc.tiers as Record<string, unknown>[]).map(tier => ({ ...tier, catchAll: true }))
    })],
    ['a duplicate tier position', () => patched((doc) => {
      const tiers = doc.tiers as Record<string, unknown>[]
      doc.tiers = tiers.map((tier, index) => ({ ...tier, position: index === 0 ? 2 : tier.position }))
    })],
    ['a missing label', () => patched((doc) => {
      const tiers = doc.tiers as Record<string, unknown>[]
      if (tiers[0] !== undefined) delete tiers[0].label
    })],
    ['an unknown provider kind', () => patched((doc) => {
      (doc.providers as Record<string, unknown>)['invented-provider'] = {}
    })],
    ['a missing provider', () => patched((doc) => {
      const providers = doc.providers as Record<string, unknown>
      delete providers[PROVIDER_KINDS[0] ?? '']
    })],
    ['a rank without a tier', () => withProvider({ tier: undefined, rank: 5 })],
    ['a tier without a rank', () => withProvider({ tier: firstRankedTier(), rank: undefined })],
    ['a non-integer rank', () => withProvider({ tier: firstRankedTier(), rank: 1.5 })],
    ['a rank in the catch-all tier', () => withProvider({ tier: REAL.catchAllId, rank: 7 })],
    ['malformed metadata', () => withProvider({ freeTier: 'maybe' })],
  ]
  it.each(invalid)('rejects %s', (_label, build) => {
    expect(() => parseRanking(build())).toThrow()
  })

  it('rejects duplicate in-tier ranks', () => {
    const doc = JSON.parse(DATA_TEXT) as { providers: Record<string, { tier?: string; rank?: number }> }
    const ranked = Object.values(doc.providers).filter(meta => meta.tier !== undefined)
    expect(ranked.length).toBeGreaterThan(1)
    if (ranked[1] !== undefined) ranked[1].rank = ranked[0]?.rank ?? 1
    expect(() => parseRanking(doc)).toThrow(/duplicate in-tier rank/u)
  })
})

describe('filtering', () => {
  const filter = (free: RankingFilter['free'], phone = false, card = false): RankingFilter =>
    normalizeFilter({ free, phone, card })

  it('defaults to the mandatory "has free tier" choice', () => {
    expect(normalizeFilter(undefined)).toEqual({ free: 'yes', phone: false, card: false })
    expect(normalizeFilter({})).toEqual({ free: 'yes', phone: false, card: false })
    expect(normalizeFilter({ free: 'no' })).toEqual({ free: 'no', phone: false, card: false })
  })

  it('keeps only verified free tiers on level 1 = yes', () => {
    const visible = REAL.providers.filter(meta => matchesFilter(meta, filter('yes')))
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.every(meta => meta.freeTier === true)).toBe(true)
  })

  it('treats unverified metadata as "no free tier" on level 1 = no', () => {
    const visible = REAL.providers.filter(meta => matchesFilter(meta, filter('no')))
    expect(visible.every(meta => meta.freeTier !== true)).toBe(true)
    expect(visible.some(meta => meta.freeTier === null)).toBe(true)
  })

  it('never lets unverified signup requirements match a level-2 choice', () => {
    expect(matchesFilter(metaOf(true, null, null), filter('yes', true))).toBe(false)
    expect(matchesFilter(metaOf(true, false, null), filter('yes', false, true))).toBe(false)
    expect(REAL.providers.filter(meta => matchesFilter(meta, filter('yes', true)))
      .every(meta => meta.phone === true)).toBe(true)
    const cardVisible = REAL.providers.filter(meta => matchesFilter(meta, filter('yes', false, true)))
    expect(cardVisible.every(meta => meta.card === true)).toBe(true)
    expect(cardVisible.length).toBeGreaterThan(0)
  })

  it('uses OR semantics when both level-2 choices are selected', () => {
    expect(matchesFilter(metaOf(true, true, false), filter('yes', true, true))).toBe(true)
    expect(matchesFilter(metaOf(true, false, true), filter('yes', true, true))).toBe(true)
    expect(matchesFilter(metaOf(true, false, false), filter('yes', true, true))).toBe(false)
  })

  it('keeps the remote rank values verbatim in every group', () => {
    const all = buildGroups(REAL, filter('yes'))
    for (const meta of REAL.providers.filter(item => item.rank !== undefined && matchesFilter(item, filter('yes')))) {
      const group = all.groups.find(item => item.id === meta.tier)
      expect(group?.ranks[meta.kind]).toBe(meta.rank)
    }
  })

  it('parses the query string into a complete filter', () => {
    expect(filterFromQuery('/api/aek/websearch/ranking')).toEqual(filter('yes'))
    expect(filterFromQuery('/api/aek/websearch/ranking?free=no&phone=1&card=true'))
      .toEqual({ free: 'no', phone: true, card: true })
  })
})

describe('rankingUrl', () => {
  it('uses the repository raw URL by default', () => {
    expect(rankingUrl({})).toMatch(/^https:\/\/raw\.githubusercontent\.com\//u)
  })

  it('honours an http/https override and rejects other schemes', () => {
    expect(rankingUrl({ AEK_WEBSEARCH_RANKING_URL: URL_B })).toBe(URL_B)
    expect(rankingUrl({ AEK_WEBSEARCH_RANKING_URL: 'file:///etc/passwd' }))
      .toBe(rankingUrl({}))
    expect(rankingUrl({ AEK_WEBSEARCH_RANKING_URL: 'not a url' })).toBe(rankingUrl({}))
  })
})

describe('loadRanking (runtime fetch + degradation)', () => {
  it('classifies six groups from a fetched payload', async () => {
    const snapshot = await loadRanking({ url: URL_A, fetcher: fetcherOf(DATA_TEXT) })
    expect(snapshot.ok).toBe(true)
    expect(snapshot.classified).toBe(true)
    expect(snapshot.groups).toHaveLength(6)
    expect(snapshot.providers).toHaveLength(PROVIDER_KINDS.length)
    expect(snapshot.reason).toBe('')
  })

  const failures: ReadonlyArray<readonly [string, RankingFetcher, string]> = [
    ['HTTP 404', fetcherOf('not found', false), 'http-error'],
    ['malformed JSON', fetcherOf('<html>offline</html>'), 'invalid-json'],
    ['an invalid schema', fetcherOf('{"schema":99}'), 'invalid-schema'],
    ['a network failure', async () => { throw new Error('ENOTFOUND') }, 'network-error'],
  ]
  it.each(failures)('degrades to unclassified on %s', async (_label, fetcher, reason) => {
    const snapshot = await loadRanking({ url: URL_A, fetcher, failureTtlMs: 0 })
    expect(snapshot.ok).toBe(false)
    expect(snapshot.classified).toBe(false)
    expect(snapshot.groups).toHaveLength(0)
    expect(snapshot.reason).toBe(reason)
    expect(snapshot.message.length).toBeGreaterThan(0)
  })

  it('degrades on a timeout', async () => {
    const timeout = async (): Promise<never> => {
      const error = new Error('timed out')
      error.name = 'TimeoutError'
      throw error
    }
    const snapshot = await loadRanking({ url: URL_A, fetcher: timeout, failureTtlMs: 0 })
    expect(snapshot.reason).toBe('timeout')
    expect(snapshot.classified).toBe(false)
  })

  it('caches a success for the TTL and re-fetches after it expires', async () => {
    let calls = 0
    const fetcher: RankingFetcher = async () => {
      calls += 1
      return { ok: true, status: 200, text: async () => DATA_TEXT }
    }
    let clock = 1000
    const options = { url: URL_A, fetcher, now: () => clock, ttlMs: 5000 }
    await loadRanking(options)
    await loadRanking(options)
    expect(calls).toBe(1)
    clock += 5001
    await loadRanking(options)
    expect(calls).toBe(2)
  })

  it('caches a failure briefly so an offline host does not hammer GitHub', async () => {
    let calls = 0
    const fetcher: RankingFetcher = async () => {
      calls += 1
      return { ok: false, status: 503, text: async () => '' }
    }
    let clock = 1000
    const options = { url: URL_A, fetcher, now: () => clock, failureTtlMs: 10_000 }
    await loadRanking(options)
    await loadRanking(options)
    expect(calls).toBe(1)
    clock += 10_001
    await loadRanking(options)
    expect(calls).toBe(2)
  })

  it('never reuses a cached board for a different URL', async () => {
    const urls: string[] = []
    const fetcher: RankingFetcher = async (url) => {
      urls.push(url)
      return { ok: true, status: 200, text: async () => DATA_TEXT }
    }
    await loadRanking({ url: URL_A, fetcher })
    await loadRanking({ url: URL_B, fetcher })
    expect(urls).toEqual([URL_A, URL_B])
  })

  it('applies the requested filter without re-fetching', async () => {
    let calls = 0
    const fetcher: RankingFetcher = async () => {
      calls += 1
      return { ok: true, status: 200, text: async () => DATA_TEXT }
    }
    const base = { url: URL_A, fetcher }
    const yes = await loadRanking({ ...base, filter: { free: 'yes' } })
    const no = await loadRanking({ ...base, filter: { free: 'no' } })
    expect(calls).toBe(1)
    expect(yes.totalVisible).not.toBe(no.totalVisible)
  })
})

/**
 * Y round: a board whose refresh keeps FAILING must not claim "updating in
 * the background" on every page open (the user's 11-11 cache stuck behind a
 * spinning chip). The host reports `refreshFailed` instead and backs off.
 */
describe('Y round: honest refresh-failure reporting', () => {
  it('reports a failed FORCED refresh as refreshFailed, never as stale', async () => {
    let fail = false
    let calls = 0
    const fetcher: RankingFetcher = async () => {
      calls += 1
      return fail
        ? { ok: false, status: 503, text: async () => '' }
        : { ok: true, status: 200, text: async () => DATA_TEXT }
    }
    let clock = 1000
    const options = { url: URL_A, fetcher, now: () => clock, ttlMs: 5000 }
    const seeded = await loadRanking(options)
    expect(seeded.classified).toBe(true)
    // Let the TTL pass, break the remote, and force a fresh read.
    fail = true
    clock += 5001
    const failed = await loadRanking({ ...options, force: true })
    expect(failed.classified).toBe(true)
    expect(failed.stale).toBeUndefined()
    expect(failed.refreshFailed).toEqual({
      reason: 'http-error',
      message: 'GitHub answered HTTP 503',
      at: new Date(clock).toISOString(),
    })
  })

  it('holds a failing refresh in backoff — no re-fetch, an honest flag', async () => {
    let fail = true
    let calls = 0
    const fetcher: RankingFetcher = async () => {
      calls += 1
      return fail
        ? { ok: false, status: 503, text: async () => '' }
        : { ok: true, status: 200, text: async () => DATA_TEXT }
    }
    let clock = 1000
    const options = { url: URL_A, fetcher, now: () => clock, ttlMs: 5000 }
    fail = false
    await loadRanking(options)
    fail = true
    clock += 5001
    await loadRanking({ ...options, force: true }) // records the failure
    const early = await loadRanking(options)
    expect(early.classified).toBe(true)
    expect(early.stale).toBeUndefined()
    expect(early.refreshFailed?.reason).toBe('http-error')
    expect(calls).toBe(2) // the backoff swallowed the retry
  })

  it('retries after the backoff window and a success clears the flag', async () => {
    let fail = true
    let calls = 0
    const fetcher: RankingFetcher = async () => {
      calls += 1
      return fail
        ? { ok: false, status: 503, text: async () => '' }
        : { ok: true, status: 200, text: async () => DATA_TEXT }
    }
    let clock = 1000
    const options = { url: URL_A, fetcher, now: () => clock, ttlMs: 5000 }
    fail = false
    await loadRanking(options)
    fail = true
    clock += 5001
    await loadRanking({ ...options, force: true })
    // Cross the backoff window: the next read may claim "in progress" again.
    clock += RANKING_REFRESH_BACKOFF_MS + 1
    const retrying = await loadRanking(options)
    expect(retrying.stale).toBe(true)
    expect(retrying.refreshFailed).toBeUndefined()
    // The background retry succeeds: the flag is gone, the cache is fresh.
    fail = false
    await new Promise(resolve => { setTimeout(resolve, 0) })
    const after = await loadRanking({ ...options, force: true })
    expect(after.stale).toBeUndefined()
    expect(after.refreshFailed).toBeUndefined()
    expect(after.classified).toBe(true)
  })
})
