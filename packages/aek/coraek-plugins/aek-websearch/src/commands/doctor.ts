import { Command } from '@oclif/core'
import { KeyStore } from '@cheezmil/prevent-agent-directly-seeing-key'
import { join } from 'node:path'

const AEK_DIR = join(process.env.HOME ?? '', '.aek', 'websearch')
interface PoolEntry { id: number; key: string; disabled: boolean; failures: number; cooldownEnd: number }

class KeyPool {
  readonly provider: string
  private store: KeyStore
  private entries: PoolEntry[] = []
  constructor(provider: string) {
    this.provider = provider
    this.store = new KeyStore(provider)
    const rows = this.store.load()
    const now = Date.now()
    this.entries = rows.map((r: any) => ({
      id: r.id, key: r.key, disabled: r.disabled,
      failures: r.failures,
      cooldownEnd: r.cooldownEnd > now ? r.cooldownEnd : 0,
    }))
  }
  count() { return this.entries.length }
  status() {
    const now = Date.now()
    return this.entries.map((e, i) => ({
      index: i, masked: e.key.length <= 8 ? '****' : e.key.slice(0,4)+'....'+e.key.slice(-4),
      disabled: e.disabled, failures: e.failures,
      cooldownRemaining: e.cooldownEnd > now ? `${Math.ceil((e.cooldownEnd-now)/1000)}s` : undefined,
    }))
  }
  close() { this.store.close() }
}

export default class DoctorCommand extends Command {
  static description = 'Check API key status and provider health'

  override async run() {
    const providers: string[] = ['tavily', 'exa']
    console.log('AEK Web Search — Doctor')
    console.log('=======================')
    for (const provider of providers) {
      const pool = new KeyPool(provider)
      const count = pool.count()
      console.log(`${provider}: ${count} keys (use: ${join(AEK_DIR, `${provider}.db`)})`)
      console.log('')
      const statuses = pool.status()
      let enabled = 0, disabled = 0, cooling = 0
      for (const s of statuses) {
        if (s.disabled) disabled++
        else if (s.cooldownRemaining) cooling++
        else enabled++
      }
      console.log(`  enabled: ${enabled}, disabled: ${disabled}, cooling: ${cooling}`)
      console.log('')
      pool.close()
      console.log('')
    }
  }
}
