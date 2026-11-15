/**
 * AEK operation ledger (X2 round) — the "how far is that action" truth.
 *
 * A plugin restart, a runtime add / move / remove, an instance action: until
 * now each was either fire-and-forget (the queue file nobody consumed) or a
 * bare `{status:'queued'}` reply, and the console could only show "queued …
 * and then what?". The operator needs the STAGE: which step the operation is
 * on, which are done, where it failed, and whether the host is about to
 * apply it on its next start.
 *
 * The ledger is a plain JSON file under `<AEK_HOME>/plugin-ops.json` (zero
 * dependency, atomic tmp + rename, last-wins). Both the coraek HOST (the
 * runtime / ops routes) and the `aek-websearch` plugin (the plugin-console
 * restart face) append to it, so one GET answers every "in flight" action
 * across both owners. In-flight entries are `running`; entries that only
 * finish when the host process itself restarts are `running` with
 * `pendingHostRestart: true` — the host's boot hook flips them to `done`
 * (`markHostRestartOps`), which is the moment the UI may claim they are
 * applied.
 *
 * @module @cheezmil/coraek/ops
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Keep the file small: the console shows the tail, the rest scrolls off. */
const MAX_OPS = 100

/**
 * Absolute path of the operation ledger (derived from `aekHome`, never
 * hardcoded).
 * @param {string} aekHome
 * @returns {string}
 */
export function opsPath(aekHome) {
  return join(aekHome, 'plugin-ops.json')
}

/**
 * @typedef {Object} OpStep
 * @property {string} label - the operator-facing step name.
 * @property {'done' | 'active' | 'pending' | 'failed'} state - lifecycle state.
 */

/**
 * @typedef {Object} OpEntry
 * @property {string} id - stable id (uuid) the console polls by.
 * @property {string} kind - 'plugin-restart' | 'plugin-restart-host' | 'runtime-add' | 'runtime-move' | 'runtime-remove' | 'runtime-rename' | 'instance'
 * @property {string} title - one line the UI renders (capability / runtime / slot).
 * @property {OpStep[]} steps - the operator-visible pipeline.
 * @property {'running' | 'done' | 'failed'} status
 * @property {boolean} [pendingHostRestart] - finishes only on the host's next start.
 * @property {string} [note] - failure / extra text.
 * @property {string} [owner] - 'coraek' | 'aek-websearch' (which face recorded it).
 * @property {number} createdAt - epoch ms.
 * @property {number} updatedAt - epoch ms.
 */

/**
 * Read the ledger (newest last). A missing / corrupt file is the
 * fresh-install shape, not an error.
 * @param {string} aekHome
 * @returns {OpEntry[]}
 */
export function readOps(aekHome) {
  try {
    const parsed = JSON.parse(readFileSync(opsPath(aekHome), 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.ops)) return []
    return parsed.ops
  } catch {
    return []
  }
}

/**
 * Persist the ledger (atomic tmp + rename).
 * @param {string} aekHome
 * @param {OpEntry[]} ops
 */
function writeOps(aekHome, ops) {
  const target = opsPath(aekHome)
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}`
  writeFileSync(tmp, `${JSON.stringify({ version: 1, ops: ops.slice(-MAX_OPS) }, null, 2)}\n`)
  renameSync(tmp, target)
}

/**
 * Append a NEW operation (the action is acknowledged as started).
 * @param {string} aekHome
 * @param {{ kind: string, title: string, steps: OpStep[], status?: 'running' | 'done' | 'failed', pendingHostRestart?: boolean, note?: string, owner?: string }} input
 * @returns {OpEntry} the full entry (the id is what the client polls by).
 */
export function appendOp(aekHome, input) {
  const ops = readOps(aekHome)
  const now = Date.now()
  const entry = {
    id: randomUUID(),
    kind: input.kind,
    title: input.title,
    steps: input.steps.map(step => ({ label: step.label, state: step.state })),
    status: input.status ?? 'running',
    owner: input.owner ?? 'coraek',
    createdAt: now,
    updatedAt: now,
  }
  if (input.pendingHostRestart === true) entry.pendingHostRestart = true
  if (typeof input.note === 'string' && input.note.length > 0) entry.note = input.note
  ops.push(entry)
  writeOps(aekHome, ops)
  return entry
}

/**
 * Update ONE entry by id (step advances, status, note). Unknown ids answer
 * false — a crashed owner must not corrupt the ledger.
 * @param {string} aekHome
 * @param {string} id
 * @param {{ status?: 'running' | 'done' | 'failed', steps?: OpStep[], note?: string }} patch
 * @returns {boolean} whether the entry existed and was updated.
 */
export function updateOp(aekHome, id, patch) {
  const ops = readOps(aekHome)
  const entry = ops.find(op => op.id === id)
  if (entry === undefined) return false
  if (patch.status !== undefined) entry.status = patch.status
  if (Array.isArray(patch.steps)) entry.steps = patch.steps.map(step => ({ label: step.label, state: step.state }))
  if (typeof patch.note === 'string') entry.note = patch.note
  entry.updatedAt = Date.now()
  writeOps(aekHome, ops)
  return true
}

/**
 * The console's view: the newest `limit` operations (newest FIRST, so the
 * top row is the most recent action).
 * @param {string} aekHome
 * @param {number} [limit] - default 40.
 * @returns {OpEntry[]}
 */
export function listOps(aekHome, limit = 40) {
  const ops = readOps(aekHome)
  return ops.slice(-Math.max(1, Math.min(limit, MAX_OPS))).reverse()
}

/**
 * The host's boot hook: every entry waiting on the host process itself now
 * just restarted, so it is applied. Flips `pendingHostRestart` entries from
 * `running` to `done` (their steps close out). Best-effort and idempotent.
 * @param {string} aekHome
 * @returns {number} how many entries were closed.
 */
export function markHostRestartOps(aekHome) {
  const ops = readOps(aekHome)
  let closed = 0
  for (const entry of ops) {
    if (entry.pendingHostRestart === true && entry.status === 'running') {
      entry.status = 'done'
      entry.updatedAt = Date.now()
      for (const step of entry.steps) {
        if (step.state === 'active' || step.state === 'pending') step.state = 'done'
      }
      delete entry.pendingHostRestart
      closed += 1
    }
  }
  if (closed > 0) writeOps(aekHome, ops)
  return closed
}
