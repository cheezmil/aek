/**
 * @cheezmil/aek-ui-gallery — host face of the shadcn/ui component gallery.
 *
 * A cordis function plugin that mounts ONLY where the `webServer` seam
 * exists (the AEK web profile; headless compositions never inject it).
 * `apply` registers a single PREFIX route — `UI_GALLERY_PATH`
 * (`/ui/ui-gallery`) — that serves the package-local built SPA from
 * `dist/` next to the compiled entry:
 *
 * - the SPA is built by this package's own toolchain (vite, `build`
 *   script, `base: './'`) and shipped through `files`; the host reads it
 *   per-request, the same model `frontend-static` uses for the aek-web
 *   dist (MIME table, traversal guard, SPA document fallback, 405
 *   non-GET);
 * - named prefix routes are matched BEFORE the webserver fallback seat,
 *   so the SPA never touches the aek-web dist and the two coexist;
 * - the SPA document is served at `/ui/ui-gallery/` (trailing slash) so
 *   its relative asset references resolve under the prefix; the bare
 *   path 302-redirects to the trailing-slash form.
 *
 * The ported tree under `src/web/` is byte-faithful from
 * shadcnspace/shadcnspace (MIT — see NOTICE + licenses/ in the package
 * root); this host face is AEK code.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

/** The package `name` (cordis plugin id) — the insert row in coraek-profile. */
export const name = 'aek-ui-gallery'

/**
 * The prefix this face owns on the host webserver. The aek-web console
 * embeds the SPA through `<iframe src="${UI_GALLERY_PATH}">`.
 */
export const UI_GALLERY_PATH = '/ui/ui-gallery'

/** Seams this plugin injects; `webServer` exists only in web compositions. */
export const inject = ['webServer'] as const

/**
 * The narrow seam this face consumes. It spells the host contract
 * locally instead of importing a host package (the aek-websearch admin
 * convention): `register` accepts named exact/prefix routes whose
 * handlers own the full response lifecycle and returns the disposer
 * that `ctx.effect` runs on plugin teardown.
 */
interface WebServerSeam {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

function webServerOf(ctx: Context): WebServerSeam {
  return (ctx as unknown as { webServer: WebServerSeam }).webServer
}

/**
 * Locate the package-local `dist/` root from the compiled entry: this
 * file ships as `<pkg>/lib/index.mjs`, the SPA as `<pkg>/dist/`. Two
 * levels up is the package root — nothing hardcoded.
 */
function distRootOf(): string {
  const here = fileURLToPath(import.meta.url)
  return resolve(here, '..', '..', 'dist')
}

const HTML_MIME = 'text/html; charset=utf-8'

const MIME: Record<string, string> = {
  '.html': HTML_MIME,
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

/**
 * Serve one request whose `req.url` is already stripped to the
 * prefix-relative path (bare `/` = the SPA document).
 * @param req - the incoming request.
 * @param res - the node:http response to write.
 * @param distRoot - absolute dist root directory.
 */
async function serveGallery(req: IncomingMessage, res: ServerResponse, distRoot: string): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }
  /* v8 ignore next -- node:http always sets url on server requests */
  const rawPath = new URL(req.url ?? '/', 'http://x').pathname
  const decodedPath = decodeURIComponent(rawPath)
  const candidate = resolve(normalize(join(distRoot, decodedPath)))
  // Traversal rejection: the target must be distRoot itself or stay under
  // it. `sep`, not '/': resolve() emits backslash paths on Windows.
  if (candidate !== distRoot && !candidate.startsWith(distRoot + sep)) {
    res.writeHead(403)
    res.end()
    return
  }
  const wantsDocument = (req.headers.accept ?? '').includes('text/html')
  const missing = candidate.startsWith(distRoot + sep) && !existsSync(candidate)
  if (decodedPath === '/' || decodedPath === '/index.html') {
    res.writeHead(200, { 'content-type': HTML_MIME, 'cache-control': 'no-cache' })
    res.end(await readFile(join(distRoot, 'index.html'), 'utf8'))
    return
  }
  if (wantsDocument && extname(decodedPath) === '' && missing) {
    // SPA document routing: a clean, absent path is the application
    // document. The SPA is state-driven (no deep links) so every such
    // path serves index.html.
    res.writeHead(200, { 'content-type': HTML_MIME, 'cache-control': 'no-cache' })
    res.end(await readFile(join(distRoot, 'index.html'), 'utf8'))
    return
  }
  if (missing) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': MIME[extname(candidate)] ?? 'application/octet-stream' })
  res.end(await readFile(candidate))
}

/** @returns the cordis plugin namespace behavior. */
export function apply(ctx: Context): void {
  const server = webServerOf(ctx)
  const distRoot = distRootOf()
  const prefix = UI_GALLERY_PATH
  ctx.effect(() => server.register({
    kind: 'prefix',
    path: prefix,
    handler: async (req, res) => {
      /* v8 ignore next -- node:http always sets url on server requests */
      const rawPath = new URL(req.url ?? '/', 'http://x').pathname
      if (rawPath === prefix) {
        // Redirect to the trailing-slash form so the SPA's relative
        // asset references (`base: './'`) resolve under the prefix.
        if (req.method === 'HEAD') {
          res.writeHead(302, { location: `${prefix}/` })
          res.end()
          return
        }
        res.writeHead(302, { location: `${prefix}/` })
        res.end()
        return
      }
      // Strip the prefix; the handler above owns the relative form.
      req.url = rawPath.slice(prefix.length) || '/'
      await serveGallery(req, res, distRoot)
    },
  }), 'aek-ui-gallery: component gallery SPA')
}
