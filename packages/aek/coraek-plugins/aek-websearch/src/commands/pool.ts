import { Command, Args } from '@oclif/core'
import { KeyStore } from '@cheezmil/prevent-agent-directly-seeing-key'
import { join } from 'node:path'
import { aekHomePath } from '@cheezmil/coraek/home'

const AEK_DIR = aekHomePath('websearch')
interface PoolEntry { id: number; key: string; disabled: boolean; failures: number; cooldownEnd: number }

// R1: keep the disable reason in the same SQLCipher database the console reads.
// Inline (no shared chunk) and best-effort, just like the search command.
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
  reportFailure(key: string, permanent: boolean) {
    for (const e of this.entries) {
      if (e.key !== key) continue
      if (permanent) {
        e.disabled = true
        this.store.disableById(e.id)
        recordDisableReason(this.store, e.id, 'invalid')
        return
      }
      e.failures++; e.cooldownEnd = Date.now() + Math.min(60_000 * Math.pow(5, e.failures - 1), 3_600_000)
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
  resetCooldown() { for (const e of this.entries) { e.failures = 0; e.cooldownEnd = 0 } this.store.resetCooldowns() }
  close() { this.store.close() }
}

function poolShow(provider: string) {
  const pool = new KeyPool(provider)
  console.log(`Pool: ${provider}`)
  console.log(`Database: ${join(AEK_DIR, `${provider}.db`)}`)
  console.log('')
  console.log('Index  Key              Disabled  Failures  Cooldown')
  console.log('-----  ---------------  --------  --------  ----------')
  for (const s of pool.status()) {
    console.log(`  ${String(s.index).padEnd(5)}  ${(s.masked||'?').padEnd(15)}  ${s.disabled?'yes':'no'.padEnd(8)}  ${String(s.failures).padEnd(8)}  ${s.cooldownRemaining??'—'}`)
  }
  pool.close()
}
function poolDisable(provider: string, idx: number) {
  const pool = new KeyPool(provider); pool.disableKeyByIdx(idx); pool.close()
  console.log(`Disabled key #${idx} in ${provider}`)
}
function poolEnable(provider: string, idx: number) {
  const pool = new KeyPool(provider); pool.enableKeyByIdx(idx); pool.close()
  console.log(`Enabled key #${idx} in ${provider}`)
}
function poolReset(provider: string) {
  const pool = new KeyPool(provider); pool.resetCooldown(); pool.close()
  console.log(`Reset cooldown for all ${provider} keys`)
}

export default class PoolCommand extends Command {
  static description = 'Manage API key pool (show, enable, disable, reset)'
  static args = {
    action:  Args.string({ description: 'show | disable | enable | reset', required: true }),
    provider: Args.string({ description: 'Provider: tavily or exa', required: false }),
    index:   Args.string({ description: 'Key index (for disable/enable)', required: false }),
  }

  override async run() {
    const { args } = await this.parse(PoolCommand)
    const action = args.action
    const provider = args.provider || 'tavily'
    const idxStr = args.index
    const idx = idxStr !== undefined ? parseInt(idxStr, 10) : undefined
    if (!['tavily', 'exa'].includes(provider)) this.error('Provider must be "tavily" or "exa"')
    switch (action) {
      case 'show':   poolShow(provider); break
      case 'disable': if (idx === undefined) this.error('usage: aekws pool disable <kind> <idx>'); poolDisable(provider, idx); break
      case 'enable':  if (idx === undefined) this.error('usage: aekws pool enable <kind> <idx>'); poolEnable(provider, idx); break
      case 'reset':   poolReset(provider); break
      default:        this.error(`unknown pool command: ${action}`)
    }
  }
}
