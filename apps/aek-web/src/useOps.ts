/**
 * The X2 operation-ledger hook: `GET /api/aek/ops` — the "how far is that
 * action" surface. Every plugin restart and runtime edit appends a step
 * pipeline to the host's ledger; this hook polls while any op is still
 * `running` so the UI can show the real stage (step chips + a percentage),
 * not a bare "queued … and then what?".
 *
 * Polling stops on its own once nothing is running (a closed interval), so
 * the console is quiet when the system is quiet.
 *
 * @module @cheezmil/aek-web/src/useOps
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** The host route publishing the operation ledger. */
export const OPS_API = '/api/aek/ops'

/** One operator-visible step in an operation's pipeline. */
export interface OpStep {
  /** The operator-facing step name. */
  label: string
  /** Lifecycle state. */
  state: 'done' | 'active' | 'pending' | 'failed'
}

/** One ledger entry. */
export interface OpEntry {
  /** Stable id the host assigns. */
  id: string
  /** The action class ('plugin-restart' | 'runtime-add' | ...). */
  kind: string
  /** One line the UI renders (capability / runtime / slot). */
  title: string
  /** The operator-visible pipeline. */
  steps: OpStep[]
  /** 'running' | 'done' | 'failed'. */
  status: 'running' | 'done' | 'failed'
  /** Finishes only on the host's next start. */
  pendingHostRestart?: boolean
  /** Failure / extra text. */
  note?: string
  /** Which face recorded it. */
  owner?: string
  /** Epoch ms. */
  createdAt: number
  /** Epoch ms. */
  updatedAt: number
}

/** Ops state. */
export interface OpsState {
  /** The ledger, newest first. `undefined` until the first read. */
  ops: OpEntry[] | undefined
  /** True while at least one op is still running (polling is live). */
  active: boolean
  /** The progress of one op: how many steps are done over the total (0..1). */
  progressOf: (op: OpEntry) => number
  /** Force a fresh read. */
  refresh: () => void
}

/** Poll interval while an op is in flight. */
const POLL_MS = 2000

/**
 * The live ops-ledger hook.
 * @param refreshSignal - a number bump re-reads the ledger immediately.
 * @returns the state.
 */
export function useOps(refreshSignal = 0): OpsState {
  const [ops, setOps] = useState<OpEntry[] | undefined>(undefined)
  const [active, setActive] = useState(false)
  const seq = useRef(0)

  const read = useCallback((): void => {
    const mySeq = ++seq.current
    void fetch(OPS_API).then(async (response) => {
      if (mySeq !== seq.current) return
      if (!response.ok) return
      const body = (await response.json()) as { ops?: OpEntry[] }
      if (mySeq !== seq.current) return
      const list = Array.isArray(body.ops) ? body.ops : []
      setOps(list)
      setActive(list.some(op => op.status === 'running'))
    }).catch(() => {
      /* the ledger is advisory; a read failure keeps the last list */
    })
  }, [])

  useEffect(() => {
    read()
  }, [read, refreshSignal])

  // Poll only while something is in flight (the host closes in-flight ops;
  // a host-restart op stays `running` until the backend itself restarts).
  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(read, POLL_MS)
    return () => { clearInterval(timer) }
  }, [active, read])

  const progressOf = useCallback((op: OpEntry): number => {
    if (op.steps.length === 0) return op.status === 'done' ? 1 : 0
    const done = op.steps.filter(step => step.state === 'done').length
    return op.status === 'running' ? Math.min(done, op.steps.length - 1) / op.steps.length : (op.status === 'done' ? 1 : done / op.steps.length)
  }, [])

  return { ops, active, progressOf, refresh: read }
}
