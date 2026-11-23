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
  /** Version from its package.json (AA round); absent on older hosts. */
  version?: string
  /** Declared audience A1 / A2 (AA round); absent or '' when undeclared. */
  distribution?: 'A1' | 'A2' | ''
  /** Detected implementation languages, most source files first (AA round). */
  languages?: string[]
  /** Main implementation language (AA round). */
  primaryLanguage?: string
  /** How the running host was installed (BQ11 round); absent on older hosts. */
  origin?: PluginOrigin
  /**
   * Runtime memory fact (CC round, basis/attribution fixed DD round;
   * absent on older hosts, where the entry row renders no memory chip at
   * all). Never an invented number: the `shell` reading is the measured
   * physical footprint of the whole app process tree (`footprintMb` set
   * only when `running`); the other kinds ship the honest reason instead
   * of a fake zero — `in-host` = the webui runs under the shared host
   * runtime0, `transient` = the CLI runs and exits.
   */
  memory?:
    | { kind: 'shell'; state: 'running' | 'stopped' | 'unavailable'; footprintMb?: number }
    | { kind: 'in-host' }
    | { kind: 'transient' }
}

/** The source buckets of the user's disk layout (T round). */
export type PluginBucket = 'plugins' | 'public' | 'base' | 'extensions' | 'community'

/**
 * How the running host was installed (BQ11 round): `dev` = the main git
 * worktree (local dev tree), `built` = the release-pinned stable tree
 * (local build), `global` = a pnpm global install. Absent on older hosts.
 */
export type PluginOrigin = 'dev' | 'built' | 'global'

/** One scanned AEK package. */
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
  /**
   * Whether the enable switch is offered at all (T round): only
   * cordis-loadable packages are switchable; host-identity / library /
   * bundle rows are read-only roster facts. Absent on older hosts, where
   * every listed row is switchable.
   */
  switchable?: boolean
  /**
   * The bucket this package lives in (the user's disk classification,
   * T round). Absent on older hosts.
   */
  bucket?: PluginBucket
  /** Declared audience: A1 (public) / A2 (local only), empty when invalid. */
  distribution: 'A1' | 'A2' | ''
  /** Detected implementation languages, most source files first. */
  languages: string[]
  /** Main implementation language. */
  primaryLanguage: string
  /** How the running host was installed (BQ11 round); absent on older hosts. */
  origin?: PluginOrigin
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
  /** The host user's home directory, for the path display-style setting. */
  home: string
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
 * @param pollMs - optional polling interval in milliseconds (EE round):
 *   when > 0 the hook re-reads the host facts on a timer so the runtime
 *   memory readings keep moving on their own. The host read is a non-blocking
 *   async top sample (DD+ round), so a poll costs no event-loop stall.
 * @returns the live state.
 */
export function useConsoleFacts(pollMs = 0): ConsoleFactsState {
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

  // EE round: optional background polling — bump the revision on a timer so
  // the same fetch path re-reads the host. The timer resets when the
  // interval changes (the user's 内存检测间隔 input), and an in-flight poll
  // can never overlap the mount-time one because both ride on `revision`.
  useEffect(() => {
    if (pollMs <= 0) return
    const timer = window.setInterval(() => {
      setRevision(value => value + 1)
    }, pollMs)
    return () => {
      window.clearInterval(timer)
    }
  }, [pollMs])

  const refresh = useCallback(() =>{  setRevision(value => value + 1) }, [])
  return { facts, error, loading, refresh }
}
