/**
 * Instance liveness + control for 运行实例管理.
 *
 * Two channels, on purpose:
 * - `GET /api/aek/console/health` returns four booleans plus a signature. It is
 *   cheap (host caches the arbiter probe for 2s) and is what the UI polls.
 * - `GET /api/aek/runtime` returns the full snapshot (ports, homes, mode). It is
 *   re-read ONLY when the signature changes, so an idle console costs one tiny
 *   request every few seconds instead of rebuilding the whole payload.
 *
 * Polling also stops while the tab/window is hidden (`document.visibilityState`)
 * and refreshes once on return, which is the low-resource behaviour the user
 * asked for.
 *
 * @module @cheezmil/aek-home/src/client/useInstances
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeStatus } from './useRuntimeMode.ts'
import { fetchRuntime } from './useRuntimeMode.ts'

/** Health fingerprint route. */
export const HEALTH_API = '/api/aek/console/health'

/** Granular instance control route. */
export const INSTANCES_API = '/api/aek/instances'

/** Poll interval while visible. */
const POLL_MS = 6000

/** One half's liveness. */
export interface HalfState {
  /** Backend service answers. */
  web: boolean
  /** Desktop window process is alive. */
  shell: boolean
}

/** Health payload. */
export interface HealthPayload {
  /** Host accepted the probe. */
  ok: boolean
  /** Four-digit fingerprint: aek.web, aek.shell, next.web, next.shell. */
  signature: string
  /** Per-slot halves. */
  slots: Record<'aek' | 'next', HalfState>
  /** Host timestamp. */
  at: number
}

/** Which half a control targets. */
export type Half = 'web' | 'shell'

/** What a control does to a half. */
export type HalfAction = 'start' | 'stop' | 'restart'

/** What the panel consumes. */
export interface InstanceState {
  /** Last full snapshot. */
  status: RuntimeStatus | undefined
  /** Last health fingerprint. */
  health: HealthPayload | undefined
  /** Last error, cleared by the next successful pull. */
  error: string | undefined
  /** In-flight control, keyed `slot:half:action`. */
  busy: string | undefined
  /** Force a full re-read. */
  refresh: () => void
  /** Run one half action. */
  act: (slot: 'aek' | 'next', half: Half, action: HalfAction) => void
}

/** @param cause - unknown thrown value. @returns displayable text. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Read the health fingerprint.
 * @returns the payload.
 * @throws when the host does not answer.
 */
export async function fetchHealth(): Promise<HealthPayload> {
  const response = await fetch(HEALTH_API, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await response.json() as HealthPayload
}

/**
 * Ask the host to start / stop / restart one half of one slot.
 * @param slot - target slot.
 * @param half - backend service or desktop window.
 * @param action - what to do.
 * @returns the host acknowledgement.
 * @throws when the host rejects the request.
 */
export async function postInstance(
  slot: 'aek' | 'next',
  half: Half,
  action: HalfAction,
): Promise<Record<string, unknown>> {
  const response = await fetch(INSTANCES_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slot, half, action }),
  })
  if (!response.ok) {
    let message = `HTTP ${String(response.status)}`
    try {
      const json = await response.json() as { message?: string }
      if (json.message !== undefined && json.message.length > 0) message = json.message
    } catch { /* keep the status text */ }
    throw new Error(message)
  }
  return await response.json() as Record<string, unknown>
}

/**
 * Observe both slots and expose granular controls.
 * @returns live state and actions.
 */
export function useInstances(): InstanceState {
  const [status, setStatus] = useState<RuntimeStatus | undefined>(undefined)
  const [health, setHealth] = useState<HealthPayload | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [revision, setRevision] = useState(0)
  const signature = useRef<string>('')

  useEffect(() => {
    let cancelled = false
    const pull = async (force: boolean): Promise<void> => {
      try {
        const next = await fetchHealth()
        if (cancelled) return
        setHealth(next)
        setError(undefined)
        if (force || next.signature !== signature.current) {
          signature.current = next.signature
          const full = await fetchRuntime()
          if (!cancelled) setStatus(full)
        }
      } catch (cause) {
        if (!cancelled) setError(messageOf(cause))
      }
    }
    void pull(true)
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void pull(false)
    }, POLL_MS)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void pull(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [revision])

  const refresh = useCallback(() => setRevision(value => value + 1), [])

  const act = useCallback((slot: 'aek' | 'next', half: Half, action: HalfAction) => {
    const key = `${slot}:${half}:${action}`
    setBusy(key)
    setError(undefined)
    void postInstance(slot, half, action)
      .then(() => {
        setBusy(undefined)
        setRevision(value => value + 1)
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause))
        setBusy(undefined)
      })
  }, [])

  return { status, health, error, busy, refresh, act }
}
