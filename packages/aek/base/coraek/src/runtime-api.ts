/**
 * Host API for the NUMBERED CORAEK RUNTIME VIEW (S round): "which runtime
 * hosts which plugins, and how much memory each owns".
 *
 * Protocol surface (registered on the `webServer` seam, unregistered on
 * disposal — the same seam convention as `capability-api.ts`):
 *   - `GET  /api/aek/runtimes`   the numbered snapshot: runtime 1 = the
 *     shared host runtime (this process), runtimes 2..N = the isolated
 *     capability processes; live memory readings (host = process.memoryUsage,
 *     isolated = whole-process RSS, never an invented per-module split);
 *     `isolatable` = the add candidates; `pluginMemory` = the per-plugin
 *     view with honest calibers.
 *   - `POST /api/aek/runtimes`   body `{ op, capability, label?, confirm: true }`:
 *     `op: 'add'`    — move a capability into an isolated runtime (persist
 *                      the user-select choice, then register + start its
 *                      process live under the shared supervisor);
 *     `op: 'remove'` — stop the process and move it back to the shared host;
 *     `op: 'rename'` — persist an operator label for the runtime row.
 *     Every mutating call without `confirm: true` answers 428, mirroring the
 *     console's write-confirm rule (the capabilities/stop route).
 *
 * This module is node-builtin-free on purpose: coraek's main tsconfig is a
 * CLIENT shape (no ambient `node` types), so all filesystem / process I/O
 * lives in `runtimes.mjs` (the zero-dep package-root module, the same split
 * as `capability-api.ts` + `external-supervisor.mjs`).
 *
 * @module @cheezmil/coraek/runtime-api
 */

import type { Context } from '@deepseek-ai/cordis'
import { CapabilitySupervisor } from '../external-supervisor.mjs'
import {
  bootIsolateRuntimePackages,
  discoverAekSiblingPackages,
  writeRuntimeMode,
  type DiscoveredAekPackage,
} from '../runtime.mjs'
import { runtimesSnapshot, writeRuntimeLabel, type RuntimesSnapshot, type SupervisorRow } from '../runtimes.mjs'
import { resolveAekHome } from '../home.mjs'

/** Routes owned by this module. */
export const RUNTIMES_API_PATH = '/api/aek/runtimes'

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
              sendJson(res, 200, { protocol: 'aek-runtimes/1', ...snapshot })
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
            sendJson(res, 400, { code: 'bad-request', message: 'body { op, capability, label?, confirm: true } is required' })
            return
          }
          const op = typeof body.op === 'string' ? body.op : undefined
          const capability = typeof body.capability === 'string' ? body.capability : undefined
          if (op === undefined || capability === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { op, capability, label?, confirm: true } is required' })
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
          try {
            if (op === 'add') {
              const snapshot = await snapshotOf(aekHome, supervisor)
              if (!snapshot.isolatable.includes(capability)) {
                sendJson(res, 409, {
                  code: 'not-isolatable',
                  message: `'${capability}' does not support an isolated runtime (no spawnable aek.runtime.isolate.bin)`,
                })
                return
              }
              const persisted = writeRuntimeMode(aekHome, capability, 'isolate')
              if (!persisted.ok) {
                sendJson(res, 502, { code: 'store-write-failed', ...persisted })
                return
              }
              // Register + start the process LIVE under the shared supervisor
              // (the boot-time switch's single-package form).
              const hostProcess = (globalThis as unknown as { process?: { cwd?: () => string } }).process
              const packages = discoverAekSiblingPackages(
                import.meta.url,
                typeof hostProcess?.cwd === 'function' ? hostProcess.cwd() : '',
              )
              const target = packages.find(pkg => pkg.id === capability)
              const results = target !== undefined
                ? await bootIsolateRuntimePackages({ supervisor, aekHome, packages: [target] })
                : { [capability]: { ok: false, problem: 'capability package not discoverable' } }
              const result = results[capability]
              if (result !== undefined && result.ok === false) {
                // The choice persisted (it takes effect on the next boot too),
                // but the live spawn failed — report it, don't pretend.
                sendJson(res, 502, { code: 'spawn-failed', ...result, note: 'the choice was persisted; the process will start at the next host boot' })
                return
              }
              sendJson(res, 200, await snapshotOf(aekHome, supervisor))
            } else if (op === 'remove') {
              const stopped = await supervisor.stop(capability)
              const persisted = writeRuntimeMode(aekHome, capability, 'share')
              if (!stopped.ok || !persisted.ok) {
                sendJson(res, 502, { code: 'remove-failed', stop: stopped, persist: persisted })
                return
              }
              sendJson(res, 200, await snapshotOf(aekHome, supervisor))
            } else if (op === 'rename') {
              const label = typeof body.label === 'string' ? body.label : ''
              const result = writeRuntimeLabel(aekHome, capability, label)
              if (!result.ok) {
                sendJson(res, 400, { code: 'bad-request', ...result })
                return
              }
              sendJson(res, 200, await snapshotOf(aekHome, supervisor))
            } else {
              sendJson(res, 400, { code: 'bad-request', message: `unknown op '${op}' — try: add, remove, rename` })
            }
          } catch {
            sendJson(res, 502, { code: 'runtimes-failed', message: 'the runtime state is unreadable' })
          }
        },
      }),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, 'coraek: runtime api routes')
}
