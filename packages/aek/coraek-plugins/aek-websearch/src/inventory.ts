/**
 * Host half of the AEK console "About" page.
 *
 * Lives next to the other AEK console host routes (`admin.ts`) because that
 * plugin already owns the `webServer` seam and its tsdown entry bundles TS
 * sources directly. aek-home's own host entry is a tsc EMIT artifact
 * (`lib/types/index.js`), so adding a relative TS import there would not
 * survive the bundle — this is why the inventory route is registered here.
 *
 * The page must show REAL facts: every `@cheezmil/*` package actually present,
 * its version from its own `package.json`, and whether this install is a dev
 * checkout (`link:` into a workspace) or an npm install (`node_modules`).
 * Everything is resolved at request time; no absolute path is hard-coded.
 *
 * Route: `GET /api/aek/inventory`.
 *
 * @module aek-websearch/inventory
 */
import type { Context } from '@cheezmil/coraek/types'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The route the About page reads. */
export const INVENTORY_API_PATH = '/api/aek/inventory'

/** Only packages in AEK's own npm scope are reported. */
const AEK_SCOPE = '@cheezmil/'

/** Directories that never carry a source `package.json`. */
const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', 'types', 'tests', '.git'])

/** The narrow `webServer` seam used to register one exact route. */
interface WebServerSeam {
  /** Register one named route; returns its disposer. */
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** The narrow Loader seam used to mark which packages are actually registered. */
interface LoaderSeam {
  /** Iterate the current Loader entries. */
  entries(): Iterable<{ options?: { name?: string } }>
}

/** How a package reached this machine. */
export type InstallKind = 'dev' | 'npm'

/** One package row on the About page. */
export interface InventoryPackage {
  /** Package id. */
  name: string
  /** Version read from that package's own manifest. */
  version: string
  /** Whether this copy is a dev checkout or an npm install. */
  kind: InstallKind
  /** Whether the running web profile registered this package. */
  active: boolean
}

/** The snapshot the About page renders. */
export interface InventorySnapshot {
  /** Overall install kind, derived from aek-home's own resolved location. */
  installKind: InstallKind
  /** Short human-readable explanation of how the kind was determined. */
  source: string
  /** All discovered AEK packages, sorted by name. */
  packages: InventoryPackage[]
}

/** @param file - manifest path. @returns its name/version, or undefined. */
function manifestOf(file: string): { name?: string; version?: string } | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown
    if (typeof parsed !== 'object' || parsed === null) return undefined
    return parsed as { name?: string; version?: string }
  } catch {
    return undefined
  }
}

/**
 * A `link:` into a workspace resolves to the checkout (no `node_modules`
 * segment); a registry install always resolves under `node_modules`.
 * @param path - a resolved package directory.
 * @returns the install kind.
 */
function installKindOf(path: string): InstallKind {
  try {
    return realpathSync(path).split(sep).includes('node_modules') ? 'npm' : 'dev'
  } catch {
    return 'npm'
  }
}

/**
 * Find the dev checkout root by walking up from aek-home's own location.
 * A plain `pnpm-workspace.yaml` is not enough (user profiles have one too),
 * so the root must also own `packages/aek/`.
 * @param start - directory to start from.
 * @returns the workspace root, or undefined for an npm-only install.
 */
function findWorkspaceRoot(start: string): string | undefined {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) && existsSync(join(dir, 'packages', 'aek'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * Read every AEK package manifest inside the checkout's `packages/aek/` tree.
 * @param root - workspace root.
 * @param sink - accumulator, keyed by package name.
 */
function collectFromWorkspace(root: string, sink: Map<string, InventoryPackage>): void {
  const walk = (dir: string): void => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name === 'package.json') {
        const meta = manifestOf(full)
        if (meta?.name?.startsWith(AEK_SCOPE) === true && meta.version !== undefined) {
          sink.set(meta.name, { name: meta.name, version: meta.version, kind: 'dev', active: false })
        }
      }
    }
  }
  walk(join(root, 'packages', 'aek'))
}

/**
 * Read one `node_modules/@cheezmil/` scope directory (handles symlinked
 * `link:` packages as well as real registry installs).
 * @param scopeDir - the scope directory.
 * @param sink - accumulator, keyed by package name.
 */
function collectFromScope(scopeDir: string, sink: Map<string, InventoryPackage>): void {
  let entries
  try { entries = readdirSync(scopeDir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const dir = join(scopeDir, entry.name)
    const meta = manifestOf(join(dir, 'package.json'))
    if (meta === undefined || meta.version === undefined) continue
    const name = meta.name ?? `${AEK_SCOPE}${entry.name}`
    if (!name.startsWith(AEK_SCOPE) || sink.has(name)) continue
    sink.set(name, {
      name,
      version: meta.version,
      kind: installKindOf(dir),
      active: false,
    })
  }
}

/**
 * All scope directories worth scanning: every `node_modules/@cheezmil` above
 * this file, plus every profile under the user's AEK home.
 * @param selfDir - directory containing this module.
 * @returns candidate scope directories.
 */
function scopeDirs(selfDir: string): string[] {
  const found = new Set<string>()
  let dir = selfDir
  for (let i = 0; i < 12; i++) {
    found.add(join(dir, 'node_modules', '@cheezmil'))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const profiles = join(homedir(), '.aek', 'profiles')
  try {
    for (const entry of readdirSync(profiles, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        found.add(join(profiles, entry.name, 'node_modules', '@cheezmil'))
      }
    }
  } catch {
    // No AEK home yet: the upward scan is still enough.
  }
  return [...found]
}

/**
 * Package names the running profile actually registered. Loader entries may
 * carry a subpath (`@cheezmil/aek-websearch/admin`), so only the first two
 * segments are compared.
 * @param ctx - plugin context.
 * @returns the active package names.
 */
function activePackageNames(ctx: Context): Set<string> {
  const names = new Set<string>()
  try {
    const loader = (ctx as unknown as { loader?: LoaderSeam }).loader
    if (loader === undefined) return names
    for (const entry of loader.entries()) {
      const module = entry.options?.name
      if (typeof module !== 'string' || !module.startsWith(AEK_SCOPE)) continue
      const parts = module.split('/')
      if (parts[1] !== undefined) names.add(`${parts[0]}/${parts[1]}`)
    }
  } catch {
    // Loader shape differs across hosts; version rows remain truthful.
  }
  return names
}

/**
 * Build the About-page snapshot from the filesystem and the live Loader.
 * @param ctx - plugin context.
 * @returns the inventory snapshot.
 */
export function readInventory(ctx: Context): InventorySnapshot {
  const selfDir = dirname(fileURLToPath(import.meta.url))
  const installKind = installKindOf(selfDir)
  const sink = new Map<string, InventoryPackage>()
  const root = findWorkspaceRoot(selfDir)
  if (root !== undefined) collectFromWorkspace(root, sink)
  for (const dir of scopeDirs(selfDir)) collectFromScope(dir, sink)
  const active = activePackageNames(ctx)
  const packages = [...sink.values()]
    .map(entry => ({ ...entry, active: active.has(entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    installKind,
    source: installKind === 'dev' ? 'workspace checkout (link:)' : 'installed package (node_modules)',
    packages,
  }
}

/**
 * Register the inventory route on the composition's web server.
 * @param ctx - plugin context (typed via @cheezmil/coraek/types).
 */
export function registerInventory(ctx: Context): void {
  const server = (ctx as unknown as { webServer?: WebServerSeam }).webServer
  if (server === undefined) return
  ctx.effect(() => server.register({
    kind: 'exact',
    path: INVENTORY_API_PATH,
    handler: (_req, res) => {
      const payload = JSON.stringify(readInventory(ctx))
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(payload)
    },
  }), 'aek-home: inventory API')
}
