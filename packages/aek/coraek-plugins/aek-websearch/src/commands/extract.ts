import { Command, Flags, Args } from '@oclif/core'
import { KeyStore } from '@cheezmil/prevent-agent-directly-seeing-key'

interface PoolEntry { id: number; key: string; disabled: boolean; failures: number; cooldownEnd: number }

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
    for (const e of this.entries) { if (e.key === key) { e.failures = 0; e.cooldownEnd = 0; this.store.enableById(e.id); return } }
  }
  close() { this.store.close() }
}

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

export default class ExtractCommand extends Command {
  static description = 'Extract page content from URL (Tavily only)'
  static flags = {
    depth:  Flags.string({ description: 'Extraction depth: basic or advanced', default: 'basic' }),
    query:  Flags.string({ description: 'Query to extract relevant chunks' }),
    chunks: Flags.integer({ description: 'Max chunks per source (1-5)', default: 3 }),
  }
  static args = { url: Args.string({ description: 'URL to extract', required: true }) }

  override async run() {
    const { flags, args } = await this.parse(ExtractCommand)
    const url = args.url as string
    const pool = new KeyPool('tavily')
    const key = pool.next()
    if (!key) this.error('Error: no API keys available')
    try {
      const result = await postJSON('https://api.tavily.com/extract', {
        urls: [url], extract_depth: flags.depth,
        ...(flags.query ? { query: flags.query, chunks_per_source: flags.chunks } : {}),
      }, { authorization: `Bearer ${key}` })
      const results = result.results ?? []
      for (const r of results) {
        console.log(`# ${r.url ?? '(no url)'}`)
        console.log(r.raw_content ?? r.extract ?? '(no content)')
        console.log('')
      }
      if (result.failed_urls?.length) {
        console.error('[failed]')
        for (const u of result.failed_urls) console.error(`  ${u}`)
      }
    } catch (err: any) {
      const status = err?.status, msg = err?.message ?? String(err)
      if (status) this.error(`Error [${status}]: ${msg}`)
      else this.error(`Error: ${msg}`)
    } finally { pool.close() }
  }
}
