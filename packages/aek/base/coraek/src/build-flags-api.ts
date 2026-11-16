/**
 * Host API for the BUILD-FLAG switch (BB round, 2026-11-16).
 *
 * The operator's build-time preferences (whether the aek-web console build
 * emits source maps) are a persisted file read directly by the build
 * scripts (`<AEK_HOME>/build-flags.json`, see `build-flags.mjs`); this route
 * only serves the console's switch:
 *   - `GET  /api/aek/build-flags`  `{ protocol, sourcemap }` (missing /
 *     corrupt file = the safe default `false`)
 *   - `POST /api/aek/build-flags`  body `{ sourcemap: boolean, confirm: true }`
 *     — a mutation without `confirm: true` answers 428, mirroring the
 *     console's write-confirm rule (capabilities/stop, /api/aek/runtimes,
 *     /api/aek/ai-release).
 *
 * The toggle affects the NEXT build (the build scripts export
 * `AEK_WEB_SOURCEMAP` from this file), never the running instance.
 *
 * This module is node-builtin-free on purpose: coraek's main tsconfig is a
 * CLIENT shape (no ambient `node` types), so the file I/O lives in
 * `build-flags.mjs` (the zero-dep package-root module, same split as
 * `ai-release-api.ts` + `ai-release.mjs`).
 *
 * @module @cheezmil/coraek/build-flags-api
 */

import type { Context } from '@deepseek-ai/cordis'
import { readBuildFlags, writeBuildFlags } from '../build-flags.mjs'
import { resolveAekHome } from '../home.mjs'

/** Routes owned by this module. */
export const BUILD_FLAGS_API_PATH = '/api/aek/build-flags'

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
 * Read the request body with a hard cap (the payload is one boolean; anything
 * bigger is a mistake, not data).
 * @param req - request.
 * @returns the parsed body, or undefined when malformed / oversized / empty.
 */
async function readJsonBody(req: SeamRequest): Promise<Record<string, unknown> | undefined> {
  const pieces: string[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const piece = typeof chunk === 'string' ? chunk : toUtf8(chunk)
      size += piece.length
      if (size > 4096) return undefined
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
 * `runtime-api.ts`, `capability-api.ts` and `ai-release-api.ts`).
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
 * Register the build-flags switch route on the current host.
 * @param ctx - the coraek plugin context.
 * @param options - injection seam; tests may point the store at a temp home.
 */
export function registerBuildFlagsApi(ctx: Context, options: { aekHome?: string } = {}): void {
  const server = serverOf(ctx)
  if (server === undefined) return

  const aekHome = options.aekHome ?? resolveAekHome()
  ctx.effect(() => {
    const unsubscribers = [
      server.register({
        kind: 'exact',
        path: BUILD_FLAGS_API_PATH,
        handler: async (req, res) => {
          if (req.method === 'GET') {
            sendJson(res, 200, { protocol: 'aek-build-flags/1', ...readBuildFlags(aekHome) })
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { code: 'method-not-allowed', message: 'GET or POST' })
            res.setHeader('allow', 'GET, POST')
            return
          }
          const body = await readJsonBody(req)
          if (body === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { sourcemap, confirm: true } is required' })
            return
          }
          if (body.confirm !== true) {
            sendJson(res, 428, { code: 'confirm-required', message: 'pass { sourcemap, confirm: true }' })
            return
          }
          if (typeof body.sourcemap !== 'boolean') {
            sendJson(res, 400, { code: 'invalid-sourcemap', message: 'sourcemap must be a boolean' })
            return
          }
          const result = writeBuildFlags(aekHome, body.sourcemap)
          if (!result.ok) {
            sendJson(res, 500, { code: 'persist-failed', problems: result.problems })
            return
          }
          sendJson(res, 200, { protocol: 'aek-build-flags/1', sourcemap: body.sourcemap })
        },
      }),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, 'coraek: build-flags switch routes')
}
