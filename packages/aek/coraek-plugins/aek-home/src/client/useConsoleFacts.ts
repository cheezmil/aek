/**
 * Read-only host facts for the management surfaces.
 *
 * The host scans the real `apps/` and `packages/aek/coraek-plugins/`
 * directories and resolves URLs, ports, platform and the copyable skill path.
 * Nothing about the machine is hardcoded in the client bundle.
 *
 * @module @cheezmil/aek-home/src/client/useConsoleFacts
 */
import { useCallback, useEffect, useState } from 'react'

/** The host route that serves console facts. */
export const CONSOLE_FACTS_API = '/api/aek/console/facts'

/** One app entry point. */
export interface AppEntry {
  id: string
  packageName: string
  description: string
  entry: true
}

/** One scanned plugin. */
export interface PluginEntry {
  id: string
  packageName: string
  version: string
  description: string
  capabilities: { backend: boolean; cli: boolean; mcp: boolean }
  /** Persisted enable flag from `<AEK_HOME>/plugins.json`. */
  enabled: boolean
  /** TRUE when the plugin cannot be switched off (console root / this API). */
  locked: boolean
  /** Why it is locked; empty for normal plugins. */
  lockReason: '' | 'root' | 'api'
  /** Declared audience: A1 (public) / A2 (local only), empty when invalid. */
  distribution: 'A1' | 'A2' | ''
  /** Detected implementation languages, most source files first. */
  languages: string[]
  /** Main implementation language. */
  primaryLanguage: string
}

/** One slot's endpoints. */
export interface SlotEndpoint {
  slot: string
  productName: string
  url: string
  webPort: number
  cdpPort: number
  bundleId: string
}

/** The read-only fact snapshot. */
export interface ConsoleFacts {
  platform: string
  arch: string
  entries: AppEntry[]
  plugins: PluginEntry[]
  /** Absolute plugin directory path resolved on the host (copyable). */
  pluginsDir: string
  endpoints: SlotEndpoint[]
  skillPath: string
  permissions: {
    kind: string
    deepLink: string
    bundles: readonly { id: string; name: string }[]
    noteKey: string
  }
}

/** The live state the panels consume. */
export interface ConsoleFactsState {
  /** `undefined` until the first host response. */
  facts: ConsoleFacts | undefined
  /** Human-readable failure message. */
  error: string | undefined
  /** True while a request is in flight (drives the spinner / progress bar). */
  loading: boolean
  /** Force a fresh host read. */
  refresh: () => void
}

/** @param cause - unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Fetch console facts once on mount and expose a manual refresh.
 * @returns the live state.
 */
export function useConsoleFacts(): ConsoleFactsState {
  const [facts, setFacts] = useState<ConsoleFacts | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetch(CONSOLE_FACTS_API, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return await response.json() as ConsoleFacts
      })
      .then((data) => {
        if (cancelled) return
        setFacts(data)
        setError(undefined)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(messageOf(cause))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [revision])

  const refresh = useCallback(() => setRevision(value => value + 1), [])
  return { facts, error, loading, refresh }
}
