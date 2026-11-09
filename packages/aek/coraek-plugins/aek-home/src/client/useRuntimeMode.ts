/**
 * The single source of truth for the dual-app runtime mode.
 *
 * Reads from `GET /api/aek/runtime` (served by `@cheezmil/aek-websearch/admin`)
 * and writes through `POST /api/aek/runtime` when the user picks a mode. The
 * host arbiter does the real start/stop; this hook only validates and reflects.
 *
 * @module @cheezmil/aek-home/src/client/useRuntimeMode
 */
import { useCallback, useEffect, useState } from 'react'

/** The host route the switcher talks to. */
export const RUNTIME_API = '/api/aek/runtime'

/** One slot's liveness snapshot. */
export interface SlotStatus {
  /** The slot's web port. */
  webPort: number
  /** Whether the slot's web server answers. */
  web: boolean
  /** Whether the slot's Electron window is alive (C6). */
  shell: boolean
  /**
   * Which build that window belongs to — a dev shell started from the repo or
   * the packaged app in `~/Applications`. `null` when no window is running.
   */
  shellKind?: 'dev' | 'prod' | null
  /** Either half alive: what the user actually sees in the Dock. */
  running: boolean
}

/** The runtime status the host reports. */
export interface RuntimeStatus {
  /** The slot serving this request. */
  current: { slot: 'aek' | 'next'; home: string }
  /** Per-slot liveness, keyed by slot name. */
  slots: { aek: SlotStatus; next: SlotStatus }
  /** Derived mode: which slots are currently running. */
  mode: 'none' | 'only-aek' | 'only-next' | 'both'
}

/** Selectable target modes. */
export type RuntimeMode = 'only-aek' | 'only-next' | 'both'

/** The live runtime state exposed to the switcher card. */
export interface RuntimeState {
  /** Last successful snapshot; `undefined` until the first read completes. */
  status: RuntimeStatus | undefined
  /** Last error message, cleared on the next successful action. */
  error: string | undefined
  /** Mode currently being applied, or `undefined`. */
  pending: RuntimeMode | undefined
  /** Force a fresh read from the host. */
  refresh: () => void
  /** Request a target mode from the host. */
  setMode: (mode: RuntimeMode) => void
}

/**
 * Fetch the current runtime status from the host.
 * @returns the status snapshot.
 * @throws when the host does not answer with a usable payload.
 */
export async function fetchRuntime(): Promise<RuntimeStatus> {
  const response = await fetch(RUNTIME_API, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await response.json() as RuntimeStatus
}

/**
 * Request a target mode from the host.
 * @param mode - the desired mode.
 * @returns the host's acknowledgement (may carry `willStopSelf`).
 * @throws when the host rejects the request.
 */
export async function writeMode(mode: RuntimeMode): Promise<Record<string, unknown>> {
  const response = await fetch(RUNTIME_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!response.ok) {
    let message = `HTTP ${String(response.status)}`
    try { const json = await response.json() as { message?: string }; if (json?.message) message = json.message } catch { /* keep */ }
    throw new Error(message)
  }
  return await response.json() as Record<string, unknown>
}

/** @param cause - an unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Read just the current slot once on mount (C9: the sidebar badge).
 * Cheaper than the full switcher state and safe to call from anywhere the
 * badge needs it; `undefined` until the host answers.
 * @returns the serving slot, or `undefined`.
 */
export function useCurrentSlot(): 'aek' | 'next' | undefined {
  const [slot, setSlot] = useState<'aek' | 'next' | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    void fetchRuntime()
      .then((snapshot) => { if (!cancelled) setSlot(snapshot.current.slot) })
      .catch(() => { /* host unreachable: no badge, that is all */ })
    return () => { cancelled = true }
  }, [])
  return slot
}

/**
 * Read the runtime status once on mount and expose refresh / setMode actions.
 * @returns the shared live state.
 */
export function useRuntimeMode(): RuntimeState {
  const [status, setStatus] = useState<RuntimeStatus | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState<RuntimeMode | undefined>(undefined)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetchRuntime()
      .then((snapshot) => { if (!cancelled) { setStatus(snapshot); setError(undefined) } })
      .catch((cause: unknown) => { if (!cancelled) setError(messageOf(cause)) })
    return () => { cancelled = true }
  }, [revision])

  const refresh = useCallback(() => setRevision(value => value + 1), [])

  const setMode = useCallback((mode: RuntimeMode) => {
    setPending(mode)
    setError(undefined)
    void writeMode(mode)
      .then(() => { setPending(undefined); setRevision(value => value + 1) })
      .catch((cause: unknown) => { setError(messageOf(cause)); setPending(undefined) })
  }, [])

  return { status, error, pending, refresh, setMode }
}
