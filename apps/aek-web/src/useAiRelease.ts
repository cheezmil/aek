/**
 * The AI auto-release switch (S7, 2026-11-15): the live read/write of the
 * host-persisted `<AEK_HOME>/ai-release.json` boolean, served by the coraek
 * host half (`@cheezmil/coraek` ai-release API). When the operator flips the
 * switch on, the AI agent may run the release chain (`release.mjs --yes`,
 * which interrupts the live stable instance) WITHOUT asking per run; while it
 * is off (the default) the AI must ask in conversation first.
 *
 * `unsupported` is a 404: an older host without the route still renders the
 * rest of the panel — the switch row hides itself, it never invents a state.
 *
 * @module @cheezmil/aek-web/src/useAiRelease
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** The host route publishing the auto-release switch. */
export const AI_RELEASE_API = '/api/aek/ai-release'

/** Live auto-release state. */
export interface AiReleaseState {
  /** The persisted switch, `undefined` until the first read completes. */
  allowed: boolean | undefined
  /** Last error message. */
  error: string | undefined
  /** True when the host has no route (an older build): hide the switch. */
  unsupported: boolean
  /** In-flight write, or undefined. */
  busy: boolean
  /** Force a fresh read. */
  refresh: () => void
  /** Persist the switch (428-confirmed on the host). */
  setAllowed: (allowed: boolean) => Promise<void>
}

/**
 * The live auto-release hook.
 * @param refreshSignal - a number bump re-reads the switch.
 * @returns the state.
 */
export function useAiRelease(refreshSignal = 0): AiReleaseState {
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [unsupported, setUnsupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  const refresh = useCallback((): void => {
    const mySeq = ++seq.current
    void fetch(AI_RELEASE_API).then(async (response) => {
      if (response.status === 404) {
        setUnsupported(true)
        return
      }
      if (!response.ok) {
        setError(`HTTP ${response.status}`)
        return
      }
      const body = (await response.json()) as { allowed: boolean }
      if (mySeq !== seq.current) return
      setUnsupported(false)
      setAllowed(body.allowed)
      setError(undefined)
    }).catch(() => {
      if (mySeq !== seq.current) return
      setAllowed(undefined)
      setError('network')
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, refreshSignal])

  const setAllowedWrite = useCallback(async (next: boolean): Promise<void> => {
    setBusy(true)
    try {
      const response = await fetch(AI_RELEASE_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allowed: next, confirm: true }),
      })
      if (response.status === 404) throw new Error('404')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setAllowed(next)
      refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh])

  return { allowed, error, unsupported, busy, refresh, setAllowed: setAllowedWrite }
}
