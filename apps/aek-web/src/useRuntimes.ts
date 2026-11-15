/**
 * The "运行时与内存" page's live source of truth (X2: v2 multi-tenant
 * runtime containers): `GET /api/aek/runtimes` + the mutating `POST`s,
 * both served by the coraek host half (`@cheezmil/coraek` runtime API).
 *
 * Runtimes are FIRST-CLASS CONTAINERS that may host several plugins in one
 * process: `runtime0` is the shared host process, `runtime1..N` are the
 * isolated containers. The numbered view, the live memory readings and the
 * movable list are read on the host at request time, never baked into the
 * client bundle.
 *
 * `unsupported` is a 404: an older host without the route must still render
 * the rest of the page — the section hides itself, it never invents data.
 *
 * @module @cheezmil/aek-web/src/useRuntimes
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** The host route publishing the v2 runtime view. */
export const RUNTIMES_API = '/api/aek/runtimes'

/** One runtime row (the host row always carries id `runtime0`, number 0). */
export interface RuntimeRow {
  /** The runtime id (`runtime0` = the shared host process). */
  id: string
  /** 0-based position in the numbered list. */
  number: number
  /** `host` (shared) or `isolated` (a runtime container). */
  kind: 'host' | 'isolated'
  /** Display name (the operator label or the runtime id). */
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
  /** `process-rss` (the container's whole process) or `in-host-shared`. */
  caliber: 'process-rss' | 'in-host-shared'
  /** The RUNTIME container the plugin lives in (isolated entries only). */
  runtimeId?: string
  /**
   * The source bucket the package lives in (the user's disk classification):
   * `plugins` / `public` / `base` / `extensions`. Absent on older hosts.
   */
  bucket?: 'plugins' | 'public' | 'base' | 'extensions'
}

/** The complete v2 runtime snapshot. */
export interface RuntimesSnapshot {
  /** Runtime 0: the shared host runtime. */
  host: RuntimeRow
  /** Runtimes 1..N: the isolated runtime containers. */
  runtimes: RuntimeRow[]
  /** Capabilities that support `isolate` but currently share (move candidates). */
  isolatable: string[]
  /** The host's `process.platform` — drives the per-OS memory wording. */
  platform?: string
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
  /** The in-flight mutation key, or undefined. */
  busy: string | undefined
  /** Force a fresh read. */
  refresh: () => void
  /**
   * Create a NEW runtime container. The optional label is the custom runtime
   * name; blank = the auto `runtime{n}` number (the X2 add row: no capability
   * picker, no confirmation — the name input + the ＋ button only).
   * X4: resolves the created container's id (the host's `add` response), so a
   * caller can chain "new dedicated runtime → move this plugin into it" in
   * one action; `undefined` when the host is older than that field.
   */
  addRuntime: (label?: string) => Promise<string | undefined>
  /** Move ONE plugin into an EXISTING runtime container (`runtime0` = the shared host). */
  movePlugin: (capability: string, runtime: string) => Promise<void>
  /** Delete a runtime container: its plugins go back to the shared host. */
  removeRuntime: (runtimeId: string) => Promise<void>
  /** Persist an operator label for one runtime row. */
  renameRuntime: (runtimeId: string, label: string) => Promise<void>
}

/** One POST mutation of the v2 runtime API. */
async function mutate(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(RUNTIMES_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, confirm: true }),
  })
  if (response.status === 404) throw new Error('404')
  const parsed = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const message = typeof parsed.message === 'string' ? parsed.message : `HTTP ${response.status}`
    throw new Error(message)
  }
  return parsed
}

/**
 * The live v2 runtime hook.
 * @param refreshSignal - a number bump re-reads the snapshot.
 * @param pollMs - when > 0, re-read on this interval while mounted. Two hook
 *   INSTANCES (the 运行时 section and the plugin rows) do not share state, so
 *   a mutation through one must become visible in the other without a manual
 *   refresh; a gentle poll keeps them honest.
 * @returns the state.
 */
export function useRuntimes(refreshSignal = 0, pollMs = 0): RuntimesState {
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

  // Gentle background poll while mounted: keeps OTHER hook instances on the
  // same page honest (a mutation through one instance must show up in the
  // plugin rows without a manual refresh click).
  useEffect(() => {
    if (!pollMs || pollMs <= 0) return
    const timer = setInterval(() => { refresh() }, pollMs)
    return () => { clearInterval(timer) }
  }, [pollMs, refresh])

  const addRuntime = useCallback(async (label?: string): Promise<string | undefined> => {
    setBusy('add')
    try {
      // X2: the add row is a bare NAME input — blank = the auto number.
      const trimmed = typeof label === 'string' ? label.trim() : ''
      const parsed = await mutate({ op: 'add', ...(trimmed.length > 0 ? { label: trimmed } : {}) })
      refresh()
      // X4: the host echoes the created container's id (older hosts: absent).
      return typeof parsed.runtimeId === 'string' ? parsed.runtimeId : undefined
    } finally {
      setBusy(undefined)
    }
  }, [refresh])

  const movePlugin = useCallback(async (capability: string, runtime: string): Promise<void> => {
    setBusy(`move:${capability}:${runtime}`)
    try {
      await mutate({ op: 'move', capability, runtime })
      refresh()
    } finally {
      setBusy(undefined)
    }
  }, [refresh])

  const removeRuntime = useCallback(async (runtimeId: string): Promise<void> => {
    setBusy(`remove:${runtimeId}`)
    try {
      await mutate({ op: 'remove', runtime: runtimeId })
      refresh()
    } finally {
      setBusy(undefined)
    }
  }, [refresh])

  const renameRuntime = useCallback(async (runtimeId: string, label: string): Promise<void> => {
    setBusy(`rename:${runtimeId}`)
    try {
      await mutate({ op: 'rename', runtime: runtimeId, label })
      refresh()
    } finally {
      setBusy(undefined)
    }
  }, [refresh])

  return { snapshot, error, unsupported, busy, refresh, addRuntime, movePlugin, removeRuntime, renameRuntime }
}
