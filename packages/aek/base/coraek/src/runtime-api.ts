/**
 * Host API for the NUMBERED CORAEK RUNTIME VIEW (S round): "which runtime
 * hosts which plugins, and how much memory each owns".
 *
 * Protocol surface (registered on the `webServer` seam, unregistered on
 * disposal — the same seam convention as `capability-api.ts`):
 *   - `GET  /api/aek/runtimes`   the v2 snapshot (X2): runtime 0 = the shared
 *     host runtime (this process), runtimes 1..N = the isolated containers
 *     (several capabilities per process); live memory readings (host =
 *     process.memoryUsage, isolated = whole-process RSS, never an invented
 *     per-module split); `isolatable` = the movable candidates;
 *     `pluginMemory` = the per-plugin view with honest calibers + its
 *     container.
 *   - `POST /api/aek/runtimes`   X2 body `{ op, confirm: true, ... }`:
 *     `op: 'add'`    — create a NEW runtime container (`label` = optional
 *                      custom name, blank = auto `runtime{n}`); a legacy
 *                      `{ capability }` payload assigns that capability into
 *                      the new container;
 *     `op: 'move'`   — `{ capability, runtime }` move one plugin into an
 *                      EXISTING container (or `runtime0` = the shared host);
 *     `op: 'remove'` — `{ runtime }` delete a container (members go back to
 *                      the host); legacy `{ capability }` moves it home;
 *     `op: 'rename'` — `{ runtime, label }` persist an operator label.
 *     Every mutating call without `confirm: true` answers 428, mirroring the
 *     console's write-confirm rule. Each mutation appends an operation-ledger
 *     entry (the "how far is that action" pipeline, `GET /api/aek/ops`).
 *   - `GET  /api/aek/ops`       the operation ledger (newest first, the
 *     console's progress surface — the "queued … and then what?" answer).
 *   - `POST /api/aek/ops/remove` — `{ id, confirm: true }` dismiss ONE
 *     ledger row (428 without confirm; the row's in-flight action keeps
 *     running — the ledger is a progress view, not the queue).
 *   - `POST /api/aek/ops/clear` — `{ confirm: true }` clear every row.
 *
 * This module is node-builtin-free on purpose: coraek's main tsconfig is a
 * CLIENT shape (no ambient `node` types), so all filesystem / process I/O
 * lives in `runtimes.mjs` / `ops.mjs` (the zero-dep package-root modules,
 * the same split as `capability-api.ts` + `external-supervisor.mjs`).
 *
 * @module @cheezmil/coraek/runtime-api
 */

import type { Context } from '@deepseek-ai/cordis'
import { CapabilitySupervisor } from '../external-supervisor.mjs'
import {
  createRuntime,
  discoverAekSiblingPackages,
  moveCapability,
  readRuntimeDocV2,
  removeRuntime,
  startRuntimeGroup,
  stopRuntimeGroup,
  writeRuntimeMode,
  type DiscoveredAekPackage,
} from '../runtime.mjs'
import { runtimesSnapshot, writeRuntimeLabel, type RuntimesSnapshot, type SupervisorRow } from '../runtimes.mjs'
import { appendOp, clearOps, listOps, removeOp, updateOp } from '../ops.mjs'
import { resolveAekHome } from '../home.mjs'

/** Routes owned by this module. */
export const RUNTIMES_API_PATH = '/api/aek/runtimes'

/** The operation ledger route (the "how far is that action" surface). */
export const OPS_API_PATH = '/api/aek/ops'

/** Dismiss ONE ledger entry (the console's per-row 剔除). */
export const OPS_REMOVE_API_PATH = '/api/aek/ops/remove'

/** Clear every ledger entry (the console's 清空). */
export const OPS_CLEAR_API_PATH = '/api/aek/ops/clear'

/** The discovered capability packages for this host (the POST paths' input). */
function discoverPackages(): DiscoveredAekPackage[] {
  // The client-shaped tsconfig has no ambient `node` types: reach `process`
  // through globalThis (an empty cwd is the no-op case).
  const hostProcess = (globalThis as unknown as { process?: { cwd?: () => string } }).process
  return discoverAekSiblingPackages(
    import.meta.url,
    typeof hostProcess?.cwd === 'function' ? hostProcess.cwd() : '',
  )
}

/**
 * A narrow structural spelling of the response the seam passes to a handler
 * (deliberately `node:http`-free under the client-shaped tsconfig).
 */
interface SeamResponse {
  statusCode: number
  setHeader(key: string, value: string): void
  end(payload?: string): void
}

/** A narrow structural spelling of the request the seam passes to a handler. */
interface SeamRequest {
  readonly method?: string
  [Symbol.asyncIterator](): AsyncIterator<unknown, void, unknown>
}

/**
 * @param res - response.
 * @param status - HTTP status.
 * @param body - JSON-serializable body.
 */
function sendJson(res: SeamResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * Read the request body with a hard cap (a mutation payload is a handful of
 * strings; anything bigger is a mistake, not data).
 * @param req - request.
 * @returns the parsed body, or undefined when malformed / oversized.
 */
async function readJsonBody(req: SeamRequest): Promise<Record<string, unknown> | undefined> {
  const pieces: string[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const piece = typeof chunk === 'string' ? chunk : toUtf8(chunk)
      size += piece.length
      if (size > 64 * 1024) return undefined
      pieces.push(piece)
    }
    if (size === 0) return undefined
    const parsed: unknown = JSON.parse(pieces.join(''))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Coerce a byte-buffer chunk to UTF-8 text without importing `Buffer`.
 * @param chunk - an unknown runtime value.
 * @returns the chunk as a string, or empty when it has no readable bytes.
 */
function toUtf8(chunk: unknown): string {
  const candidate = chunk as { toString?: (encoding?: string) => string } | Uint8Array
  if (typeof candidate?.toString === 'function' && candidate instanceof Uint8Array === false) {
    return candidate.toString('utf8')
  }
  if (candidate instanceof Uint8Array) return new TextDecoder().decode(candidate)
  return ''
}

/**
 * The narrow `webServer` seam, spelled locally (same convention as
 * `capability-api.ts` and the aek-websearch console routes).
 * @param ctx - plugin context.
 * @returns the server seam, or undefined in a headless composition.
 */
function serverOf(ctx: Context): {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: SeamRequest, res: SeamResponse) => void | Promise<void>
  }): () => void
} | undefined {
  return (ctx as unknown as {
    webServer?: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: SeamRequest, res: SeamResponse) => void | Promise<void>
      }): () => void
    }
  }).webServer
}

/**
 * Assemble the snapshot the GET route serves (discovery + live supervisor
 * rows + the numbered view).
 * @param aekHome - the runtime-mode store root.
 * @param supervisor - the composition's capability supervisor.
 * @returns the snapshot.
 */
async function snapshotOf(aekHome: string, supervisor: CapabilitySupervisor): Promise<RuntimesSnapshot> {
  const supervisorRows: SupervisorRow[] = await supervisor.statusAll()
  // The client-shaped tsconfig has no ambient `node` types: reach `process`
  // through globalThis (the host half only; an empty cwd is the no-op case).
  const hostProcess = (globalThis as unknown as { process?: { cwd?: () => string } }).process
  const packages: DiscoveredAekPackage[] = discoverAekSiblingPackages(
    import.meta.url,
    typeof hostProcess?.cwd === 'function' ? hostProcess.cwd() : '',
  )
  return runtimesSnapshot({ aekHome, packages, supervisorRows })
}

/**
 * Register the numbered runtime API on the current host.
 *
 * Shares the composition's `CapabilitySupervisor` with the capability API
 * (one instance owns the spawned children; two instances would lose the
 * child handles to each other), and the boot-time isolate switch stays in
 * `registerCapabilityApi` — a runtime added live here is registered +
 * started immediately, so no restart is needed for the process to appear.
 *
 * @param ctx - the coraek plugin context.
 * @param options - injection seam; tests may supply their own supervisor and
 *   home. Production callers pass the shared supervisor from `apply`.
 */
export function registerRuntimeApi(
  ctx: Context,
  options: { supervisor?: CapabilitySupervisor; aekHome?: string } = {},
): void {
  const server = serverOf(ctx)
  if (server === undefined) return

  const supervisor = options.supervisor ?? new CapabilitySupervisor()
  const aekHome = options.aekHome ?? resolveAekHome()
  ctx.effect(() => {
    const unsubscribers = [
      server.register({
        kind: 'exact',
        path: RUNTIMES_API_PATH,
        handler: async (req, res) => {
          if (req.method === 'GET') {
            try {
              const snapshot = await snapshotOf(aekHome, supervisor)
              sendJson(res, 200, { protocol: 'aek-runtimes/2', ...snapshot })
            } catch {
              sendJson(res, 502, { code: 'runtimes-failed', message: 'the runtime state is unreadable' })
            }
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { code: 'method-not-allowed', message: 'GET or POST' })
            return
          }
          const body = await readJsonBody(req)
          if (body === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { op, confirm: true, ... } is required' })
            return
          }
          const op = typeof body.op === 'string' ? body.op : undefined
          if (op === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { op, confirm: true, ... } is required' })
            return
          }
          if (body.confirm !== true) {
            // The console's write-confirm rule: mutating without explicit
            // confirmation is a 428 (mirrors capabilities/stop and plugins/action).
            sendJson(res, 428, {
              code: 'confirm-required',
              message: 'changing a runtime is a write operation: resend with confirm: true',
            })
            return
          }
          const capability = typeof body.capability === 'string' ? body.capability : undefined
          const runtime = typeof body.runtime === 'string' ? body.runtime : undefined
          try {
            if (op === 'add') {
              // X2: `add` creates a NEW runtime container. The body's `label`
              // is the container name (blank = the auto `runtime{n}` number).
              // A LEGACY client still sends `{ capability }` — that shape
              // gets a fresh container of its own, so old stable builds keep
              // working against the v2 store.
              const label = typeof body.label === 'string' ? body.label : ''
              const created = createRuntime(aekHome, label)
              if (!created.ok || created.runtimeId === undefined) {
                sendJson(res, 502, { code: 'store-write-failed', problems: created.problems })
                return
              }
              const packages = discoverPackages()
              const opEntry = appendOp(aekHome, {
                kind: 'runtime-add',
                title: created.runtimeId,
                owner: 'coraek',
                steps: [
                  { label: '持久化运行时', state: 'done' },
                  { label: '启动进程', state: 'active' },
                  { label: '运行中', state: 'pending' },
                ],
              })
              const spawned = await startRuntimeGroup({ supervisor, aekHome, packages, runtimeId: created.runtimeId })
              if (spawned.ok === false) {
                updateOp(aekHome, opEntry.id, {
                  status: 'failed',
                  steps: [
                    { label: '持久化运行时', state: 'done' },
                    { label: '启动进程', state: 'failed' },
                    { label: '运行中', state: 'pending' },
                  ],
                  note: spawned.problem,
                })
                sendJson(res, 502, { code: 'spawn-failed', ...spawned, opId: opEntry.id, note: 'the runtime was created; its process will start at the next host boot' })
                return
              }
              // A legacy capability payload: assign it into the new container
              // (the custom-bin exclusivity rule is enforced inside).
              let assignNote: string | undefined
              if (capability !== undefined) {
                const target = packages.find(pkg => pkg.id === capability)
                const doc = readRuntimeDocV2(aekHome)
                const targetMembers = packages
                  .filter(pkg => pkg.id !== capability && doc.modes[pkg.id] === 'isolate' && doc.assignments[pkg.id] === created.runtimeId)
                  .map(pkg => ({ id: pkg.id, manifest: pkg.manifest }))
                const moved = moveCapability(aekHome, capability, created.runtimeId, {
                  pkg: target !== undefined ? { manifest: target.manifest, packageDir: target.packageDir } : undefined,
                  targetMembers,
                })
                if (!moved.ok) {
                  // The container exists but the assignment was refused: undo it.
                  stopRuntimeGroup({ supervisor, aekHome, runtimeId: created.runtimeId })
                  removeRuntime(aekHome, created.runtimeId)
                  updateOp(aekHome, opEntry.id, { status: 'failed', note: moved.problems?.join('; ') })
                  sendJson(res, 409, { code: 'assign-failed', ...moved })
                  return
                }
                const respawned = await startRuntimeGroup({ supervisor, aekHome, packages, runtimeId: created.runtimeId })
                if (respawned.ok === false) assignNote = respawned.problem
              }
              updateOp(aekHome, opEntry.id, {
                status: 'done',
                steps: [
                  { label: '持久化运行时', state: 'done' },
                  { label: '启动进程', state: 'done' },
                  { label: '运行中', state: 'done' },
                ],
                ...(assignNote !== undefined ? { note: assignNote } : {}),
              })
              // X4: the new container's id rides back in the response body so
              // a client can chain "new dedicated runtime → move this plugin in"
              // without diffing snapshots; older clients simply ignore it.
              sendJson(res, 200, { protocol: 'aek-runtimes/2', opId: opEntry.id, runtimeId: created.runtimeId, ...await snapshotOf(aekHome, supervisor) })
            } else if (op === 'move') {
              if (capability === undefined || runtime === undefined) {
                sendJson(res, 400, { code: 'bad-request', message: 'body { op: "move", capability, runtime, confirm: true } is required' })
                return
              }
              const doc = readRuntimeDocV2(aekHome)
              const source = doc.assignments[capability]
              const hostTarget = runtime === 'runtime0' || runtime === 'host'
              if (!hostTarget && doc.containers[runtime] !== true && !Object.values(doc.assignments).includes(runtime)) {
                sendJson(res, 409, { code: 'unknown-runtime', message: `'${runtime}' does not exist: create it first` })
                return
              }
              const packages = discoverPackages()
              const target = packages.find(pkg => pkg.id === capability)
              const targetMembers = hostTarget ? [] : packages
                .filter(pkg => pkg.id !== capability && doc.modes[pkg.id] === 'isolate' && doc.assignments[pkg.id] === runtime)
                .map(pkg => ({ id: pkg.id, manifest: pkg.manifest }))
              const moved = moveCapability(aekHome, capability, hostTarget ? 'runtime0' : runtime, {
                pkg: target !== undefined ? { manifest: target.manifest, packageDir: target.packageDir } : undefined,
                targetMembers,
              })
              if (!moved.ok) {
                sendJson(res, 409, { code: 'assign-failed', ...moved })
                return
              }
              const opEntry = appendOp(aekHome, {
                kind: 'runtime-move',
                title: `${capability} → ${hostTarget ? 'runtime0' : runtime}`,
                owner: 'coraek',
                steps: [
                  { label: '持久化分配', state: 'done' },
                  { label: '切换进程', state: 'active' },
                ],
              })
              // Live: the TARGET container re-spawns when its attach changes
              // (a custom-bin member took over, or a new member arrived).
              let spawnNote: string | undefined
              if (!hostTarget && source !== runtime) {
                const targetResult = await startRuntimeGroup({ supervisor, aekHome, packages, runtimeId: runtime })
                if (targetResult.ok === false) spawnNote = targetResult.problem
              }
              // The SOURCE container: an IMPLICIT one that is now empty stops;
              // an explicit (console-created) one keeps its process (the user
              // asked for that container to exist).
              if (source !== undefined && source !== runtime) {
                const now = readRuntimeDocV2(aekHome)
                const implicit = now.containers[source] !== true
                const empty = !Object.values(now.assignments).includes(source)
                if (implicit && empty) {
                  const stopped = await stopRuntimeGroup({ supervisor, aekHome, runtimeId: source })
                  if (stopped.ok === false && stopped.problem !== undefined) spawnNote = stopped.problem
                }
              }
              updateOp(aekHome, opEntry.id, {
                status: spawnNote !== undefined ? 'failed' : 'done',
                steps: [
                  { label: '持久化分配', state: 'done' },
                  { label: '切换进程', state: spawnNote !== undefined ? 'failed' : 'done' },
                ],
                ...(spawnNote !== undefined ? { note: spawnNote } : {}),
              })
              sendJson(res, 200, {
                protocol: 'aek-runtimes/2',
                opId: opEntry.id,
                ...(spawnNote !== undefined ? { note: spawnNote } : {}),
                ...await snapshotOf(aekHome, supervisor),
              })
            } else if (op === 'remove') {
              // X2: `remove` deletes a RUNTIME container (members back to the
              // host). A LEGACY client still sends `{ capability }` — that
              // moves the capability to the shared host and prunes the
              // container it owned.
              const targetId = runtime ?? capability
              if (targetId === undefined) {
                sendJson(res, 400, { code: 'bad-request', message: 'body { op: "remove", runtime | capability, confirm: true } is required' })
                return
              }
              if (runtime === undefined) {
                // Legacy: move the capability home; the implicit container it
                // owned is pruned with it.
                const stopped = await supervisor.stop(targetId)
                const persisted = writeRuntimeMode(aekHome, targetId, 'share')
                if (!stopped.ok || !persisted.ok) {
                  sendJson(res, 502, { code: 'remove-failed', stop: stopped, persist: persisted })
                  return
                }
                sendJson(res, 200, await snapshotOf(aekHome, supervisor))
                return
              }
              const stopped = await stopRuntimeGroup({ supervisor, aekHome, runtimeId: targetId })
              const removed = removeRuntime(aekHome, targetId)
              if (!removed.ok) {
                sendJson(res, 409, { code: 'remove-failed', ...removed })
                return
              }
              const opEntry = appendOp(aekHome, {
                kind: 'runtime-remove',
                title: targetId,
                owner: 'coraek',
                steps: [
                  { label: '停止进程', state: stopped.ok === false ? 'failed' : 'done' },
                  { label: '插件移回宿主', state: 'done' },
                ],
                status: stopped.ok === false ? 'failed' : 'done',
                ...(stopped.problem !== undefined ? { note: stopped.problem } : {}),
              })
              sendJson(res, 200, { protocol: 'aek-runtimes/2', opId: opEntry.id, ...await snapshotOf(aekHome, supervisor) })
            } else if (op === 'rename') {
              const label = typeof body.label === 'string' ? body.label : ''
              // X2: labels key off the RUNTIME id. A legacy `{ capability }`
              // renames the runtime the capability lives in.
              const target = runtime ?? (capability !== undefined
                ? (readRuntimeDocV2(aekHome).assignments[capability] ?? 'runtime0')
                : undefined)
              if (target === undefined) {
                sendJson(res, 400, { code: 'bad-request', message: 'body { op: "rename", runtime, label, confirm: true } is required' })
                return
              }
              const result = writeRuntimeLabel(aekHome, target, label)
              if (!result.ok) {
                sendJson(res, 400, { code: 'bad-request', ...result })
                return
              }
              const opEntry = appendOp(aekHome, {
                kind: 'runtime-rename',
                title: target,
                owner: 'coraek',
                status: 'done',
                steps: [{ label: '持久化名称', state: 'done' }],
              })
              sendJson(res, 200, { protocol: 'aek-runtimes/2', opId: opEntry.id, ...await snapshotOf(aekHome, supervisor) })
            } else {
              sendJson(res, 400, { code: 'bad-request', message: `unknown op '${op}' — try: add, move, remove, rename` })
            }
          } catch {
            sendJson(res, 502, { code: 'runtimes-failed', message: 'the runtime state is unreadable' })
          }
        },
      }),
      server.register({
        kind: 'exact',
        path: OPS_API_PATH,
        handler: (req, res) => {
          if (req.method !== 'GET') {
            sendJson(res, 405, { code: 'method-not-allowed', message: 'GET' })
            return
          }
          try {
            sendJson(res, 200, { protocol: 'aek-ops/1', ops: listOps(aekHome) })
          } catch {
            sendJson(res, 502, { code: 'ops-failed', message: 'the operation ledger is unreadable' })
          }
        },
      }),
      server.register({
        kind: 'exact',
        path: OPS_REMOVE_API_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { code: 'method-not-allowed', message: 'POST' })
            return
          }
          const body = await readJsonBody(req)
          if (body === undefined || typeof body.id !== 'string' || body.id.length === 0) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { id, confirm: true } is required' })
            return
          }
          if (body.confirm !== true) {
            // The console's write-confirm rule: dismissing a ledger row is a
            // write, so it needs the explicit confirm (mirrors the runtimes
            // mutation routes).
            sendJson(res, 428, { code: 'confirm-required', message: 'dismissing a ledger entry is a write operation: resend with confirm: true' })
            return
          }
          try {
            sendJson(res, 200, { protocol: 'aek-ops/1', removed: removeOp(aekHome, body.id) })
          } catch {
            sendJson(res, 502, { code: 'ops-failed', message: 'the operation ledger is unreadable' })
          }
        },
      }),
      server.register({
        kind: 'exact',
        path: OPS_CLEAR_API_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { code: 'method-not-allowed', message: 'POST' })
            return
          }
          const body = await readJsonBody(req)
          if (body === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { confirm: true } is required' })
            return
          }
          if (body.confirm !== true) {
            sendJson(res, 428, { code: 'confirm-required', message: 'clearing the ledger is a write operation: resend with confirm: true' })
            return
          }
          try {
            sendJson(res, 200, { protocol: 'aek-ops/1', removed: clearOps(aekHome) })
          } catch {
            sendJson(res, 502, { code: 'ops-failed', message: 'the operation ledger is unreadable' })
          }
        },
      }),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, 'coraek: runtime api routes')
}
