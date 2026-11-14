/**
 * Read-only external-capability provider facts for the About surface.
 *
 * The host (coraek) serves `GET /api/aek/capabilities`: the registered
 * providers, their live state, and the host-rendered compliance line. The
 * About panel shows the "外部能力 / External capabilities" section only when
 * the host reports at least one provider — an empty registry renders nothing.
 *
 * @module @cheezmil/aek-home/src/client/useCapabilities
 */
import { useCallback, useEffect, useState } from 'react'

/** The host route that serves the capability registry. */
export const CAPABILITIES_API = '/api/aek/capabilities'

/** One registered external capability provider. */
export interface CapabilityProvider {
  id: string
  /** `absent` | `stopped` | `running` | `failed`. */
  state: string
  pid: number | null
  startedBy: string | null
  pin: string | null
  /** `self` | `managed`, empty when the store entry predates the field. */
  installPolicy: string | null
  /** Provider-asserted name / version / license / source. */
  name: string
  version: string
  spdx: string | null
  source: string | null
  /** The host-rendered compliance sentence (the "form"). */
  compliance: string
  /** The provider's runtime topology (always isolate; protocol-generic). */
  runtime?: { mode: string; reason: string }
}

/** The read-only capability snapshot. */
export interface CapabilityFacts {
  protocol: string
  /** The selective class-① runtime-mode surface (absent on older hosts). */
  runtime?: { defaultMode: string; choices: Record<string, string> }
  providers: CapabilityProvider[]
}

/** The live state the About panel consumes. */
export interface CapabilityState {
  /** `undefined` until the first host response. */
  facts: CapabilityFacts | undefined
  /** Human-readable failure message. */
  error: string | undefined
  /** True while a request is in flight. */
  loading: boolean
  /** Force a fresh host read. */
  refresh: () => void
}

/**
 * Fetch the capability registry once on mount and expose a manual refresh.
 * @returns the live state.
 */
export function useCapabilities(): CapabilityState {
  const [facts, setFacts] = useState<CapabilityFacts | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetch(CAPABILITIES_API, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return await response.json() as CapabilityFacts
      })
      .then((data) => {
        if (cancelled) return
        setFacts(data)
        setError(undefined)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [revision])

  const refresh = useCallback(() =>{  setRevision(value => value + 1) }, [])
  return { facts, error, loading, refresh }
}
