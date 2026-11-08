/**
 * Config reader for `~/.aek/websearch/`.
 *
 * Reads:
 * - `providers.yml` — provider list (enabled/disabled)
 * - `{kind}.db` — API keys via encrypted KeyStore
 *
 * @module aek-websearch/config-reader
 */

import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { aekHomePath } from '@cheezmil/coraek/home'
import { KeyStore } from '@cheezmil/encrypted-key-store'
import { PROVIDER_KINDS } from './defaults.ts'
import type { QueueEntry } from './types.ts'

/** providers.yml shape. */
interface ProvidersConfig {
  providers?: Record<string, { enabled?: boolean; [key: string]: unknown }>
}

/**
 * Read `~/.aek/websearch/providers.yml`.
 * Returns default config when file is absent or malformed.
 */
export function readProviders(): QueueEntry[] {
  const filePath = aekHomePath('websearch', 'providers.yml')

  try {
    const content = readFileSync(filePath, 'utf-8')
    const data = parse(content) as ProvidersConfig
    const entries: QueueEntry[] = []
    if (data?.providers) {
      for (const [kind, cfg] of Object.entries(data.providers)) {
        if (!PROVIDER_KINDS.includes(kind as typeof PROVIDER_KINDS[number])) continue
        entries.push({ kind: kind as QueueEntry['kind'], enabled: cfg.enabled !== false })
      }
    }
    return entries
  } catch {
    return []
  }
}

/**
 * Read keys from the encrypted KeyStore for the given provider kind.
 * Returns comma-joined keys, or undefined if none found.
 */
export function readKeys(kind: string): string | undefined {
  const store = new KeyStore(kind)
  const entries = store.load()
  store.close()
  if (entries.length === 0) return undefined
  return entries.map(e => e.key).join(',')
}
