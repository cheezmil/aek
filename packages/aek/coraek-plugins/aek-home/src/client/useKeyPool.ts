/**
 * Key-pool CRUD for the Web Search page.
 *
 * The encrypted pool lives on the host; this hook only ever sends a literal
 * on a create/update request and only ever receives masked tags back — except
 * for explicit, user-initiated operations (C4 / R3 / R4): `reveal(id)`,
 * `revealAll()` and the copy button fetch plaintext on purpose. No plaintext
 * is stored in React state by this hook, and error messages never echo the
 * submitted value.
 *
 * R6: deletion is a soft delete. The same snapshot also carries the recycle
 * bin and the host-owned retention window, so the UI never hardcodes 7 days.
 *
 * @module @cheezmil/aek-home/src/client/useKeyPool
 */
import { useCallback, useEffect, useState } from 'react'

/** The host route serving masked key rows. */
export const KEYS_API = '/api/aek/websearch/keys'

/** The host route for explicit plaintext reveals (C4, R3, R4). */
export const KEYS_REVEAL_API = `${KEYS_API}/reveal`

/** The host route for restore / permanent purge (R6). */
export const KEYS_RECYCLE_API = `${KEYS_API}/recycle`

/** Why a key is disabled (R1). */
export type DisableReason = 'manual' | 'balance' | 'invalid' | 'auto'

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
  /** Why it is disabled; absent while enabled. */
  disabledReason?: DisableReason
}

/** One masked row in the recycle bin. */
export interface RecycleEntry {
  /** Row id inside the recycle bin. */
  id: number
  /** Masked display tag. */
  masked: string
  /** The id it had before deletion. */
  originId: number
  /** Epoch ms of the soft delete. */
  deletedAt: number
  /** Epoch ms of the automatic purge. */
  purgeAt: number
  /** Reason carried over at deletion time. */
  disabledReason: DisableReason
}

/** A key-pool response. */
interface KeyPoolSnapshot {
  /** Provider kind. */
  kind: string
  /** Masked live rows. */
  entries: KeyPoolEntry[]
  /** Masked recycled rows. */
  recycle: RecycleEntry[]
  /** Host-owned retention window in days. */
  retentionDays: number
}

/** Live key-pool state and actions. */
export interface KeyPoolState {
  /** Rows, `undefined` while loading or when no provider is selected. */
  entries: KeyPoolEntry[] | undefined
  /** Soft-deleted rows. */
  recycle: RecycleEntry[]
  /** Retention window from the host preference. */
  retentionDays: number
  /** Last error message. */
  error: string | undefined
  /** Whether a write is in flight. */
  pending: boolean
  /** Re-read the pool. */
  refresh: () => void
  /** Append one key. */
  add: (key: string) => void
  /** Append several newline-separated keys in one request. */
  addMany: (keys: string[]) => void
  /** Replace one key's literal. */
  update: (id: number, key: string) => void
  /** Soft-delete one key into the recycle bin. */
  remove: (id: number) => void
  /** Enable or disable one key (records the manual reason). */
  setDisabled: (id: number, disabled: boolean) => void
  /** Restore one recycled key. */
  restore: (recycleId: number) => void
  /** Permanently delete one recycled key. */
  purge: (recycleId: number) => void
  /**
   * Explicitly reveal ONE row's plaintext literal (C4). Only called when the
   * user clicks "show" or "copy" on that exact row; the result is a one-shot
   * value, never cached by this hook.
   * @param id - real row id.
   * @returns the literal, or `undefined` when the host has no such row.
   */
  reveal: (id: number) => Promise<string | undefined>
  /**
   * R3: explicit "reveal all" from the eye-all button. Same security boundary.
   * @returns id + literal for every live row.
   */
  revealAll: () => Promise<Array<{ id: number; plain: string }>>
}

/** @param cause - unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Own the masked rows for one provider and expose the write actions.
 * @param kind - provider to manage, `undefined` until one is chosen.
 * @returns the live state.
 */
export function useKeyPool(kind: string | undefined): KeyPoolState {
  const [entries, setEntries] = useState<KeyPoolEntry[] | undefined>(undefined)
  const [recycle, setRecycle] = useState<RecycleEntry[]>([])
  const [retentionDays, setRetentionDays] = useState(7)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (kind === undefined) {
      setEntries(undefined)
      setRecycle([])
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
      .then((value) => {
        if (cancelled) return
        setEntries(value.entries)
        setRecycle(value.recycle)
        setRetentionDays(value.retentionDays)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setEntries([])
        setError(messageOf(cause))
      })
    return () => { cancelled = true }
  }, [kind, revision])

  const refresh = useCallback(() => setRevision(value => value + 1), [])

  /** Send one write; the response is always the fresh masked snapshot. */
  const write = useCallback((method: string, body: Record<string, unknown>, api: string = KEYS_API) => {
    if (kind === undefined) return
    setPending(true)
    setError(undefined)
    void fetch(api, {
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
      .then((value) => {
        setEntries(value.entries)
        setRecycle(value.recycle)
        setRetentionDays(value.retentionDays)
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setPending(false))
  }, [kind])

  const add = useCallback((key: string) => { write('POST', { key }) }, [write])
  const addMany = useCallback((keys: string[]) => { write('POST', { keys }) }, [write])
  const update = useCallback((id: number, key: string) => { write('PUT', { id, key }) }, [write])
  const remove = useCallback((id: number) => { write('DELETE', { id }) }, [write])
  const setDisabled = useCallback((id: number, disabled: boolean) => {
    write('PATCH', { id, disabled })
  }, [write])
  const restore = useCallback((recycleId: number) => {
    write('POST', { recycleId }, KEYS_RECYCLE_API)
  }, [write])
  const purge = useCallback((recycleId: number) => {
    write('DELETE', { recycleId }, KEYS_RECYCLE_API)
  }, [write])

  /** Explicit single-row reveal (C4); the only call that can return a literal. */
  const reveal = useCallback(async (id: number): Promise<string | undefined> => {
    if (kind === undefined) return undefined
    const response = await fetch(KEYS_REVEAL_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => undefined) as { message?: string } | undefined
      throw new Error(detail?.message ?? `HTTP ${String(response.status)}`)
    }
    const json = await response.json() as { plain?: string }
    return json.plain
  }, [kind])

  /** R3: explicit reveal-all; never invoked without a user click. */
  const revealAll = useCallback(async (): Promise<Array<{ id: number; plain: string }>> => {
    if (kind === undefined) return []
    const response = await fetch(KEYS_REVEAL_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, all: true }),
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => undefined) as { message?: string } | undefined
      throw new Error(detail?.message ?? `HTTP ${String(response.status)}`)
    }
    const json = await response.json() as { items?: Array<{ id: number; plain: string }> }
    return json.items ?? []
  }, [kind])

  return {
    entries, recycle, retentionDays, error, pending, refresh,
    add, addMany, update, remove, setDisabled, restore, purge, reveal, revealAll,
  }
}
