/**
 * Type declarations for `@cheezmil/coraek/ops` (the X2 operation ledger —
 * the "how far is that action" truth for plugin restarts and runtime edits).
 *
 * @module @cheezmil/coraek/ops
 */

/** One operator-visible step in an operation's pipeline. */
export interface OpStep {
  /** The operator-facing step name. */
  label: string
  /** Lifecycle state. */
  state: 'done' | 'active' | 'pending' | 'failed'
}

/** One ledger entry. */
export interface OpEntry {
  /** Stable id (uuid) the console polls by. */
  id: string
  /** The action class ('plugin-restart' | 'runtime-add' | 'instance' | ...). */
  kind: string
  /** One line the UI renders (capability / runtime / slot). */
  title: string
  /** The operator-visible pipeline. */
  steps: OpStep[]
  /** 'running' | 'done' | 'failed'. */
  status: 'running' | 'done' | 'failed'
  /**
   * Finishes only on the host process's next start; the host's boot hook
   * (`markHostRestartOps`) closes it.
   */
  pendingHostRestart?: boolean
  /** Failure / extra text. */
  note?: string
  /** Which face recorded it ('coraek' | 'aek-websearch'). */
  owner?: string
  /** Epoch ms. */
  createdAt: number
  /** Epoch ms. */
  updatedAt: number
}

/** Absolute path of the operation ledger (derived from `aekHome`, never hardcoded). */
export declare function opsPath(aekHome: string): string

/** Read the ledger (newest last); a missing / corrupt file is `[]`, not an error. */
export declare function readOps(aekHome: string): OpEntry[]

/**
 * Append a NEW operation (the action is acknowledged as started).
 * @returns the full entry (the id is what the client polls by).
 */
export declare function appendOp(
  aekHome: string,
  input: {
    kind: string
    title: string
    steps: OpStep[]
    status?: 'running' | 'done' | 'failed'
    pendingHostRestart?: boolean
    note?: string
    owner?: string
  },
): OpEntry

/** Update ONE entry by id (step advances, status, note); unknown ids answer false. */
export declare function updateOp(
  aekHome: string,
  id: string,
  patch: {
    status?: 'running' | 'done' | 'failed' | undefined
    steps?: OpStep[] | undefined
    note?: string | undefined
  },
): boolean

/** The console's view: the newest operations, newest FIRST. */
export declare function listOps(aekHome: string, limit?: number): OpEntry[]

/**
 * Remove ONE ledger entry by id (the operator dismissed it from the
 * console's progress view). The action the entry records may still be
 * in flight host-side — the ledger is a progress view, not the queue.
 * @returns whether an entry was removed.
 */
export declare function removeOp(aekHome: string, id: string): boolean

/**
 * Remove every ledger entry (the operator cleared the progress view).
 * @returns how many entries were removed.
 */
export declare function clearOps(aekHome: string): number

/**
 * The host's boot hook: close every entry waiting on the host process
 * itself (it just restarted, so they are applied). Best-effort, idempotent.
 * @returns how many entries were closed.
 */
export declare function markHostRestartOps(aekHome: string): number
