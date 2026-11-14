/**
 * Host half of the AEK console "About" page.
 *
 * Lives next to the other AEK console host routes (`admin.ts`) because that
 * plugin already owns the `webServer` seam and its tsdown entry bundles TS
 * sources directly. The console surface is the static `@cheezmil/aek-web`
 * app (no host entry), so the inventory route is registered here.
 *
 * The page shows REAL facts: the version of every displayed `@cheezmil/*`
 * package (read from its own manifest at request time) and whether this
 * install is a dev checkout (`link:` into a workspace) or an npm install.
 * No absolute path and no version number is hard-coded.
 *
 * Packages are split into two groups by their role, not by a runtime
 * "installed / registered" state: AEK plugins and the base environment.
 * Support libraries and optional adapters that the AEK console profile does
 * not install by default are excluded from the list entirely.
 *
 * Route: `GET /api/aek/inventory`.
 *
 * @module aek-websearch/inventory
 */
import type { Context } from '@cheezmil/coraek/types'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { aekHomePath } from '@cheezmil/coraek/home'
import { fileURLToPath } from 'node:url'

/** The route the About page reads. */
export const INVENTORY_API_PATH = '/api/aek/inventory'

/** Only packages in AEK's own npm scope are reported. */
const AEK_SCOPE = '@cheezmil/'

/** Directories that never carry a source `package.json`. */
const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', 'types', 'tests', '.git'])

/**
 * Packages that must not appear in the console list:
 * - `prevent-agent-directly-seeing-key` is a support library, neither an
 *   AEK plugin nor part of the base environment.
 * - `aek-for-dsh` is an optional dsh-facing adapter. The AEK console profile
 *   installs `dsh-base`, `dsh-web-app` and `coraek-profile` only, so listing
 *   it would imply a default install that does not exist.
 */
const HIDDEN_PACKAGES = new Set([
  `${AEK_SCOPE}prevent-agent-directly-seeing-key`,
  `${AEK_SCOPE}aek-for-dsh`,
])

/** The base runtime / assembly layer, shown separately from AEK plugins. */
const BASE_PACKAGES = new Set([
  `${AEK_SCOPE}coraek`,
  `${AEK_SCOPE}coraek-profile`,
])

/** The narrow `webServer` seam used to register one exact route. */
interface WebServerSeam {
  /** Register one named route; returns its disposer. */
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Which section of the About page a package belongs to. */
export type InventoryGroup = 'plugin' | 'base'

/**
 * How this install reached the machine (S round: three honest modes, one
 * per user-visible row on the About page):
 * - `dev`    — local dev mode: the main source checkout (main worktree).
 * - `build`  — local build mode: a locally built / pinned install (the
 *              stable worktree, a release layout, or the packaged asar).
 * - `global` — `pnpm add -g` mode: a package-manager install under
 *              `node_modules` (global prefix or a user project).
 */
export type InstallKind = 'dev' | 'build' | 'global'

/** One package row on the About page. */
export interface InventoryPackage {
  /** Package id. */
  name: string
  /** Version read from that package's own manifest. */
  version: string
  /** Whether this copy is a dev checkout or an npm install. */
  kind: InstallKind
  /** AEK plugin or base environment. */
  group: InventoryGroup
}

/** The snapshot the About page renders. */
export interface InventorySnapshot {
  /** Overall install kind, derived from this package's own resolved location. */
  installKind: InstallKind
  /** Short human-readable explanation of how the kind was determined. */
  source: string
  /** Displayed AEK packages, sorted by name. */
  packages: InventoryPackage[]
}

/**
 * Classify one package. Unknown `@cheezmil/*` packages are left out rather
 * than shown under a meaningless "installed" status.
 * @param name - package id.
 * @returns its section, or undefined when the package must stay hidden.
 */
function groupOf(name: string): InventoryGroup | undefined {
  if (HIDDEN_PACKAGES.has(name)) return undefined
  if (BASE_PACKAGES.has(name)) return 'base'
  if (name.startsWith(`${AEK_SCOPE}aek-`)) return 'plugin'
  return undefined
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
 * A package-manager install (pnpm / npm, including `pnpm add -g`) resolves
 * under a `node_modules` segment. Anything else is a source checkout: the
 * workspace root owns a `.git` entry that distinguishes the main worktree
 * (a DIRECTORY — local dev mode) from a linked worktree (a FILE — the pinned
 * stable tree, i.e. a local build). A copy with no workspace root at all
 * (release layout / asar) is also a local build.
 * @param path - a package directory or file path.
 * @returns the install kind.
 */
function installKindOf(path: string): InstallKind {
  let resolved = path
  try {
    resolved = realpathSync(path)
  } catch { /* keep the literal path */ }
  if (resolved.split(sep).includes('node_modules')) return 'global'
  const root = findWorkspaceRoot(resolved)
  if (root !== undefined) {
    try {
      return statSync(join(root, '.git')).isDirectory() ? 'dev' : 'build'
    } catch {
      return 'build'
    }
  }
  return 'build'
}

/**
 * Find the dev checkout root by walking up from this package's own location.
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
 * Read every displayable AEK package manifest inside the checkout's
 * `packages/aek/` tree.
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
        if (meta?.name === undefined || meta.version === undefined) continue
        const group = groupOf(meta.name)
        if (group === undefined) continue
        sink.set(meta.name, { name: meta.name, version: meta.version, kind: installKindOf(dirname(full)), group })
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
    const group = groupOf(name)
    if (group === undefined || sink.has(name)) continue
    sink.set(name, { name, version: meta.version, kind: installKindOf(dir), group })
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
  const profiles = aekHomePath('profiles')
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
 * Build the About-page snapshot from the filesystem. There is deliberately no
 * "installed / registered" flag: the list is grouped by role instead.
 * @param _ctx - plugin context, kept for the registration seam.
 * @returns the inventory snapshot.
 */
export function readInventory(_ctx: Context): InventorySnapshot {
  const selfDir = dirname(fileURLToPath(import.meta.url))
  const installKind = installKindOf(selfDir)
  const sink = new Map<string, InventoryPackage>()
  const root = findWorkspaceRoot(selfDir)
  if (root !== undefined) collectFromWorkspace(root, sink)
  for (const dir of scopeDirs(selfDir)) collectFromScope(dir, sink)
  const packages = [...sink.values()]
    .filter(entry => groupOf(entry.name) !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    installKind,
    source: sourceOfInstallKind(installKind),
    packages,
  }
}

/** The short host-rendered explanation per install mode (S round). */
function sourceOfInstallKind(kind: InstallKind): string {
  switch (kind) {
    case 'dev':
      return 'local dev mode: running from the main source checkout'
    case 'build':
      return 'local build mode: running from a built / pinned install'
    case 'global':
      return 'pnpm add -g mode: installed into node_modules'
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
  }), 'aek-websearch: inventory API')
}
