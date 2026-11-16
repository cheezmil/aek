/**
 * Host facts for the AEK console's management surfaces (2026-11-09 round).
 *
 * The console must never hardcode a repository path, a plugin roster, a port
 * or a platform-specific permission hint. Every such fact is resolved HERE on
 * the host at request time and served as JSON:
 *
 * - `GET  /api/aek/console/facts`   → platform, app entries, plugin roster,
 *   slot endpoints, skill path, permission guidance (ALL read-only)
 * - `GET  /api/aek/permissions`     → the permission snapshot for this slot
 * - `POST /api/aek/permissions/open` → open the OS privacy settings pane
 *   (an explicit, user-initiated action; nothing is granted automatically)
 *
 * Paths are derived from `import.meta.url` (walk up to `pnpm-workspace.yaml`)
 * and from `@cheezmil/coraek/home`. No absolute path literal is embedded in the
 * source — the project ships to machines with a different home.
 *
 * @module aek-websearch/console
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@cheezmil/coraek/types'
import { resolveAekHome } from '@cheezmil/coraek/home'
import { SLOT_NAMES, slotConfig, slotHome, webUrl, resolveSlot } from '@cheezmil/coraek/slots'
import { readPluginMeta, scanLanguages, pluginClassOf } from '@cheezmil/coraek/plugin-meta'
import { CapabilitySupervisor } from '@cheezmil/coraek/external-supervisor'
import { discoverAekSiblingPackages, readRuntimeDocV2, startRuntimeGroup, stopRuntimeGroup } from '@cheezmil/coraek/runtime'
import { appendOp, updateOp } from '@cheezmil/coraek/ops'
import { ACCESS_API_PATH, accessGuard, accessView, writeAccess } from './access.ts'
import type { AccessUpdate } from './access.ts'

/** Routes owned by this module. */
export const CONSOLE_FACTS_API_PATH = '/api/aek/console/facts'
export const PERMISSIONS_API_PATH = '/api/aek/permissions'
export const PERMISSIONS_OPEN_API_PATH = '/api/aek/permissions/open'
export const PLUGIN_ACTION_API_PATH = '/api/aek/plugins/action'
export { ACCESS_API_PATH }

/** macOS deep link to the Accessibility privacy pane (verified with aekws). */
const ACCESSIBILITY_DEEP_LINK = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

/** The two product identities that must appear in the OS accessibility list. */
const BUNDLES = [
  { id: 'com.aek.desktop', name: 'AEK' },
  { id: 'com.aek.desktop.next', name: 'AEK Next' },
] as const

/** One scanned app entry (the three product entry points). */
export interface AppEntry {
  /** Directory name under `apps/`. */
  id: string
  /** Package name from its package.json, when present. */
  packageName: string
  /** Human description. */
  description: string
  /** Always true here: these directories ARE the entry points. */
  entry: true
  /** Version from its package.json, '' when the manifest declares none. */
  version: string
  /** Declared audience: A1 (public) / A2 (local only), '' when undeclared. */
  distribution: 'A1' | 'A2' | ''
  /** Detected implementation languages, most source files first. */
  languages: string[]
  /** Main implementation language. */
  primaryLanguage: string
  /**
   * Runtime memory fact for this entry (CC round 2026-11-17, basis +
   * attribution fixed in the DD round). The console NEVER invents numbers:
   * a measured reading ships only when a real process was read (`shell` =
   * the desktop app process tree — `footprintMb` is the summed PHYSICAL
   * FOOTPRINT on macOS, Activity Monitor's basis, not the inflated raw-RSS
   * sum; `in-host` = the webui is served by the shared host runtime0, no
   * own process; `transient` = the CLI runs and exits; `stopped` /
   * `unavailable` = the shell is not running or the platform cannot be
   * read). Absent on older hosts — the client renders nothing in that case.
   */
  memory?:
    | { kind: 'shell'; state: 'running' | 'stopped' | 'unavailable'; footprintMb?: number }
    | { kind: 'in-host' }
    | { kind: 'transient' }
}

/**
 * The source buckets of the user's disk layout (2026-11-15 T round):
 * `plugins` = the swappable coraek plugin set, `public` = publicly
 * distributed libraries, `base` = the coraek host identity layer,
 * `extensions` = the on-hold target-extension bundles.
 */
export type PluginBucket = 'plugins' | 'public' | 'base' | 'extensions'

/** One scanned AEK package and its capability tags. */
export interface PluginEntry {
  /** Directory name under the package's bucket. */
  id: string
  /** Package name from package.json. */
  packageName: string
  /** Version from package.json. */
  version: string
  /** Description from package.json. */
  description: string
  /** Capability tags derived from the manifest, never guessed. */
  capabilities: { backend: boolean; cli: boolean; mcp: boolean }
  /** Persisted enable flag (`<AEK_HOME>/plugins.json`), true by default. */
  enabled: boolean
  /**
   * True when the plugin cannot be switched off. The console must say so
   * instead of offering a control that would break the UI. B2: the console UI
   * is the static `@cheezmil/aek-web` app (served by the host, not a switchable
   * plugin), so no plugin is structural anymore — this is always false today.
   */
  locked: boolean
  /** Why it is locked: `root` meant "this plugin IS the console UI". */
  lockReason: '' | 'root'
  /**
   * Whether the enable switch is offered at all. Only cordis-loadable
   * packages (`aek.cordis: true`) are switchable; host-identity, library
   * and bundle rows are read-only facts in the roster.
   */
  switchable: boolean
  /**
   * The bucket this package lives in (the user's disk classification). An
   * explicit `aek.bucket` manifest field always wins; the flat install
   * layout has no directory position, so it falls back to `plugins` when
   * the manifest does not declare one.
   */
  bucket: PluginBucket
  /** Declared audience: A1 (public) / A2 (local only), empty when invalid. */
  distribution: 'A1' | 'A2' | ''
  /** Detected implementation languages, most source files first. */
  languages: string[]
  /** Main implementation language. */
  primaryLanguage: string
}

/** One slot's reachable endpoints. */
export interface SlotEndpoint {
  /** Slot id. */
  slot: string
  /** Product name shown in the Dock / Finder. */
  productName: string
  /** Browser-facing base URL. */
  url: string
  /** Web backend port. */
  webPort: number
  /** CDP / desktop shell debugging port. */
  cdpPort: number
  /** Bundle identity. */
  bundleId: string
}

/** The complete read-only fact snapshot. */
export interface ConsoleFacts {
  /** Node platform id. */
  platform: string
  /** CPU architecture. */
  arch: string
  /**
   * The host user's home directory (`os.homedir()`), so the client can render
   * paths in its chosen display style (`~/…` vs `%USERPROFILE%\…` vs full).
   */
  home: string
  /** The three entry-point apps. */
  entries: AppEntry[]
  /** Everything under the AEK package tree, bucket-classified (T round). */
  plugins: PluginEntry[]
  /** Absolute path of the scanned package tree root, resolved on the host (copyable). */
  pluginsDir: string
  /** Per-slot URLs and ports. */
  endpoints: SlotEndpoint[]
  /** A copyable absolute path to the notes skill, resolved at runtime. */
  skillPath: string
  /** OS permission guidance for the Permissions panel. */
  permissions: {
    /** Which permission the current OS needs for GUI automation. */
    kind: string
    /** Deep link to the relevant privacy pane, or empty on other OSes. */
    deepLink: string
    /** The two bundles that must show up in the accessibility list. */
    bundles: readonly { id: string; name: string }[]
    /** Human-facing explanation key (i18n key). */
    noteKey: string
  }
}

/**
 * Walk up from this module to the repository root.
 * @param start - directory containing this module.
 * @returns the repository root.
 */
function repoRoot(start: string): string {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}

const ROOT = repoRoot(dirname(fileURLToPath(import.meta.url)))

/**
 * Read one package.json defensively.
 * @param file - path to a package.json.
 * @returns a plain record, or an empty record when missing / malformed.
 */
function readManifest(file: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/**
 * List directories under a path, ignoring dotfiles and non-directories.
 * @param dir - directory to scan.
 * @returns child directory names in stable order.
 */
function childDirectories(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * CC round (2026-11-17): the desktop shell's whole footprint as ONE measured
 * number — or the honest reason why there is no number. DD round (same
 * night) fixed two things the user caught: the BASIS (summing raw `ps` RSS
 * double-counts the pages shared between the main process and its Chromium
 * helpers — 840 MB vs the app's true ~554 MB; now the macOS physical
 * FOOTPRINT, `top`'s mem column = Activity Monitor's basis) and the
 * attribution of the webui (runtime0 host-shared, not "no own process").
 *
 * The shell is NOT a host process: it is the user's `~/Applications/<app>`
 * install (or the slot's dev-variant bundle under the slot data root) whose
 * main process spawns Chromium helper processes. Every process whose
 * command line starts with one of those two bundle paths is summed.
 * The bundle paths are derived from the slot table + `homedir()`, never
 * from a machine-specific literal. Both tools are POSIX-only: on Windows
 * the state is `unavailable` (never a guessed zero), a shell that is not
 * running is `stopped`, and a failed / missing tool degrades through the
 * fallback chain instead of failing the whole facts request.
 * @param slot - the slot whose shell is being read (the host's own slot).
 * @returns the shell memory fact for `kind: 'shell'` entries.
 */
function shellMemoryOf(slot: 'aek' | 'next'): { state: 'running' | 'stopped' | 'unavailable'; footprintMb?: number } {
  const cfg = slotConfig(slot)
  const bundles = [
    join(homedir(), 'Applications', `${cfg.productName}.app`),
    join(slotHome(slot), 'dev', `${cfg.devAppName}.app`),
  ]
  if (process.platform === 'win32') return { state: 'unavailable' }
  // Step 1: the pids of every process whose command line starts with one of
  // the bundle paths (the main process + its helper processes, i.e. the
  // whole app process tree). The RSS column is kept as the FALLBACK
  // reading when the platform's finer tool is unavailable.
  let psOut: string
  try {
    psOut = execFileSync('ps', ['-axo', 'pid=,rss=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return { state: 'unavailable' }
  }
  const matchedRssKb = new Map<string, number>()
  let totalRssKb = 0
  for (const line of psOut.split('\n')) {
    const columns = line.trim().split(/\s+/)
    if (columns.length < 3) continue
    const pid = columns[0]
    const rssKb = Number(columns[1])
    if (pid === undefined || !Number.isFinite(rssKb) || rssKb <= 0) continue
    const command = columns.slice(2).join(' ')
    if (!bundles.some(bundle => command.startsWith(bundle))) continue
    matchedRssKb.set(pid, rssKb)
    totalRssKb += rssKb
  }
  if (matchedRssKb.size === 0) return { state: 'stopped' }
  const rssSumMb = Math.round((totalRssKb / 1024) * 10) / 10
  // Step 2: the HONEST number. On macOS sum the per-process PHYSICAL
  // FOOTPRINT (`top`'s mem column — Activity Monitor's basis, where pages
  // shared between the main process and its helpers are apportioned, not
  // double-counted). The CC round summed raw RSS and read ~840 MB for an
  // app whose footprint is ~554 MB — the user caught the inflated basis.
  // A failed `top` run degrades to the real (larger-basis) RSS sum, never
  // to an invented number.
  if (process.platform === 'darwin') {
    let topOut: string
    try {
      topOut = execFileSync('top', ['-l', '1', '-stats', 'pid,mem,command'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch {
      return { state: 'running', footprintMb: rssSumMb }
    }
    let totalMb = 0
    let any = false
    for (const line of topOut.split('\n')) {
      const columns = line.trim().split(/\s+/)
      if (columns.length < 2) continue
      const pid = columns[0]
      const raw = columns[1]
      if (pid === undefined || raw === undefined) continue
      if (!matchedRssKb.has(pid)) continue
      const mb = parseTopMemory(raw)
      if (mb === undefined) continue
      totalMb += mb
      any = true
    }
    if (!any) return { state: 'running', footprintMb: rssSumMb }
    return { state: 'running', footprintMb: Math.round(totalMb * 10) / 10 }
  }
  // Linux: no `top` mem column — the RSS sum is the reading.
  return { state: 'running', footprintMb: rssSumMb }
}

/** Parse one `top` memory column (`9249K` / `229M` / `1G` / bare MB). */
function parseTopMemory(raw: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)([KMG]?)$/u.exec(raw)
  if (match === null) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  const unit = match[2]
  if (unit === 'K') return value / 1024
  if (unit === 'G') return value * 1024
  return value
}

/**
 * Scan the product entry points. The set follows the CURRENT `apps/` layout:
 * S round renamed the console app directory from `web` to `aek-web` (B2), so
 * the entry is `aek-web` — a stale `web` directory is build residue, not an
 * entry point. `plugin-market-generator` is a dev tool, never a product entry.
 *
 * Manifest lookup: `apps/<id>/package.json` with a FALLBACK to
 * `apps/<id>/v0/package.json` — the Electron app keeps its versioned layout
 * (`aek-desktop` has only `v0/`), so without the fallback the row degrades to
 * the bare directory name with no version / description at all.
 *
 * AA round: the row carries the same "various info" as a plugin row —
 * version, audience class and languages — resolved by the SAME host-side
 * scans (`pluginClassOf` + `scanLanguages`) that feed the plugin roster, so
 * the 入口 section reads as informative as the 插件 section below it.
 * @returns the entry list.
 */
function scanEntries(): AppEntry[] {
  const base = join(ROOT, 'apps')
  return childDirectories(base)
    .filter(id => id === 'aek-web' || id === 'cli' || id === 'aek-desktop')
    .map((id) => {
      const appDir = join(base, id)
      const manifestDir = existsSync(join(appDir, 'package.json'))
        ? appDir
        : join(appDir, 'v0')
      const manifest = readManifest(join(manifestDir, 'package.json'))
      const cls = pluginClassOf(manifest)
      const languages = scanLanguages(manifestDir)
      // CC round: the runtime memory fact, resolved per entry identity.
      // DD round (basis/attribution fix): the desktop shell is the ONLY
      // measurable entry — its whole process tree (main + helpers) as a
      // physical footprint. The webui has no own runtime of its own: it is
      // served by the shared host runtime0 (like an in-host plugin), so it
      // ships `in-host`, not a fake "no process" claim. The CLI is
      // transient. Nothing here is ever invented: no process read → the
      // reason ships instead of a zero.
      const memory = id === 'aek-desktop'
        ? { kind: 'shell' as const, ...shellMemoryOf(resolveSlot()) }
        : id === 'aek-web'
          ? { kind: 'in-host' as const }
          : { kind: 'transient' as const }
      return {
        id,
        packageName: typeof manifest.name === 'string' ? manifest.name : id,
        description: typeof manifest.description === 'string' ? manifest.description : '',
        entry: true as const,
        version: typeof manifest.version === 'string' ? manifest.version : '',
        distribution: cls.ok ? (cls.value === 'A2' ? 'A2' : 'A1') : '',
        languages: languages.languages,
        primaryLanguage: languages.primary,
        memory,
      }
    })
}

/**
 * Derive capability tags from a plugin manifest. `bin` means a CLI exists,
 * an `mcp` field or `aek-mcp` package name means MCP, and a `dsh.client`
 * / `aek.server` marker means the plugin also has a backend surface.
 * @param manifest - parsed package.json.
 * @param id - directory name, used for name-based detection.
 * @returns the three tags.
 */
function capabilitiesOf(manifest: Record<string, unknown>, id: string): { backend: boolean; cli: boolean; mcp: boolean } {
  const aek = (manifest.aek ?? {}) as Record<string, unknown>
  const dsh = (manifest.dsh ?? {}) as Record<string, unknown>
  const name = typeof manifest.name === 'string' ? manifest.name : id
  return {
    backend: aek.server === true || dsh.client !== undefined || aek.host === true,
    cli: manifest.bin !== undefined || aek.cli === true,
    mcp: aek.mcp === true || name.includes('mcp'),
  }
}

/**
 * Plugins that can never be switched off, with the reason.
 *
 * B2: the console UI is the static `@cheezmil/aek-web` app the host serves
 * (not a switchable plugin), so there is no structural plugin to lock — the
 * map is empty. `aek-home` WAS the root UI plugin and was locked here; it is
 * gone (its client half moved into aek-web, host half was an identity no-op).
 *
 * `aek-websearch` used to be locked here as well, on the grounds that it serves
 * `/api/aek/console/facts` and this very switch endpoint. That conflated two
 * different faces of the package: the console routes are served by the
 * `aek-websearch-admin` entry, while the *search feature* is a separate face.
 * Disabling the plugin must switch off the feature — and it does, immediately:
 * `admin.ts` gates `/api/aek/websearch*` on `plugins.json` (503
 * `plugin-disabled`) and leaves every console route alive, so the switch can
 * always turn it back on. A lock there was a wrong answer to a real concern.
 */
const LOCKED_PLUGINS: Record<string, '' | 'root'> = {
}

/** @returns the persisted disabled plugin ids (`<AEK_HOME>/plugins.json`). */
function pluginsStateFile(): string {
  return join(resolveAekHome(), 'plugins.json')
}

/**
 * Read the disabled plugin ids. A missing or malformed file means "every
 * plugin enabled" — never a reason to fail the whole facts request.
 * @returns the id set.
 */
function readDisabledPlugins(): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(pluginsStateFile(), 'utf-8')) as unknown
    const list = (parsed as { disabled?: unknown }).disabled
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/**
 * Persist the disabled plugin ids.
 * @param ids - the full set to store.
 * @returns true when the write succeeded.
 */
function writeDisabledPlugins(ids: ReadonlySet<string>): boolean {
  const file = pluginsStateFile()
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify({ disabled: [...ids].sort() }, null, 2)}\n`, 'utf-8')
    return true
  } catch {
    return false
  }
}

/**
 * The bucket map for a top-level component of `packages/aek` (the user's
 * disk layout, 2026-11-15 T round). Unknown components fall back to the
 * `plugins` bucket.
 * @param name - the directory name directly under `packages/aek`.
 * @returns the bucket.
 */
function bucketForComponent(name: string): PluginBucket {
  switch (name) {
    case 'coraek-plugins':
      return 'plugins'
    case 'public':
      return 'public'
    case 'base':
      return 'base'
    case 'target-extensions':
      return 'extensions'
    default:
      return 'plugins'
  }
}

const PLUGIN_BUCKETS: readonly PluginBucket[] = ['plugins', 'public', 'base', 'extensions']

/**
 * The manifest-declared bucket, when present and valid (it always wins over
 * the directory-position derivation).
 * @param manifest - parsed package.json.
 * @returns the declared bucket, or undefined.
 */
function declaredBucket(manifest: Record<string, unknown>): PluginBucket | undefined {
  const aek = manifest.aek
  if (aek === null || typeof aek !== 'object') return undefined
  const value = (aek as Record<string, unknown>).bucket
  return typeof value === 'string' && PLUGIN_BUCKETS.includes(value as PluginBucket)
    ? value as PluginBucket
    : undefined
}

/**
 * List child directories INCLUDING symlinks (the install layout reaches the
 * workspace packages through `node_modules/@cheezmil` links), ignoring
 * dotfiles.
 * @param dir - directory to list.
 * @returns stable-sorted child names.
 */
function listDirectories(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(entry => (entry.isDirectory() || entry.isSymbolicLink()) && !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Collect every AEK package directory with its bucket (2026-11-15 T round:
 * the roster is NOT just the swappable plugin set — it is the whole package
 * tree, so the console stops presenting host-identity / library / bundle
 * rows as "coraek plugins").
 *
 * - DEV LAYOUT: walk `packages/aek/**` (depth 3, `node_modules` skipped),
 *   bucket = the top-level component (`coraek-plugins` → `plugins`,
 *   `public` → `public`, `base` → `base`, `target-extensions` →
 *   `extensions`).
 * - INSTALL LAYOUT (no checkout root): the `@cheezmil` scope dir two levels
 *   above this module — the coraek discovery convention — with the bucket
 *   read from the manifest (flat layout, no directory position).
 *
 * The S1 filter applies to every layout: a directory WITHOUT its own
 * `package.json` is build residue, never a roster row.
 *
 * @returns the roster of { dir, id, bucket, manifest }, sorted by id.
 */
function scanPackageDirs(): Array<{ dir: string; id: string; bucket: PluginBucket; manifest: Record<string, unknown> }> {
  const found = new Map<string, { dir: string; id: string; bucket: PluginBucket; manifest: Record<string, unknown> }>()
  const add = (dir: string, id: string, bucket: PluginBucket): void => {
    if (found.has(id)) return
    const manifestFile = join(dir, 'package.json')
    if (!existsSync(manifestFile)) return // the S1 residue filter
    const manifest = readManifest(manifestFile)
    found.set(id, { dir, id, bucket: declaredBucket(manifest) ?? bucket, manifest })
  }
  const walk = (dir: string, depth: number, bucket: PluginBucket): void => {
    for (const name of listDirectories(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const child = join(dir, name)
      add(child, name, bucket)
      if (depth < 3) {
        // At the tree root the child IS a bucket component; deeper, the
        // bucket context is inherited.
        walk(child, depth + 1, depth === 0 ? bucketForComponent(name) : bucket)
      }
    }
  }

  const devRoot = join(ROOT, 'packages', 'aek')
  if (existsSync(devRoot)) {
    walk(devRoot, 0, 'plugins')
  } else {
    const scopeDir = installScopeDir()
    for (const name of listDirectories(scopeDir)) {
      add(join(scopeDir, name), name, 'plugins')
    }
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * The `@cheezmil` scope dir two levels above this module's compiled
 * location (`lib/console.js` → up two), the install-layout fallback for
 * `scanPackageDirs` (the coraek discovery convention; no hardcoded paths).
 * @returns the absolute scope dir.
 */
function installScopeDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '@cheezmil')
}

/**
 * The scanned package-tree root (dev: `packages/aek`, install: the scope
 * dir) — a copyable absolute path for the About page.
 * @returns the root dir.
 */
function packageTreeRoot(): string {
  const devRoot = join(ROOT, 'packages', 'aek')
  return existsSync(devRoot) ? devRoot : installScopeDir()
}

/**
 * Scan the AEK package tree into roster rows. Every row carries its bucket
 * and whether the enable switch is offered at all: only cordis-loadable
 * packages (`aek.cordis: true`) are switchable — the host-identity, library
 * and bundle rows are read-only facts, never presented as swappable
 * "coraek plugins".
 * @returns the plugin roster.
 */
function scanPlugins(): PluginEntry[] {
  const disabled = readDisabledPlugins()
  // One bounded, cached scan (directory entries + file extensions only, no
  // source file is ever opened) supplies the audience class and languages for
  // the About page. See @cheezmil/coraek/plugin-meta.
  const metaByName = new Map(readPluginMeta(ROOT).map(meta => [meta.packageName, meta]))
  return scanPackageDirs().map(({ id, bucket, manifest }) => {
    const lockReason = LOCKED_PLUGINS[id] ?? ''
    const name = typeof manifest.name === 'string' ? manifest.name : id
    const aek = manifest.aek
    const meta = metaByName.get(name)
    return {
      id,
      packageName: name,
      version: typeof manifest.version === 'string' ? manifest.version : '',
      description: typeof manifest.description === 'string' ? manifest.description : '',
      capabilities: capabilitiesOf(manifest, id),
      // A locked plugin is always reported as enabled: its flag is meaningless.
      enabled: lockReason !== '' || !disabled.has(id),
      locked: lockReason !== '',
      lockReason,
      switchable: aek !== null && typeof aek === 'object' && (aek as Record<string, unknown>).cordis === true,
      bucket,
      distribution: meta?.distribution.ok ? (meta.distribution.value === 'A2' ? 'A2' : 'A1') : '',
      languages: meta?.languages.languages ?? [],
      primaryLanguage: meta?.languages.primary ?? 'unknown',
    }
  })
}

/**
 * Build the per-slot endpoint table from the single source of truth in coraek.
 * @returns the endpoint list.
 */
function endpoints(): SlotEndpoint[] {
  return SLOT_NAMES.map((slot) => {
    const cfg = slotConfig(slot)
    return {
      slot,
      productName: cfg.productName,
      url: webUrl(slot),
      webPort: cfg.webPort,
      cdpPort: cfg.cdpPort,
      bundleId: cfg.bundleId,
    }
  })
}

/**
 * Resolve the copyable skill path at runtime.
 *
 * The `aek-usage` system skill is seeded by `aek-skill-manager` into
 * `<AEK_HOME>/skill-manager/aek-system-skill/aek-usage`. There is deliberately
 * NO override setting and NO env override: the user asked for one fixed,
 * host-resolved path (2026-11-09 round), not another "add every setting" knob.
 * @returns an absolute path resolved at runtime.
 */
function skillPath(): string {
  // The user asked for the AEK slot's hub explicitly (not "whichever slot is
  // serving this page"), so Next's console shows the same absolute path.
  return join(slotHome('aek'), 'skill-manager', 'aek-system-skill', 'aek-usage')
}

/**
 * The permission snapshot written by the desktop main process. A missing file
 * is the normal first-run state, not an error.
 * @returns the parsed snapshot, or an empty record.
 */
function permissionSnapshot(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(join(resolveAekHome(), 'permissions.json'), 'utf-8')) as unknown
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/**
 * @returns the full read-only fact snapshot.
 */
export function readConsoleFacts(): ConsoleFacts {
  const isMac = process.platform === 'darwin'
  return {
    platform: process.platform,
    arch: process.arch,
    home: homedir(),
    entries: scanEntries(),
    plugins: scanPlugins(),
    pluginsDir: packageTreeRoot(),
    endpoints: endpoints(),
    skillPath: skillPath(),
    permissions: {
      kind: isMac ? 'accessibility' : (process.platform === 'win32' ? 'ui-automation' : 'none'),
      deepLink: isMac ? ACCESSIBILITY_DEEP_LINK : '',
      bundles: BUNDLES,
      noteKey: isMac ? 'permissions.note.mac' : 'permissions.note.other',
    },
  }
}

/**
 * Send one JSON response.
 * @param res - the response.
 * @param status - HTTP status.
 * @param body - JSON body.
 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * The narrow `webServer` seam, spelled locally (same convention as
 * `preferences.ts` and `inventory.ts`).
 * @param ctx - plugin context.
 * @returns the server seam, or undefined in a headless composition.
 */
function serverOf(ctx: Context): {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
  registerGuard?: (guard: (req: IncomingMessage, res: ServerResponse) => boolean) => () => void
} | undefined {
  return (ctx as unknown as {
    webServer?: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
      }): () => void
      registerGuard?: (guard: (req: IncomingMessage, res: ServerResponse) => boolean) => () => void
    }
  }).webServer
}

/**
 * Register the console fact + permission routes.
 * @param ctx - the plugin context.
 */
export function registerConsole(ctx: Context): void {
  const server = serverOf(ctx)
  if (server === undefined) return

  // The guard must sit in front of route dispatch, otherwise the SPA fallback
  // (and any non-AEK route) would bypass the LAN-only / Basic-Auth policy.
  if (server.registerGuard !== undefined) {
    ctx.effect(() => server.registerGuard?.(accessGuard) ?? (() => { /* no guard seam */ }), 'aek-websearch: access guard')
  }

  ctx.effect(() => server.register({
    kind: 'exact',
    path: ACCESS_API_PATH,
    handler: async (req, res) => {
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        sendJson(res, 200, accessView())
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use GET or POST' })
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
        size += buffer.length
        if (size > 64 * 1024) break
        chunks.push(buffer)
      }
      let body: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown
        if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>
      } catch { /* bad-request below */ }
      const update: AccessUpdate = {
        publicMode: body.publicMode === true,
        allowlist: Array.isArray(body.allowlist) ? body.allowlist as string[] : [],
        username: typeof body.username === 'string' ? body.username : '',
        password: typeof body.password === 'string' ? body.password : '',
      }
      const result = writeAccess(update)
      if (!result.ok) {
        sendJson(res, 400, { code: 'invalid-access', message: result.message })
        return
      }
      sendJson(res, 200, result.view)
    },
  }), 'aek-websearch: access settings')

  ctx.effect(() => server.register({
    kind: 'exact',
    path: CONSOLE_FACTS_API_PATH,
    handler: (_req, res) => { sendJson(res, 200, readConsoleFacts()) },
  }), 'aek-websearch: console facts')

  ctx.effect(() => server.register({
    kind: 'exact',
    path: PERMISSIONS_API_PATH,
    handler: (_req, res) => {
      sendJson(res, 200, {
        platform: process.platform,
        arch: process.arch,
        bundles: BUNDLES,
        deepLink: process.platform === 'darwin' ? ACCESSIBILITY_DEEP_LINK : '',
        snapshot: permissionSnapshot(),
      })
    },
  }), 'aek-websearch: permission status')

  ctx.effect(() => server.register({
    kind: 'exact',
    path: PERMISSIONS_OPEN_API_PATH,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      if (process.platform !== 'darwin') {
        sendJson(res, 200, { ok: false, reason: 'unsupported-platform', platform: process.platform })
        return
      }
      // No API can GRANT Accessibility on macOS (verified with aekws + Electron
      // docs). The supported action is opening the pane where the user enables
      // AEK / AEK Next by name. `open` is spawned without a shell.
      const child = spawn('open', [ACCESSIBILITY_DEEP_LINK], { stdio: 'ignore', detached: true })
      child.on('error', () => { /* surfaced as ok:false below is not possible post-send; logged via unref */ })
      child.unref()
      const stamp = join(resolveAekHome(), 'permissions.json')
      try {
        mkdirSync(dirname(stamp), { recursive: true })
        const previous = permissionSnapshot()
        writeFileSync(stamp, JSON.stringify({ ...previous, requestedAt: new Date().toISOString() }, null, 2) + '\n', 'utf-8')
      } catch { /* best effort: the pane itself is the real action */ }
      sendJson(res, 200, { ok: true, deepLink: ACCESSIBILITY_DEEP_LINK })
    },
  }), 'aek-websearch: open privacy settings')

  ctx.effect(() => server.register({
    kind: 'exact',
    path: PLUGIN_ACTION_API_PATH,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
        size += buffer.length
        if (size > 64 * 1024) break
        chunks.push(buffer)
      }
      let body: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown
        if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>
      } catch { /* bad-request below */ }
      const id = body.id
      const action = body.action
      const known = typeof id === 'string' ? scanPlugins().find(plugin => plugin.id === id) : undefined
      const allowed = action === 'restart' || action === 'enable' || action === 'disable'
      if (typeof id !== 'string' || known === undefined || !allowed) {
        sendJson(res, 400, { code: 'bad-request', message: 'a known plugin id and a valid action is required' })
        return
      }
      if (action !== 'restart' && known.locked) {
        // Structural plugins: say WHY instead of silently ignoring the click.
        sendJson(res, 409, { code: 'locked', reason: known.lockReason, id })
        return
      }
      if (action === 'enable' || action === 'disable') {
        // The switch is one control, so the two actions share one state file.
        // Persisting it here keeps the UI honest across windows and machines;
        // applying it is the launcher's job at the next host start (a web host
        // never hot-swaps another plugin in-process).
        const disabled = readDisabledPlugins()
        if (action === 'disable') disabled.add(id)
        else disabled.delete(id)
        if (!writeDisabledPlugins(disabled)) {
          sendJson(res, 500, { code: 'state-failed', message: 'could not persist the plugin state' })
          return
        }
        sendJson(res, 200, { ok: true, id, enabled: action === 'enable', status: 'saved' })
        return
      }
      // X2: `restart` is no longer a dead-letter queue entry. Two honest
      // outcomes, both tracked in the operation ledger (GET /api/aek/ops):
      //  - the plugin lives in an ISOLATED runtime container → restart that
      //    container's process LIVE (stop + start under the supervisor);
      //  - the plugin runs IN THE HOST → it cannot be restarted without
      //    restarting this process; the action is queued with
      //    `pendingHostRestart` and the host's boot hook closes it.
      const aekHome = resolveAekHome()
      const doc = readRuntimeDocV2(aekHome)
      const runtimeId = doc.assignments[id]
      if (runtimeId !== undefined) {
        const supervisor = new CapabilitySupervisor()
        const opEntry = appendOp(aekHome, {
          kind: 'plugin-restart',
          title: `${id} · restart`,
          owner: 'aek-websearch',
          steps: [
            { label: 'stopping the process', state: 'active' },
            { label: 'starting the process', state: 'pending' },
            { label: 'running', state: 'pending' },
          ],
        })
        try {
          const stopped = await stopRuntimeGroup({ supervisor, aekHome, runtimeId })
          const packages = discoverAekSiblingPackages(import.meta.url)
          const started = await startRuntimeGroup({ supervisor, aekHome, packages, runtimeId })
          if (started.ok) {
            updateOp(aekHome, opEntry.id, {
              status: 'done',
              steps: [
                { label: 'stopping the process', state: 'done' },
                { label: 'starting the process', state: 'done' },
                { label: 'running', state: 'done' },
              ],
            })
            sendJson(res, 200, { ok: true, id, action, status: 'done', opId: opEntry.id })
          } else {
            updateOp(aekHome, opEntry.id, {
              status: 'failed',
              steps: [
                { label: 'stopping the process', state: stopped.ok === false ? 'failed' : 'done' },
                { label: 'starting the process', state: 'failed' },
                { label: 'running', state: 'pending' },
              ],
              note: started.problem ?? (stopped.problem ?? 'the restart failed'),
            })
            sendJson(res, 200, { ok: false, id, action, status: 'failed', opId: opEntry.id, problem: started.problem ?? stopped.problem })
          }
        } catch {
          updateOp(aekHome, opEntry.id, {
            status: 'failed',
            steps: [
              { label: 'stopping the process', state: 'failed' },
              { label: 'starting the process', state: 'pending' },
              { label: 'running', state: 'pending' },
            ],
            note: 'the runtime state is unreadable',
          })
          sendJson(res, 502, { ok: false, id, action, status: 'failed', opId: opEntry.id, code: 'restart-failed', message: 'the runtime state is unreadable' })
        }
        return
      }
      const queuedOp = appendOp(aekHome, {
        kind: 'plugin-restart-host',
        title: `${id} · restart`,
        owner: 'aek-websearch',
        pendingHostRestart: true,
        steps: [
          { label: 'queued', state: 'done' },
          { label: 'waiting for the backend restart', state: 'active' },
          { label: 'done', state: 'pending' },
        ],
      })
      sendJson(res, 200, { ok: true, id, action, status: 'queued', opId: queuedOp.id, pendingHostRestart: true })
    },
  }), 'aek-websearch: plugin action queue')
}
