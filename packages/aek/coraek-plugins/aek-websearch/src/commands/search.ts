import { Command, Flags, Args } from '@oclif/core'
import { KeyStore } from '@cheezmil/prevent-agent-directly-seeing-key'
import { DEFAULT_ATTEMPT_TIMEOUT_MS, MAX_ATTEMPT_TIMEOUT_MS } from '../defaults.ts'

// ── Inline KeyPool (avoids shared chunk) ─────────────────────────────────────
const PERMANENT_STATUS = new Set([401, 403, 402, 432])
const BALANCE_STATUS = new Set([402, 432])
interface PoolEntry { id: number; key: string; disabled: boolean; failures: number; cooldownEnd: number }

// R1: record WHY a key was disabled in the same SQLCipher database the console
// reads. Kept inline (no shared chunk) and best-effort: bookkeeping must never
// break a search. The console writes 'manual' for its own disable button.
function recordDisableReason(store: KeyStore, id: number, reason: string) {
  try {
    const db = (store as any).getDb?.()
    if (!db) return
    db.exec("CREATE TABLE IF NOT EXISTS key_flags (key_id INTEGER PRIMARY KEY, reason TEXT NOT NULL DEFAULT '')")
    db.prepare('INSERT OR REPLACE INTO key_flags (key_id, reason) VALUES (?, ?)').run(id, reason)
  } catch { /* best effort */ }
}
function clearDisableReason(store: KeyStore, id: number) {
  try {
    const db = (store as any).getDb?.()
    if (!db) return
    db.exec("CREATE TABLE IF NOT EXISTS key_flags (key_id INTEGER PRIMARY KEY, reason TEXT NOT NULL DEFAULT '')")
    db.prepare('DELETE FROM key_flags WHERE key_id=?').run(id)
  } catch { /* best effort */ }
}

class KeyPool {
  readonly provider: string
  private store: KeyStore
  private entries: PoolEntry[] = []
  private currentIndex = 0
  constructor(provider: string) {
    this.provider = provider
    this.store = new KeyStore(provider)
    this.reload()
  }
  private reload() {
    const rows = this.store.load()
    const now = Date.now()
    this.entries = rows.map((r: any) => ({
      id: r.id, key: r.key, disabled: r.disabled,
      failures: r.failures,
      cooldownEnd: r.cooldownEnd > now ? r.cooldownEnd : 0,
    }))
    this.currentIndex = 0
  }
  count() { return this.entries.length }
  next(): string | undefined {
    const now = Date.now()
    const n = this.entries.length
    if (n === 0) return undefined
    for (let i = 0; i < n; i++) {
      const idx = (this.currentIndex + i) % n
      const e = this.entries[idx]
      if (e.disabled || e.cooldownEnd > now) continue
      this.currentIndex = (idx + 1) % n
      return e.key
    }
    return undefined
  }
  reportSuccess(key: string) {
    for (const e of this.entries) {
      if (e.key === key) {
        e.failures = 0; e.cooldownEnd = 0
        this.store.enableById(e.id)
        clearDisableReason(this.store, e.id)
        return
      }
    }
  }
  reportFailure(key: string, permanent: boolean, status?: number) {
    for (const e of this.entries) {
      if (e.key !== key) continue
      if (permanent) {
        e.disabled = true
        this.store.disableById(e.id)
        recordDisableReason(this.store, e.id, status !== undefined && BALANCE_STATUS.has(status) ? 'balance' : 'invalid')
        return
      }
      e.failures++
      e.cooldownEnd = Date.now() + Math.min(60_000 * Math.pow(5, e.failures - 1), 3_600_000)
      this.store.enableById(e.id)
    }
  }
  status() {
    const now = Date.now()
    return this.entries.map((e, i) => ({
      index: i, masked: e.key.length <= 8 ? '****' : e.key.slice(0,4)+'....'+e.key.slice(-4),
      disabled: e.disabled, failures: e.failures,
      cooldownRemaining: e.cooldownEnd > now ? `${Math.ceil((e.cooldownEnd-now)/1000)}s` : undefined,
    }))
  }
  disableKeyByIdx(idx: number) {
    if (idx < 0 || idx >= this.entries.length) throw new Error(`index ${idx} out of range`)
    this.entries[idx].disabled = true
    this.store.disableById(this.entries[idx].id)
    recordDisableReason(this.store, this.entries[idx].id, 'manual')
  }
  enableKeyByIdx(idx: number) {
    if (idx < 0 || idx >= this.entries.length) throw new Error(`index ${idx} out of range`)
    const e = this.entries[idx]; e.disabled = false; e.failures = 0; e.cooldownEnd = 0; this.store.enableById(e.id)
    clearDisableReason(this.store, e.id)
  }
  resetCooldown() {
    for (const e of this.entries) { e.failures = 0; e.cooldownEnd = 0 }
    this.store.resetCooldowns()
  }
  close() { this.store.close() }
}

function classifyStatus(s: number) { return PERMANENT_STATUS.has(s) }

async function postJSON(url: string, body: any, headers: Record<string, string>, signal: AbortSignal): Promise<any> {
  const res = await fetch(url, { method: 'POST', redirect: 'error', signal,
    headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'aekws/1.0.0', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      if (typeof err === 'object' && err !== null) {
        const u = err.detail && typeof err.detail === 'object' ? err.detail : err
        detail = u.error ?? u.message ?? u.detail ?? JSON.stringify(err) ?? detail
      } else { detail = String(err) ?? detail }
    } catch { /* keep */ }
    const e = new Error(String(detail)); Object.assign(e, { status: res.status }); throw e
  }
  return res.json()
}

async function searchTavily(key: string, query: string, maxResults: number, signal: AbortSignal) {
  const body = await postJSON('https://api.tavily.com/search', {
    api_key: key, query, max_results: maxResults, search_depth: 'basic', include_answer: true,
  }, {}, signal)
  const sources = (body.results ?? []).filter((r: any) => r.url).map((r: any) => ({
    url: r.url, title: r.title ?? '', snippet: r.content ?? '', publishedAt: r.published_date,
  }))
  return { content: typeof body.answer === 'string' ? body.answer : undefined, sources }
}

async function searchExa(key: string, query: string, maxResults: number, signal: AbortSignal) {
  const body = await postJSON('https://api.exa.ai/search', {
    query, type: 'auto', numResults: Math.min(maxResults, 100), contents: { highlights: true },
  }, { authorization: `Bearer ${key}` }, signal)
  const sources = (body.results ?? []).map((r: any) => {
    const snippet = (r.highlights ?? []).find((h: any) => h && h.trim())
    if (!snippet) return null
    return { url: r.url, title: r.title ?? '', snippet }
  }).filter(Boolean)
  return { sources }
}

async function searchWithPool(pool: KeyPool, searchFn: any, query: string, maxResults: number, signal: AbortSignal): Promise<any> {
  const maxAttempts = pool.count()
  if (maxAttempts === 0) throw new Error('no API keys available')
  let lastErr
  const tried = new Set<string>()
  for (let i = 0; i < maxAttempts; i++) {
    const key = pool.next()
    if (!key || tried.has(key)) break
    tried.add(key)
    // Fresh controller per attempt so a prior timeout doesn't poison the next key.
    const attemptCtrl = new AbortController()
    // Kill the whole command if the outer signal fires (e.g. user interrupt).
    const disposeOuter = () => { attemptCtrl.abort(); signal.removeEventListener('abort', disposeOuter) }
    signal.addEventListener('abort', disposeOuter)
    // Hard per-attempt budget: DEFAULT_ATTEMPT_TIMEOUT_MS (10 s). Enough for a
    // slow TLS ramp, but bounded so a hung network never stalls the CLI.
    const attemptTimer = setTimeout(() => attemptCtrl.abort(), DEFAULT_ATTEMPT_TIMEOUT_MS)
    try {
      const result = await searchFn(key, query, maxResults, attemptCtrl.signal)
      clearTimeout(attemptTimer)
      pool.reportSuccess(key)
      return result
    } catch (err: any) {
      clearTimeout(attemptTimer)
      lastErr = err
      const status = err?.status
      if (status && classifyStatus(status)) { pool.reportFailure(key, true, status); break }
      pool.reportFailure(key, false)
    }
  }
  throw lastErr ?? new Error('all API keys exhausted')
}

function formatResult(provider: string, result: any): string {
  const lines: string[] = []
  if (result.content) lines.push(result.content, '')
  for (const s of result.sources) {
    lines.push(`  [${provider}] ${s.title ?? s.url}`, `  ${s.url}`)
    if (s.snippet) lines.push(`  ${s.snippet.substring(0, 300)}`, '')
  }
  return lines.join('\n').trim()
}

export default class SearchCommand extends Command {
  static description = 'Search the web with key pool failover'
  static flags = {
    exa:    Flags.boolean({ description: 'Force Exa provider', default: false }),
    tavily: Flags.boolean({ description: 'Force Tavily provider', default: false }),
    num:    Flags.integer({ description: 'Limit results', default: 10 }),
  }
  static args = { query: Args.string({ description: 'Search query', required: true }) }

  override async run() {
    const { flags, args } = await this.parse(SearchCommand)
    const maxResults = flags.num
    // Tool-level total budget: 3 × DEFAULT_ATTEMPT_TIMEOUT_MS (30 s) gives room
    // for ~3 key fallback attempts before the whole command exits, so a network
    // that never responds can't hang the CLI. We hold the controller so we can
    // call .abort() on the signal.
    const totalCtrl = new AbortController()
    setTimeout(() => totalCtrl.abort(), DEFAULT_ATTEMPT_TIMEOUT_MS * 3)
    const signal = totalCtrl.signal
    const provider = flags.exa ? 'exa' : 'tavily'
    const pool = new KeyPool(provider)
    if (pool.count() === 0) this.error('Error: no API keys available')
    try {
      const result = flags.exa
        ? await searchWithPool(pool, searchExa, args.query as string, maxResults, signal)
        : await searchWithPool(pool, searchTavily, args.query as string, maxResults, signal)
      this.log(formatResult(provider, result))
    } catch (err: any) {
      const status = err?.status, msg = err?.message ?? String(err)
      if (status) this.error(`Error [${status}]: ${msg}`)
      else this.error(`Error: ${msg}`)
    } finally { pool.close() }
  }
}
