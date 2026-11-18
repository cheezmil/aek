/**
 * Host API for the AI AUTO-RELEASE SWITCH (S7, 2026-11-15) + the AUTO-CLOSE
 * NEXT switch (S9, 2026-11-18).
 *
 * The operator can pre-authorize the AI agent to merge a finished dev tree
 * build into the stable tree and run it (`release.mjs --yes`, which
 * interrupts the live stable instance). The authorizations themselves are a
 * persisted file read directly by scripts and the AI agent (`<AEK_HOME>/
 * ai-release.json`, see `ai-release.mjs`); this route only serves the
 * console's switches:
 *   - `GET  /api/aek/ai-release`  `{ protocol, allowed, autoCloseNext }`
 *     (per-key defaults when the file is missing / corrupt:
 *     `allowed: false`, `autoCloseNext: true`);
 *   - `POST /api/aek/ai-release`  body `{ allowed?, autoCloseNext?,
 *     confirm: true }` — at least one switch plus the confirm flag; a
 *     mutation without `confirm: true` answers 428, mirroring the
 *     console's write-confirm rule (capabilities/stop, /api/aek/runtimes).
 *     The patch merges over the stored document (untouched keys keep their
 *     stored value, absent keys keep their defaults).
 *
 * This module is node-builtin-free on purpose: coraek's main tsconfig is a
 * CLIENT shape (no ambient `node` types), so the file I/O lives in
 * `ai-release.mjs` (the zero-dep package-root module, same split as
 * `runtime-api.ts` + `runtimes.mjs`).
 *
 * @module @cheezmil/coraek/ai-release-api
 */

import type { Context } from '@deepseek-ai/cordis'
import { readAiRelease, writeAiRelease } from '../ai-release.mjs'
import type { AiReleasePatch } from '../ai-release.mjs'
import { resolveAekHome } from '../home.mjs'

/** Routes owned by this module. */
export const AI_RELEASE_API_PATH = '/api/aek/ai-release'

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
 * `runtime-api.ts` and `capability-api.ts`).
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
 * Register the auto-release switch route on the current host.
 * @param ctx - the coraek plugin context.
 * @param options - injection seam; tests may point the store at a temp home.
 */
export function registerAiReleaseApi(ctx: Context, options: { aekHome?: string } = {}): void {
  const server = serverOf(ctx)
  if (server === undefined) return

  const aekHome = options.aekHome ?? resolveAekHome()
  ctx.effect(() => {
    const unsubscribers = [
      server.register({
        kind: 'exact',
        path: AI_RELEASE_API_PATH,
        handler: async (req, res) => {
          if (req.method === 'GET') {
            sendJson(res, 200, { protocol: 'aek-ai-release/2', ...readAiRelease(aekHome) })
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { code: 'method-not-allowed', message: 'GET or POST' })
            res.setHeader('allow', 'GET, POST')
            return
          }
          const body = await readJsonBody(req)
          if (body === undefined) {
            sendJson(res, 400, {
              code: 'bad-request',
              message: 'body { allowed?, autoCloseNext?, confirm: true } is required',
            })
            return
          }
          if (body.confirm !== true) {
            sendJson(res, 428, {
              code: 'confirm-required',
              message: 'pass { allowed?, autoCloseNext?, confirm: true }',
            })
            return
          }
          // A partial patch: at least one switch, and every carried switch a
          // boolean. Untouched keys are preserved by the merge in writeAiRelease.
          const hasAllowed = 'allowed' in body
          const hasAutoCloseNext = 'autoCloseNext' in body
          if (!hasAllowed && !hasAutoCloseNext) {
            sendJson(res, 400, {
              code: 'no-switch',
              message: 'pass at least one of: allowed, autoCloseNext',
            })
            return
          }
          if (hasAllowed && typeof body.allowed !== 'boolean') {
            sendJson(res, 400, { code: 'invalid-allowed', message: 'allowed must be a boolean' })
            return
          }
          if (hasAutoCloseNext && typeof body.autoCloseNext !== 'boolean') {
            sendJson(res, 400, { code: 'invalid-autoCloseNext', message: 'autoCloseNext must be a boolean' })
            return
          }
          const patch: AiReleasePatch = {}
          if (hasAllowed) patch.allowed = body.allowed as boolean
          if (hasAutoCloseNext) patch.autoCloseNext = body.autoCloseNext as boolean
          const result = writeAiRelease(aekHome, patch)
          if (!result.ok) {
            sendJson(res, 500, { code: 'persist-failed', problems: result.problems })
            return
          }
          const after = readAiRelease(aekHome)
          sendJson(res, 200, {
            protocol: 'aek-ai-release/2',
            allowed: after.allowed,
            autoCloseNext: after.autoCloseNext,
          })
        },
      }),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, 'coraek: ai-release switch routes')
}
