/**
 * The BUILD-FLAG switch (BB round, 2026-11-16): the live read/write of the
 * host-persisted `<AEK_HOME>/build-flags.json` document, served by the
 * coraek host half (`@cheezmil/coraek/build-flags-api`).
 *
 * `sourcemap` decides whether the NEXT aek-web console build emits source
 * maps (the build scripts export `AEK_WEB_SOURCEMAP=1` from this file, and
 * `apps/aek-web/vite.config.ts` honors it). It never affects the running
 * instance — the note under the switch says so.
 *
 * `unsupported` is a 404: an older host without the route still renders the
 * rest of the panel — the switch row hides itself, it never invents a state.
 *
 * @module @cheezmil/aek-web/src/useBuildFlags
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** The host route publishing the build-flag switch. */
export const BUILD_FLAGS_API = '/api/aek/build-flags'

/** Live build-flag state. */
export interface BuildFlagsState {
  /** The persisted flag, `undefined` until the first read completes. */
  sourcemap: boolean | undefined
  /** Last error message. */
  error: string | undefined
  /** True when the host has no route (an older build): hide the switch. */
  unsupported: boolean
  /** In-flight write, or undefined. */
  busy: boolean
  /** Force a fresh read. */
  refresh: () => void
  /** Persist the flag (428-confirmed on the host). */
  setSourcemap: (on: boolean) => Promise<void>
}

/**
 * The live build-flag hook.
 * @param refreshSignal - a number bump re-reads the flags.
 * @returns the state.
 */
export function useBuildFlags(refreshSignal = 0): BuildFlagsState {
  const [sourcemap, setSourcemapState] = useState<boolean | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [unsupported, setUnsupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  const refresh = useCallback((): void => {
    const mySeq = ++seq.current
    void fetch(BUILD_FLAGS_API).then(async (response) => {
      if (response.status === 404) {
        setUnsupported(true)
        return
      }
      if (!response.ok) {
        setError(`HTTP ${response.status}`)
        return
      }
      const body = (await response.json()) as { sourcemap: boolean }
      if (mySeq !== seq.current) return
      setUnsupported(false)
      setSourcemapState(body.sourcemap)
      setError(undefined)
    }).catch(() => {
      if (mySeq !== seq.current) return
      setSourcemapState(undefined)
      setError('network')
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, refreshSignal])

  const setSourcemapWrite = useCallback(async (next: boolean): Promise<void> => {
    setBusy(true)
    try {
      const response = await fetch(BUILD_FLAGS_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourcemap: next, confirm: true }),
      })
      if (response.status === 404) throw new Error('404')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setSourcemapState(next)
      refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh])

  return { sourcemap, error, unsupported, busy, refresh, setSourcemap: setSourcemapWrite }
}
