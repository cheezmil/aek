/**
 * Host API for the open-source icon-set catalog (V6 round: 图标大全).
 *
 * The webui's icon manager renders a framework registry (the in-process
 * `Icons.tsx` icons) plus curated open-source sets that the
 * `scripts/aek/gen-icon-sets.mjs` generator vendored into the
 * aek-icon-manager plugin's data directory (GitHub tarballs via the `gh`
 * CLI — no icon web services). This module serves that data to the console
 * over the same origin, so the dist never carries multi-megabyte icon
 * catalogs:
 *   - `GET /api/aek/icons/sets`        the manifest (set names, counts,
 *                                      licenses, usage templates)
 *   - `GET /api/aek/icons/set/<set>`   one set's full icon JSON
 *
 * Both answers are `200` with a `{ code: 'no-data' }` body rather than 404
 * when the generator has never run: the panel then shows the framework
 * section only and a one-line hint, which is the intended state, not an
 * error. Unknown set names answer `404`.
 *
 * This module is node-builtin-free on purpose: coraek's main tsconfig is a
 * CLIENT shape (no ambient `node` types), so the file I/O lives in
 * `icon-sets.mjs` (the zero-dep package-root module, same split as
 * `runtime-api.ts` + `runtimes.mjs`).
 *
 * @module @cheezmil/coraek/icon-sets-api
 */

import type { Context } from '@deepseek-ai/cordis'
import { readIconSetFile, resolveIconSetsDir } from '../icon-sets.mjs'

/** Prefix of the routes owned by this module. */
export const ICON_SETS_API_PATH = '/api/aek/icons'

/**
 * A narrow structural spelling of the response the seam passes to a handler
 * (same convention as `ai-release-api.ts`).
 */
interface SeamResponse {
  statusCode: number
  setHeader(key: string, value: string): void
  end(payload?: string): void
}

/** A narrow structural spelling of the request the seam passes to a handler. */
interface SeamRequest {
  readonly method?: string
  readonly url?: string
  [Symbol.asyncIterator](): AsyncIterator<unknown, void, unknown>
}

/**
 * The narrow `webServer` seam, spelled locally (same convention as
 * `ai-release-api.ts`).
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
 * Register the icon-set catalog routes on the current host.
 * @param ctx - the coraek plugin context.
 * @param options - injection seam; tests may point the store at a fixture dir.
 */
export function registerIconSetsApi(ctx: Context, options: { dataDir?: string } = {}): void {
  const server = serverOf(ctx)
  if (server === undefined) return

  const dataDir = options.dataDir ?? resolveIconSetsDir()

  const json = (res: SeamResponse, status: number, body: unknown): void => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(body))
  }

  ctx.effect(() => {
    const unsubscribe = server.register({
      kind: 'prefix',
      path: ICON_SETS_API_PATH,
      handler: (req, res) => {
        if (req.method !== 'GET') {
          json(res, 405, { code: 'method-not-allowed', message: 'GET only' })
          return
        }
        const url = new URL(req.url ?? '', 'http://localhost')
        // The prefix handler receives the full path: strip the prefix, then
        // `['sets']` = the manifest, `['set', <prefix>]` = one set.
        const under = url.pathname
          .slice(ICON_SETS_API_PATH.length)
          .split('/')
          .filter(segment => segment.length > 0)
        if (under.length === 1 && under[0] === 'sets') {
          const manifest = readIconSetFile(dataDir, 'manifest.json')
          if (manifest === undefined) {
            json(res, 200, { code: 'no-data', protocol: 'aek-icon-sets/1', sets: [] })
            return
          }
          json(res, 200, JSON.parse(manifest))
          return
        }
        if (under.length === 2 && under[0] === 'set') {
          const body = readIconSetFile(dataDir, `${under[1]}.json`)
          if (body === undefined) {
            json(res, 404, { code: 'unknown-set', set: under[1] })
            return
          }
          // The file content is already serialized JSON: end it verbatim.
          // Re-stringifying it (json()) double-encodes and the console's
          // response.json() yields a string, not the catalog object.
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(body)
          return
        }
        json(res, 404, { code: 'not-found', path: url.pathname })
      },
    })
    return () => { unsubscribe() }
  }, 'coraek: icon-set catalog routes')
}
