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
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@cheezmil/coraek/types'
import { resolveAekHome } from '@cheezmil/coraek/home'
import { SLOT_NAMES, slotConfig, slotHome, webUrl } from '@cheezmil/coraek/slots'
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
}

/** One scanned AEK plugin and its capability tags. */
export interface PluginEntry {
  /** Directory name under `packages/aek/coraek-plugins`. */
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
   * True when the plugin cannot be switched off. Two plugins are structural,
   * and the console must say so instead of offering a control that would
   * either break the UI or kill the API serving this very response.
   */
  locked: boolean
  /** Why it is locked: `root` means "this plugin IS the console UI". */
  lockReason: '' | 'root'
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
  /** The three entry-point apps. */
  entries: AppEntry[]
  /** Everything inside the coraek plugins directory. */
  plugins: PluginEntry[]
  /** Absolute path of that directory, resolved on the host (copyable). */
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
 * Scan the three product entry points.
 * @returns the entry list.
 */
function scanEntries(): AppEntry[] {
  const base = join(ROOT, 'apps')
  return childDirectories(base)
    .filter(id => id === 'web' || id === 'cli' || id === 'aek-desktop')
    .map((id) => {
      const manifest = readManifest(join(base, id, 'package.json'))
      return {
        id,
        packageName: typeof manifest.name === 'string' ? manifest.name : id,
        description: typeof manifest.description === 'string' ? manifest.description : '',
        entry: true as const,
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
 * `aek-home` IS the console: switching it off leaves the window with no UI at
 * all, so it is the ONLY structural plugin.
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
  'aek-home': 'root',
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
 * Scan EVERY directory in the coraek plugins folder (not a hardcoded roster).
 * @returns the plugin roster.
 */
function scanPlugins(): PluginEntry[] {
  const base = join(ROOT, 'packages', 'aek', 'coraek-plugins')
  const disabled = readDisabledPlugins()
  return childDirectories(base).map((id) => {
    const manifest = readManifest(join(base, id, 'package.json'))
    const lockReason = LOCKED_PLUGINS[id] ?? ''
    return {
      id,
      packageName: typeof manifest.name === 'string' ? manifest.name : id,
      version: typeof manifest.version === 'string' ? manifest.version : '',
      description: typeof manifest.description === 'string' ? manifest.description : '',
      capabilities: capabilitiesOf(manifest, id),
      // A locked plugin is always reported as enabled: its flag is meaningless.
      enabled: lockReason !== '' || !disabled.has(id),
      locked: lockReason !== '',
      lockReason,
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
    entries: scanEntries(),
    plugins: scanPlugins(),
    pluginsDir: join(ROOT, 'packages', 'aek', 'coraek-plugins'),
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
      // `restart` stays a queued intent: the cordis runtime owns plugin
      // lifecycles, so restarting is deferred to the launcher.
      const file = join(resolveAekHome(), 'plugin-actions.json')
      let queue: unknown[] = []
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown
        if (Array.isArray(parsed)) queue = parsed
      } catch { /* first action creates the file */ }
      queue.push({ id, action, at: new Date().toISOString(), status: 'queued' })
      try {
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, JSON.stringify(queue.slice(-200), null, 2) + '\n', 'utf-8')
      } catch {
        sendJson(res, 500, { code: 'queue-failed', message: 'could not persist the action' })
        return
      }
      sendJson(res, 200, { ok: true, id, action, status: 'queued' })
    },
  }), 'aek-websearch: plugin action queue')
}
