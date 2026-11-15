/**
 * Instance liveness + control for 运行实例管理.
 *
 * Two channels, on purpose:
 * - `GET /api/aek/console/health` returns two booleans + a build kind per slot,
 *   plus a signature. It is
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
  /** Which build the window belongs to (`null` while stopped). */
  shellKind?: 'dev' | 'prod' | null
}

/**
 * An in-flight half action with its operator-visible pipeline (X2 item 7):
 * the "how far is that" state — which step the control is on, when it
 * started, and what outcome the UI is waiting for. Resolved by the health
 * poll: when the expected liveness arrives the op closes as `done`, when
 * the deadline passes it closes as `stalled` (the host may be mid-restart;
 * the operator can dismiss or re-poll).
 */
export interface InFlightInstance {
  /** The same key as `busy` (`slot:half:action`). */
  key: string
  /** `start` / `stop` / `restart`. */
  action: HalfAction
  /** Which half. */
  half: Half
  /** Which slot. */
  slot: 'aek' | 'next'
  /** Epoch ms the request was sent. */
  startedAt: number
  /** 'requested' → 'applied' → closed. */
  phase: 'requested' | 'applied'
  /** Final outcome, once closed (`undefined` while in flight). */
  outcome?: 'done' | 'stalled' | 'failed'
}

/** Health payload. */
export interface HealthPayload {
  /** Host accepted the probe. */
  ok: boolean
  /** Fingerprint: per slot web / shell / kind (`1`,`0`,`d|p|-`). */
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
  /** The X2 in-flight pipeline: every half action with its stage, live. */
  inFlight: InFlightInstance[]
  /** Close one in-flight op manually (the operator gave up waiting). */
  dismiss: (key: string) => void
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
  const [inFlight, setInFlight] = useState<InFlightInstance[]>([])
  const [revision, setRevision] = useState(0)
  const signature = useRef<string>('')

  /**
   * X2 item 7: the "how far is that" close-out — when the expected liveness
   * shows up in a health read, the in-flight op is done; when it never
   * arrives within the deadline, it is `stalled` (the backend is mid-restart),
   * not a silent spinner.
   */
  const resolveInFlight = (payload: HealthPayload): void => {
    setInFlight((current) => {
      const next: InFlightInstance[] = []
      for (const op of current) {
        if (op.outcome !== undefined) { next.push(op); continue }
        // The liveness flip of the target half is the "done" signal; the
        // `hasOwn` guard keeps the read honest when a slot key is absent.
        const target: boolean | undefined = Object.hasOwn(payload.slots, op.slot) ? payload.slots[op.slot][op.half] : undefined
        const want = op.action === 'stop' ? false : true
        if (target !== undefined && target === want) {
          next.push({ ...op, outcome: 'done' })
          continue
        }
        if (Date.now() - op.startedAt > 60_000) {
          next.push({ ...op, outcome: 'stalled' })
          continue
        }
        next.push(op)
      }
      return next
    })
  }

  useEffect(() => {
    const cancelledRef = { current: false }
    const pull = async (force: boolean): Promise<void> => {
      try {
        const next = await fetchHealth()
        if (!cancelledRef.current) {
          setHealth(next)
          setError(undefined)
          resolveInFlight(next)
        }
        if (force || next.signature !== signature.current) {
          signature.current = next.signature
          const full = await fetchRuntime()
          if (!cancelledRef.current) setStatus(full)
        }
      } catch (cause) {
        // A failed health read while an op is in flight is itself progress:
        // the backend went away mid-restart (or is still booting).
        if (!cancelledRef.current) {
          setError(messageOf(cause))
        }
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
      cancelledRef.current = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [revision])

  const refresh = useCallback((): void => {
    setRevision(value => value + 1)
  }, [])

  /** Manually close one in-flight op (the operator stopped waiting). */
  const dismiss = useCallback((key: string): void => {
    setInFlight(current => current.filter(op => op.key !== key || op.outcome === undefined))
  }, [])

  const act = useCallback((slot: 'aek' | 'next', half: Half, action: HalfAction) => {
    const key = `${slot}:${half}:${action}`
    setBusy(key)
    setError(undefined)
    // X2 item 7: the request lands in the in-flight pipeline — the row's
    // step chips follow it from `requested` to `applied` to a live outcome.
    setInFlight(current => [
      ...current.filter(op => op.key !== key),
      { key, action, half, slot, startedAt: Date.now(), phase: 'requested' as const },
    ])
    void postInstance(slot, half, action)
      .then(() => {
        setBusy(undefined)
        setInFlight(current => current.map(op => (op.key === key ? { ...op, phase: 'applied' as const } : op)))
        setRevision(value => value + 1)
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause))
        setBusy(undefined)
        setInFlight(current => current.map(op => (op.key === key ? { ...op, outcome: 'failed' as const } : op)))
      })
  }, [])

  return { status, health, error, busy, inFlight, dismiss, refresh, act }
}
