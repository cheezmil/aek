/**
 * Key-pool CRUD for the Web Search page.
 *
 * The encrypted pool lives on the host; this hook only ever sends a literal
 * on a create/update request and only ever receives masked tags back. No
 * plaintext is stored in React state after submit, and error messages never
 * echo the submitted value.
 *
 * @module @cheezmil/aek-home/src/client/useKeyPool
 */
import { useCallback, useEffect, useState } from 'react'

/** The host route serving masked key rows. */
export const KEYS_API = '/api/aek/websearch/keys'

/** One masked key row. */
export interface KeyPoolEntry {
  /** Real row id in the encrypted pool. */
  id: number
  /** Masked display tag. */
  masked: string
  /** Whether the key is disabled. */
  disabled: boolean
  /** Recorded failure count. */
  failures: number
}

/** A key-pool response. */
interface KeyPoolSnapshot {
  /** Provider kind. */
  kind: string
  /** Masked rows. */
  entries: KeyPoolEntry[]
}

/** Live key-pool state and actions. */
export interface KeyPoolState {
  /** Rows, `undefined` while loading or when no provider is selected. */
  entries: KeyPoolEntry[] | undefined
  /** Last error message. */
  error: string | undefined
  /** Whether a write is in flight. */
  pending: boolean
  /** Re-read the pool. */
  refresh: () => void
  /** Append one key. */
  add: (key: string) => void
  /** Replace one key's literal. */
  update: (id: number, key: string) => void
  /** Delete one key. */
  remove: (id: number) => void
  /** Enable or disable one key. */
  setDisabled: (id: number, disabled: boolean) => void
}

/** @param cause - unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Own the masked rows for one provider and expose the four write actions.
 * @param kind - provider to manage, `undefined` until one is chosen.
 * @returns the live state.
 */
export function useKeyPool(kind: string | undefined): KeyPoolState {
  const [entries, setEntries] = useState<KeyPoolEntry[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (kind === undefined) {
      setEntries(undefined)
      return
    }
    let cancelled = false
    setEntries(undefined)
    setError(undefined)
    const query = new URLSearchParams({ kind })
    void fetch(`${KEYS_API}?${query.toString()}`, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return await response.json() as KeyPoolSnapshot
      })
      .then((value) => { if (!cancelled) setEntries(value.entries) })
      .catch((cause: unknown) => { if (!cancelled) { setEntries([]); setError(messageOf(cause)) } })
    return () => { cancelled = true }
  }, [kind, revision])

  const refresh = useCallback(() => setRevision(value => value + 1), [])

  /** Send one write; the response is always the fresh masked snapshot. */
  const write = useCallback((method: string, body: Record<string, unknown>) => {
    if (kind === undefined) return
    setPending(true)
    setError(undefined)
    void fetch(KEYS_API, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, ...body }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const detail = await response.json().catch(() => undefined) as { message?: string } | undefined
          throw new Error(detail?.message ?? `HTTP ${String(response.status)}`)
        }
        return await response.json() as KeyPoolSnapshot
      })
      .then(value => setEntries(value.entries))
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setPending(false))
  }, [kind])

  const add = useCallback((key: string) => { write('POST', { key }) }, [write])
  const update = useCallback((id: number, key: string) => { write('PUT', { id, key }) }, [write])
  const remove = useCallback((id: number) => { write('DELETE', { id }) }, [write])
  const setDisabled = useCallback((id: number, disabled: boolean) => {
    write('PATCH', { id, disabled })
  }, [write])

  return { entries, error, pending, refresh, add, update, remove, setDisabled }
}
