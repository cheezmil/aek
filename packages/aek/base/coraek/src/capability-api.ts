/**
 * Host API for EXTERNAL capability providers — the generic protocol layer's
 * user-visible face.
 *
 * Every line of this module is protocol-generic: it knows `aek-capability/1`
 * descriptors and the supervisor's state store, and NOTHING about any specific
 * upstream. Provider identity (name / version / spdx / source) arrives as
 * self-description and is rendered verbatim; the compliance template is fixed
 * here, which is the "form" that keeps the process boundary auditable.
 *
 * The module is node-builtin-free on purpose: coraek's main tsconfig is a
 * CLIENT shape (no ambient `node` types), so the host half spells its own
 * narrow local types for the webServer seam instead of importing `node:http`
 * (the same convention the aek-websearch console/admin routes use).
 *
 * Routes (registered on the `webServer` seam, unregistered on disposal):
 *   - `GET  /api/aek/capabilities`           registry + live state + compliance lines
 *   - `POST /api/aek/capabilities/stop`     body `{ id, confirm: true }`;
 *     without `confirm` the response is 428 (the console's write-confirm rule)
 *
 * The write surface is deliberately thin: the host NEVER installs or downloads
 * providers. `register` / `start` live in the operator CLI and scripts, where
 * a human confirms the action.
 *
 * @module @cheezmil/coraek/capability-api
 */

import type { Context } from '@deepseek-ai/cordis'
import { CapabilitySupervisor } from '../external-supervisor.mjs'
import { readRuntimeModes, isStrongCopyleft } from '../runtime.mjs'
import { resolveAekHome } from '../home.mjs'

/** Routes owned by this module. */
export const CAPABILITIES_API_PATH = '/api/aek/capabilities'
export const CAPABILITIES_STOP_API_PATH = '/api/aek/capabilities/stop'

/**
 * A narrow structural spelling of the response the seam passes to a handler.
 * It is deliberately independent of `node:http` so this module type-checks
 * under coraek's client-shaped tsconfig; at runtime the real `ServerResponse`
 * satisfies it.
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
 * Read the request body with a hard cap (a descriptor payload is small;
 * anything bigger is a mistake, not data). Chunks arrive as `string` (tests)
 * or byte buffers (node); both are coerced to UTF-8 without a `Buffer` import.
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
 * Coerce a byte-buffer chunk (the shape node streams yield) to UTF-8 text
 * without importing `Buffer`.
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
 * `aek-websearch`'s console and inventory routes).
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
 * Register the capability API on the current host.
 *
 * One supervisor per composition root owns the spawned children (shared
 * state lives on the instance, and on the state store on disk). Disposing
 * the effects signals every child we spawned so no orphan survives a host
 * shutdown (the last line of defense; graceful stops are `stop(id)`).
 *
 * @param ctx - the coraek plugin context.
 * @param options - injection seam; a test may supply its own supervisor bound
 *   to a throwaway home, and/or an explicit `aekHome` for the runtime-mode
 *   store. Production callers pass nothing and get the defaults (which resolve
 *   the real AEK home).
 */
export function registerCapabilityApi(
  ctx: Context,
  options: { supervisor?: CapabilitySupervisor; aekHome?: string } = {},
): void {
  const server = serverOf(ctx)
  if (server === undefined) return

  const supervisor = options.supervisor ?? new CapabilitySupervisor()
  const aekHome = options.aekHome ?? resolveAekHome()
  ctx.effect(() => () => supervisor.stopAllNow(), 'coraek: capability supervisor shutdown')
  ctx.effect(() => {
    const unsubscribers = [
      server.register({
        kind: 'exact',
        path: CAPABILITIES_API_PATH,
        handler: async (_req, res) => {
          try {
            const providers = await supervisor.statusAll()
            const choices = readRuntimeModes(aekHome)
            sendJson(res, 200, {
              protocol: 'aek-capability/1',
              runtime: {
                // The selective class-① choices (id → 'share' | 'isolate').
                // Class ②/③ are isolate-only and never appear here.
                defaultMode: 'share',
                choices,
              },
              providers: providers.map(row => ({
                id: row.id,
                state: row.state,
                pid: row.pid ?? null,
                startedBy: row.startedBy ?? null,
                pin: row.pin ?? null,
                installPolicy: row.installPolicy ?? null,
                name: row.declared.name,
                version: row.declared.version,
                spdx: row.declared.spdx ?? null,
                source: row.declared.source ?? null,
                attach: row.declared.attach,
                // Registered providers are always out-of-process (classes ②/③).
                runtime: {
                  mode: 'isolate',
                  reason: isStrongCopyleft(row.declared.spdx) ? 'license-forced' : 'runtime-forced',
                },
                compliance: CapabilitySupervisor.complianceLine(row),
              })),
            })
          } catch {
            sendJson(res, 502, { code: 'supervisor-failed', message: 'the capability state store is unreadable' })
          }
        },
      }),
      server.register({
        kind: 'exact',
        path: CAPABILITIES_STOP_API_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { code: 'method-not-allowed', message: 'POST only' })
            return
          }
          const body = await readJsonBody(req)
          if (body === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { id, confirm: true } is required' })
            return
          }
          const id = typeof body.id === 'string' ? body.id : undefined
          if (id === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { id, confirm: true } is required' })
            return
          }
          if (body.confirm !== true) {
            // The console's write-confirm rule: mutating without explicit
            // confirmation is a 428, mirroring the plugin-console route.
            sendJson(res, 428, {
              code: 'confirm-required',
              message: 'stopping a provider is a write operation: resend with confirm: true',
            })
            return
          }
          const result = await supervisor.stop(id)
          sendJson(res, result.ok ? 200 : 502, result)
        },
      }),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, 'coraek: capability api routes')
}
