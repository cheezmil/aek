/**
 * The "运行时与内存" page's live source of truth (S round):
 * `GET /api/aek/runtimes` + the single mutating `POST`, both served by the
 * coraek host half (`@cheezmil/coraek` runtime API). The numbered view, the
 * live memory readings and the isolatable list are read on the host at
 * request time, never baked into the client bundle.
 *
 * `unsupported` is a 404: an older host without the route must still render
 * the rest of the page — the section hides itself, it never invents data.
 *
 * @module @cheezmil/aek-web/src/useRuntimes
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** The host route publishing the numbered runtime view. */
export const RUNTIMES_API = '/api/aek/runtimes'

/** One runtime row (the host row always carries number 1). */
export interface RuntimeRow {
  /** Capability id (absent on the host row). */
  id?: string
  /** 1-based position in the numbered list. */
  number: number
  /** `host` (shared) or `isolated` (a capability process). */
  kind: 'host' | 'isolated'
  /** Display name (the operator label or the id). */
  label: string
  /** `running` / `stopped`. */
  state: 'running' | 'stopped'
  /** The owning process pid. */
  pid: number | null
  /** Live memory reading (bytes); fields absent when unreadable. */
  memory?: { rss?: number; heapUsed?: number }
  /** How the number was measured (never an invented per-module split). */
  memoryCaliber: 'process' | 'process-rss'
  /** The capabilities (plugins) living in this runtime. */
  plugins: string[]
}

/** The per-plugin memory view entry. */
export interface PluginMemoryEntry {
  /** The reading in bytes; `undefined` when not metered individually. */
  value?: number
  /** Always `bytes`. */
  unit: 'bytes'
  /** `process-rss` or `in-host-shared` (counted toward the host total). */
  caliber: 'process-rss' | 'in-host-shared'
}

/** The complete numbered runtime snapshot. */
export interface RuntimesSnapshot {
  /** Runtime 1: the shared host runtime. */
  host: RuntimeRow
  /** Runtimes 2..N: the isolated capability processes. */
  runtimes: RuntimeRow[]
  /** Capabilities that support `isolate` but currently share (add candidates). */
  isolatable: string[]
  /** One row per discovered capability. */
  pluginMemory: Record<string, PluginMemoryEntry>
}

/** Live runtimes state. */
export interface RuntimesState {
  /** The snapshot, `undefined` until the first read completes. */
  snapshot: RuntimesSnapshot | undefined
  /** Last error message. */
  error: string | undefined
  /** True when the host has no route (an older build): hide the section. */
  unsupported: boolean
  /** The in-flight mutation key (`add:<id>` / `remove:<id>` / `rename:<id>`), or undefined. */
  busy: string | undefined
  /** Force a fresh read. */
  refresh: () => void
  /** Persist an isolatable capability into its own runtime (428-confirmed on the host). */
  addRuntime: (id: string) => Promise<void>
  /** Stop a capability's process and move it back to the shared host. */
  removeRuntime: (id: string) => Promise<void>
  /** Persist an operator label for one runtime row. */
  renameRuntime: (id: string, label: string) => Promise<void>
}

/** One POST mutation of the runtime API. */
async function mutate(op: 'add' | 'remove' | 'rename', capability: string, label?: string): Promise<void> {
  const response = await fetch(RUNTIMES_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, capability, label, confirm: true }),
  })
  if (response.status === 404) throw new Error('404')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

/**
 * The live numbered-runtime hook.
 * @param refreshSignal - a number bump re-reads the snapshot.
 * @returns the state.
 */
export function useRuntimes(refreshSignal = 0): RuntimesState {
  const [snapshot, setSnapshot] = useState<RuntimesSnapshot | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [unsupported, setUnsupported] = useState(false)
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const seq = useRef(0)

  const refresh = useCallback((): void => {
    const mySeq = ++seq.current
    void fetch(RUNTIMES_API).then(async (response) => {
      if (response.status === 404) {
        setUnsupported(true)
        return
      }
      if (!response.ok) {
        setError(`HTTP ${response.status}`)
        return
      }
      const body = (await response.json()) as RuntimesSnapshot
      if (mySeq !== seq.current) return
      setUnsupported(false)
      setSnapshot(body)
      setError(undefined)
    }).catch(() => {
      if (mySeq !== seq.current) return
      setSnapshot(undefined)
      setError('network')
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, refreshSignal])

  const addRuntime = useCallback(async (id: string): Promise<void> => {
    setBusy(`add:${id}`)
    try {
      await mutate('add', id)
      refresh()
    } finally {
      setBusy(undefined)
    }
  }, [refresh])

  const removeRuntime = useCallback(async (id: string): Promise<void> => {
    setBusy(`remove:${id}`)
    try {
      await mutate('remove', id)
      refresh()
    } finally {
      setBusy(undefined)
    }
  }, [refresh])

  const renameRuntime = useCallback(async (id: string, label: string): Promise<void> => {
    setBusy(`rename:${id}`)
    try {
      await mutate('rename', id, label)
      refresh()
    } finally {
      setBusy(undefined)
    }
  }, [refresh])

  return { snapshot, error, unsupported, busy, refresh, addRuntime, removeRuntime, renameRuntime }
}
