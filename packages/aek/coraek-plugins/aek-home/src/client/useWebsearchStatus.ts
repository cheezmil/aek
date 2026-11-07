/**
 * The single source of truth for the web-search admin facts.
 *
 * The host file is authoritative, so neither the overview nor the provider
 * table keeps a local copy of the configuration: every read hits
 * `GET /api/aek/websearch` (served by `@cheezmil/aek-websearch/admin`) and
 * every toggle goes through the matching `POST`.
 *
 * @module @cheezmil/aek-home/src/client/useWebsearchStatus
 */
import { useCallback, useEffect, useState } from 'react'

/** The host route both panels talk to. */
export const WEBSEARCH_API = '/api/aek/websearch'

/** One provider's management facts, as the host reports them. */
export interface ProviderStatus {
  /** The provider kind (adapter name). */
  kind: string
  /** Whether the provider is enabled in the host configuration. */
  enabled: boolean
  /** How many keys the encrypted pool holds; `undefined` when unreadable. */
  keyCount?: number | undefined
  /** Whether the provider has a key pool file at all. */
  hasPool: boolean
}

/** The status snapshot the host reports. */
export interface WebsearchStatus {
  /** The AEK home directory the state lives in. */
  aekHome: string
  /** The providers configuration file. */
  providersFile: string
  /** One entry per known provider. */
  providers: ProviderStatus[]
}

/** The live admin state exposed to panels. */
export interface WebsearchState {
  /** Last successful snapshot; `undefined` until the first read completes. */
  status: WebsearchStatus | undefined
  /** Last error message, cleared on the next successful action. */
  error: string | undefined
  /** Provider kind currently being written, or `undefined`. */
  pending: string | undefined
  /** Force a fresh read from the host. */
  refresh: () => void
  /** Write one provider's enabled flag. */
  toggle: (kind: string, enabled: boolean) => void
}

/**
 * Fetch the current status from the host.
 * @returns the status snapshot.
 * @throws when the host does not answer with a usable payload.
 */
export async function fetchStatus(): Promise<WebsearchStatus> {
  const response = await fetch(WEBSEARCH_API, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await response.json() as WebsearchStatus
}

/**
 * Toggle one provider's enabled flag on the host.
 * @param kind - the provider kind to toggle.
 * @param enabled - the flag to write.
 * @returns the status snapshot the host answered with.
 * @throws when the host rejects the write.
 */
export async function writeEnabled(kind: string, enabled: boolean): Promise<WebsearchStatus> {
  const response = await fetch(WEBSEARCH_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, enabled }),
  })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await response.json() as WebsearchStatus
}

/** @param cause - an unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Read the admin state once on mount and expose refresh / toggle actions.
 * @returns the shared live state.
 */
export function useWebsearchStatus(): WebsearchState {
  const [status, setStatus] = useState<WebsearchStatus | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState<string | undefined>(undefined)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetchStatus()
      .then((snapshot) => { if (!cancelled) { setStatus(snapshot); setError(undefined) } })
      .catch((cause: unknown) => { if (!cancelled) setError(messageOf(cause)) })
    return () => { cancelled = true }
  }, [revision])

  const refresh = useCallback(() => setRevision(value => value + 1), [])

  const toggle = useCallback((kind: string, enabled: boolean) => {
    setPending(kind)
    setError(undefined)
    void writeEnabled(kind, enabled)
      .then(snapshot => setStatus(snapshot))
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setPending(undefined))
  }, [])

  return { status, error, pending, refresh, toggle }
}
