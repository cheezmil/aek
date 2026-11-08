/**
 * Host half of the `aek-websearch` management API.
 *
 * The web profile replaces the dsh shell with the AEK home surface, so the
 * dsh Plugins page (and its configuration card) never renders. The AEK
 * management page needs the same facts the CLI shows — which providers are
 * enabled, how many keys each pool holds, where the state lives — over a
 * channel the browser can reach. This plugin registers that channel on the
 * composition's `webServer`:
 *
 * - `GET  /api/aek/websearch`      → the status snapshot (read-only facts)
 * - `POST /api/aek/websearch`      → `{ kind, enabled }` toggles one provider
 * - `GET  /api/aek/websearch/keys` → masked key-pool entries for one provider
 * - `POST /api/aek/websearch/keys` → `{ kind, key }` appends one key
 * - `PUT  /api/aek/websearch/keys` → `{ kind, id, key }` replaces one key
 * - `PATCH /api/aek/websearch/keys`→ `{ kind, id, disabled }` enables/disables one
 * - `DELETE /api/aek/websearch/keys`→ `{ kind, id }` removes one key
 * - `POST /api/aek/websearch/keys/reveal` → `{ kind, id }` one explicit
 *   user-initiated plaintext reveal (C4); the only literal-returning route
 * - `GET  /api/aek/preferences`     → the host-stored UI settings (C11)
 * - `POST /api/aek/preferences`     → `{ key, value }` upserts one setting
 * - `GET  /api/aek/inventory`        → real AEK package versions + dev/npm kind
 *
 * This plugin owns all host routes the AEK console reads. The inventory route
 * is registered here (not in aek-home) because that package's host entry is a
 * tsc emit artifact that cannot carry relative TS imports through the bundle.
 *
 * The key-pool LIST/CRUD routes NEVER return a plaintext key literal: every
 * response carries only masked tags and the real row id. The sole exception is
 * `/keys/reveal`, which returns one literal for one id, and ONLY because the
 * user clicked "show" on that row — no listing, count or status call can drag
 * a literal into the client bundle.
 *
 * The facts come from the same files the CLI reads, so the page and
 * `aekws doctor` / `aekws pool` never disagree:
 *
 * - `~/.aek/websearch/providers.yml` — the per-provider enabled flags
 * - `~/.aek/websearch/<kind>.db`    — the encrypted key pool (count only;
 *   key literals never leave the host)
 *
 * This plugin is mounted ONLY where the AEK management page needs it (the
 * AEK web bundle). The search provider itself stays a separate plugin, so
 * a composition without a web server keeps working unchanged.
 *
 * @module aek-websearch/admin
 */

import type { Context } from '@cheezmil/coraek/types'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { resolveAekHome } from '@cheezmil/coraek/home'
import { parse, stringify } from 'yaml'
import { KeyStore } from '@cheezmil/prevent-agent-directly-seeing-key'
import { PROVIDER_KINDS } from './defaults.ts'
import { registerInventory } from './inventory.ts'
import { KeyPool } from './key-pool.ts'
import { registerPreferences } from './preferences.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'aek-websearch-admin'

/** Only the web server seam is required. */
export const inject = ['webServer'] as const

/** The route the AEK management page talks to. */
export const WEBSEARCH_API_PATH = '/api/aek/websearch'

/** The key-pool CRUD route. Separate from the status route so the two can evolve independently. */
export const WEBSEARCH_KEYS_API_PATH = '/api/aek/websearch/keys'

/**
 * The explicit key-reveal route (C4). Its own path keeps the CRUD handler
 * unable to return a literal by accident; only a deliberate POST of
 * `{ kind, id }` reaches it.
 */
export const WEBSEARCH_KEYS_REVEAL_API_PATH = '/api/aek/websearch/keys/reveal'

/** The runtime-mode route the dual-app switcher talks to. */
export const RUNTIME_API_PATH = '/api/aek/runtime'

/** One masked key-pool row, safe to send to the browser. */
export interface KeyPoolEntry {
  /** Real primary key in the encrypted pool (NOT `status()`'s 0-based display id). */
  id: number
  /** Masked display tag; never the literal. */
  masked: string
  /** Whether the key is disabled after repeated failures. */
  disabled: boolean
  /** Recorded failure count. */
  failures: number
}

/** The key-pool snapshot a management UI renders. */
export interface KeyPoolSnapshot {
  /** Provider kind the snapshot belongs to. */
  kind: string
  /** Rows in insertion order. */
  entries: KeyPoolEntry[]
}

/**
 * The narrow `webServer` seam this plugin uses. The AEK type layer
 * (`@cheezmil/coraek/types`) re-exports cordis' `Context`, whose
 * `webServer` member comes from the host-webserver package's declaration
 * merge — a merge the AEK packages deliberately do not re-export (they are
 * host-shape agnostic). Spelling the seam out locally keeps this plugin
 * typed without importing a dsh host package.
 */
interface WebServerSeam {
  /** Register one named route; returns its disposer. */
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/**
 * Read the `webServer` seam off the plugin context.
 * @param ctx - the plugin context.
 * @returns the web server seam.
 */
function webServerOf(ctx: Context): WebServerSeam {
  return (ctx as unknown as { webServer: WebServerSeam }).webServer
}

/** One provider's management facts. */
export interface ProviderStatus {
  /** The provider kind (adapter name). */
  kind: string
  /** Whether the provider is enabled in `providers.yml`. */
  enabled: boolean
  /** How many keys the encrypted pool holds; `undefined` when unreadable. */
  keyCount?: number | undefined
  /** Whether the pool file exists at all. */
  hasPool: boolean
}

/** The status snapshot the management page renders. */
export interface WebsearchStatus {
  /** The AEK home directory the state lives in. */
  aekHome: string
  /** The `providers.yml` path. */
  providersFile: string
  /** One entry per known provider kind. */
  providers: ProviderStatus[]
}

/**
 * The AEK home directory. Every reader (key pool, providers config, CLI)
 * resolves the root through `@cheezmil/coraek/home`, so the management page
 * reports on the same directory the running app slot actually uses.
 * @returns the absolute AEK home directory.
 */
function aekHome(): string {
  return resolveAekHome()
}

/**
 * The `providers.yml` path inside the AEK home.
 * @returns the absolute path of the providers configuration.
 */
function providersFile(): string {
  return join(aekHome(), 'websearch', 'providers.yml')
}

/**
 * Read the provider enabled flags. A missing or malformed file yields an
 * empty map, which renders as "every provider disabled" — the same shape
 * the CLI's reader produces.
 * @returns the enabled flag per provider kind.
 */
function readEnabledFlags(): Map<string, boolean> {
  const flags = new Map<string, boolean>()
  try {
    const parsed = parse(readFileSync(providersFile(), 'utf-8')) as {
      providers?: Record<string, { enabled?: boolean }>
    } | null
    for (const [kind, entry] of Object.entries(parsed?.providers ?? {})) {
      flags.set(kind, entry?.enabled !== false)
    }
  } catch {
    // A missing file is the normal first-run state.
  }
  return flags
}

/**
 * Count the keys in one provider's encrypted pool. The pool is opened
 * read-only in spirit: this only reads the row count, never the literals.
 * @param kind - the provider kind.
 * @returns the key count, or `undefined` when the pool cannot be opened.
 */
function countKeys(kind: string): number | undefined {
  let store: KeyStore | undefined
  try {
    store = new KeyStore(kind)
    return store.count()
  } catch {
    return undefined
  } finally {
    store?.close()
  }
}

/**
 * Build the status snapshot: every known provider kind with its enabled
 * flag and key-pool facts.
 * @returns the snapshot the management page renders.
 */
export function readStatus(): WebsearchStatus {
  const flags = readEnabledFlags()
  const providers: ProviderStatus[] = PROVIDER_KINDS.map((kind) => {
    const poolPath = join(aekHome(), 'websearch', `${kind}.db`)
    return {
      kind,
      enabled: flags.get(kind) === true,
      keyCount: countKeys(kind),
      hasPool: existsSync(poolPath),
    }
  })
  return {
    aekHome: aekHome(),
    providersFile: providersFile(),
    providers,
  }
}

/**
 * Write one provider's enabled flag back into `providers.yml`, keeping the
 * other providers' entries untouched.
 * @param kind - the provider kind to toggle.
 * @param enabled - the flag to store.
 * @returns the written file path.
 */
export function writeEnabled(kind: string, enabled: boolean): string {
  const file = providersFile()
  let existing: Record<string, unknown> = {}
  try {
    const parsed = parse(readFileSync(file, 'utf-8')) as Record<string, unknown> | null
    if (parsed !== null && typeof parsed === 'object') existing = parsed
  } catch {
    // A missing file is written from scratch below.
  }
  const providers = (existing.providers ?? {}) as Record<string, unknown>
  providers[kind] = { ...(providers[kind] as object ?? {}), enabled }
  const document = {
    ...existing,
    providers,
  }
  writeFileSync(file, stringify(document), 'utf-8')
  return file
}

/**
 * Validate one provider kind against the known adapters. Admin routes must
 * never open a database named by arbitrary client input.
 * @param kind - untrusted provider name.
 * @returns true when the kind is one of {@link PROVIDER_KINDS}.
 */
function isKnownKind(kind: unknown): kind is typeof PROVIDER_KINDS[number] {
  return typeof kind === 'string' && PROVIDER_KINDS.includes(kind as typeof PROVIDER_KINDS[number])
}

/**
 * Validate one API key literal. Keys are comma-joined by the older single-kv
 * format, so a comma would corrupt that representation; blanks and huge
 * payloads are rejected before touching the database.
 * @param value - untrusted key literal.
 * @returns the trimmed literal, or `undefined` when unusable.
 */
function validKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim()
  if (key.length === 0 || key.length > 4096 || key.includes(',')) return undefined
  return key
}

/**
 * Validate one masked-row primary key.
 * @param value - untrusted id.
 * @returns the id, or `undefined` when unusable.
 */
function validId(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/**
 * Read one provider's key pool as masked rows. Store is always closed, and
 * plaintext literals never leave this function.
 * @param kind - provider kind (already validated).
 * @returns the snapshot for the browser.
 */
export function readKeyPool(kind: string): KeyPoolSnapshot {
  try {
    return { kind, entries: new KeyPool(kind).entries() }
  } catch {
    return { kind, entries: [] }
  }
}

/**
 * Send one JSON response.
 * @param res - the response to write.
 * @param status - the HTTP status code.
 * @param body - the JSON body.
 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

/**
 * Turn an unknown thrown value into a displayable message.
 * @param cause - an unknown thrown value.
 * @returns a displayable message.
 */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Read a bounded JSON request body.
 * @param req - the request to read.
 * @returns the parsed body, or `undefined` when it is absent or malformed.
 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buffer.length
    if (size > 64 * 1024) return undefined
    chunks.push(buffer)
  }
  if (chunks.length === 0) return undefined
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** Walk up from this file to the repo root (where pnpm-workspace.yaml lives). */
function repoRootFrom(start: string): string {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}
const ARBITER_ROOT = repoRootFrom(dirname(fileURLToPath(import.meta.url)))
const ARBITER_BIN = join(ARBITER_ROOT, 'scripts', 'aek', 'arbiter.mjs')

/** Target runtime modes the dual-app switcher can request. */
type RuntimeMode = 'only-aek' | 'only-next' | 'both'

/** @param mode - untrusted mode string. @returns true when it is a known mode. */
function isRuntimeMode(mode: unknown): mode is RuntimeMode {
  return mode === 'only-aek' || mode === 'only-next' || mode === 'both'
}

/** @returns the slot this web server process belongs to. */
function currentSlot(): 'aek' | 'next' {
  const home = process.env.AEK_HOME ?? resolveAekHome()
  return home.endsWith('-next') ? 'next' : 'aek'
}

/**
 * Run the host arbiter. When `sync`, block and return parsed JSON; otherwise
 * spawn it detached (used to stop the slot serving this very request after the
 * HTTP response has flushed, so the connection closes before the process dies).
 * @param args - arbiter command + arguments.
 * @param sync - block for completion when true.
 * @returns the arbiter payload (sync) or a detached acknowledgement.
 */
/**
 * The arbiter prints exactly one JSON line on stdout, but anything it spawns
 * (e.g. a helper that writes progress) can add lines ahead of it. Take the last
 * line that parses rather than assuming stdout is pure JSON — a stray `[start]`
 * line used to make every successful switch report `arbiter-failed`.
 * @param stdout - raw arbiter stdout.
 * @returns the parsed payload.
 */
function parseArbiterOutput(stdout: string): Record<string, unknown> {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line || !line.startsWith('{')) continue
    try {
      return JSON.parse(line) as Record<string, unknown>
    } catch { /* keep looking */ }
  }
  throw new Error(`arbiter produced no JSON: ${stdout.trim().slice(0, 200)}`)
}

function runArbiter(args: string[], sync: boolean): Record<string, unknown> {
  // Probe without HTTP. This route runs *inside* the web host, and the arbiter
  // it spawns probes the very port this process is blocking on — a synchronous
  // curl against ourselves can never be answered, so the host would deadlock
  // until timeout (observed as the whole UI hanging with 0 bytes back).
  // `slotWebUp` still verifies the listener belongs to the slot's data root.
  const env = { ...process.env, AEK_PROBE_NO_HTTP: '1' }
  if (sync) {
    const r = spawnSync('node', [ARBITER_BIN, ...args], { encoding: 'utf8', cwd: ARBITER_ROOT, env })
    if (r.status !== 0) throw new Error(`arbiter ${args[0]} failed: ${(r.stderr ?? '').trim() || r.status}`)
    return parseArbiterOutput(r.stdout ?? '')
  }
  const child = spawn('node', [ARBITER_BIN, ...args], { cwd: ARBITER_ROOT, stdio: 'ignore', detached: true, env })
  child.unref()
  return { ok: true, detached: true, command: args[0] }
}

/**
 * Register the runtime-mode route the dual-app switcher talks to.
 *
 * - `GET`  → `{ current, slots, mode }`: the slot serving this request, both
 *   slots' liveness (web server AND shell, C6) and the derived mode.
 * - `POST` `{ mode }` → switch. Starting the other slot and stopping a slot
 *   other than the one serving us are synchronous; stopping the serving slot is
 *   deferred ~600ms past the 200 response so the browser gets a clean close.
 *
 * The host arbiter (`scripts/aek/arbiter.mjs`) does the real work; this route
 * only validates input and orchestrates it.
 * @param ctx - the plugin context.
 */
export function registerRuntime(ctx: Context): void {
  const server = webServerOf(ctx)
  ctx.effect(() => server.register({
    kind: 'exact',
    path: RUNTIME_API_PATH,
    handler: async (req, res) => {
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        try {
          sendJson(res, 200, runArbiter(['status'], true))
        } catch (cause) {
          sendJson(res, 502, { code: 'arbiter-failed', message: messageOf(cause) })
        }
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use GET or POST' })
        return
      }
      const body = await readJsonBody(req)
      const mode = body?.mode
      if (!isRuntimeMode(mode)) {
        sendJson(res, 400, { code: 'bad-request', message: 'mode must be only-aek | only-next | both' })
        return
      }
      const here = currentSlot()
      const want: Array<'aek' | 'next'> = mode === 'both' ? ['aek', 'next'] : [mode === 'only-aek' ? 'aek' : 'next']
      const unwanted: Array<'aek' | 'next'> = mode === 'both' ? [] : (mode === 'only-aek' ? ['next'] : ['aek'])
      const started: string[] = []
      const stopped: string[] = []
      try {
        for (const s of want) {
          // C6: start a wanted slot when its BACKEND is down — `cmdStart` keeps
          // a live shell out of the restart path itself.
          const probe = runArbiter(['status'], true)
          const slots = probe.slots as Record<string, { web?: boolean; running?: boolean }> | undefined
          if (!slots?.[s]?.web) { runArbiter(['start', s], true); started.push(s) }
        }
        for (const s of unwanted) {
          // Stop a slot when ANY half (web or shell) is alive.
          const probe = runArbiter(['status'], true)
          const slots = probe.slots as Record<string, { web?: boolean; running?: boolean }> | undefined
          if (slots?.[s]?.running && s !== here) { runArbiter(['stop', s], true); stopped.push(s) }
        }
        if (unwanted.includes(here)) {
          sendJson(res, 200, { ok: true, mode, started, stopped, willStopSelf: true })
          setTimeout(() => { try { runArbiter(['stop', here], false) } catch { /* best effort */ } }, 600)
          return
        }
        sendJson(res, 200, { ok: true, mode, started, stopped, status: runArbiter(['status'], true) })
      } catch (cause) {
        sendJson(res, 502, { code: 'arbiter-failed', message: messageOf(cause) })
      }
    },
  }), 'aek-websearch: runtime API')
}

/**
 * Register the management API on the composition's web server.
 * @param ctx - the plugin context (typed via @cheezmil/coraek/types).
 */
export function apply(ctx: Context): void {
  const server = webServerOf(ctx)
  registerInventory(ctx)
  registerRuntime(ctx)
  registerPreferences(ctx)

  ctx.effect(() => server.register({
    kind: 'exact',
    path: WEBSEARCH_API_PATH,
    handler: async (req, res) => {
      if (req.method === 'GET') {
        sendJson(res, 200, readStatus())
        return
      }
      if (req.method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use GET or POST' })
        return
      }
      const body = await readJsonBody(req)
      const kind = typeof body?.kind === 'string' ? body.kind : undefined
      const enabled = typeof body?.enabled === 'boolean' ? body.enabled : undefined
      if (kind === undefined || enabled === undefined) {
        sendJson(res, 400, { code: 'bad-request', message: 'kind and enabled are required' })
        return
      }
      if (!isKnownKind(kind)) {
        sendJson(res, 400, { code: 'unknown-provider', message: `unknown provider "${kind}"` })
        return
      }
      writeEnabled(kind, enabled)
      sendJson(res, 200, readStatus())
    },
  }), 'aek-websearch: management API')

  ctx.effect(() => server.register({
    kind: 'exact',
    path: WEBSEARCH_KEYS_API_PATH,
    handler: async (req, res) => {
      const method = req.method ?? 'GET'
      const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
      if (!allowed.includes(method)) {
        res.setHeader('allow', allowed.join(', '))
        sendJson(res, 405, { code: 'method-not-allowed', message: `use ${allowed.join(', ')}` })
        return
      }

      let body: Record<string, unknown> | undefined
      if (method !== 'GET') body = await readJsonBody(req)
      const query = new URLSearchParams((req.url ?? '').split('?')[1] ?? '')
      const kind = method === 'GET' ? query.get('kind') : body?.kind
      if (!isKnownKind(kind)) {
        sendJson(res, 400, { code: 'unknown-provider', message: 'a known kind is required' })
        return
      }

      if (method === 'GET') {
        sendJson(res, 200, readKeyPool(kind))
        return
      }

      const id = validId(body?.id)
      const key = validKey(body?.key)
      if (method !== 'POST' && id === undefined) {
        sendJson(res, 400, { code: 'bad-request', message: 'a positive numeric id is required' })
        return
      }
      if ((method === 'POST' || method === 'PUT') && key === undefined) {
        sendJson(res, 400, { code: 'bad-request', message: 'a valid key is required' })
        return
      }
      if (method === 'PATCH' && typeof body?.disabled !== 'boolean') {
        sendJson(res, 400, { code: 'bad-request', message: 'disabled must be a boolean' })
        return
      }

      try {
        const pool = new KeyPool(kind)
        let changed = true
        switch (method) {
          case 'POST':
            pool.add(key as string)
            break
          case 'PUT':
            changed = pool.update(id as number, key as string)
            break
          case 'DELETE':
            changed = pool.remove(id as number)
            break
          case 'PATCH':
            changed = pool.setDisabled(id as number, body?.disabled === true)
            break
          default:
            break
        }
        if (!changed) {
          sendJson(res, 404, { code: 'key-not-found', message: 'no key with that id' })
          return
        }
        sendJson(res, 200, readKeyPool(kind))
      } catch {
        // Never include the caught text: it could echo the key literal.
        sendJson(res, 500, { code: 'key-pool-failed', message: 'key pool operation failed' })
      }
    },
  }), 'aek-websearch: key pool API')

  // C4: the explicit user-initiated reveal. It is the ONLY route that can
  // return a literal, and it requires a deliberate POST with kind + id —
  // nothing in the list/count/status path calls it.
  ctx.effect(() => server.register({
    kind: 'exact',
    path: WEBSEARCH_KEYS_REVEAL_API_PATH,
    handler: async (req, res) => {
      const method = req.method ?? 'GET'
      if (method !== 'POST') {
        res.setHeader('allow', 'POST')
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      const body = await readJsonBody(req)
      const kind = body?.kind
      if (!isKnownKind(kind)) {
        sendJson(res, 400, { code: 'unknown-provider', message: 'a known kind is required' })
        return
      }
      const id = validId(body?.id)
      if (id === undefined) {
        sendJson(res, 400, { code: 'bad-request', message: 'a positive numeric id is required' })
        return
      }
      try {
        const plain = new KeyPool(kind).reveal(id)
        if (plain === undefined) {
          sendJson(res, 404, { code: 'key-not-found', message: 'no key with that id' })
          return
        }
        sendJson(res, 200, { kind, id, plain })
      } catch {
        // Never include the caught text: it could echo the key literal.
        sendJson(res, 500, { code: 'key-pool-failed', message: 'key pool operation failed' })
      }
    },
  }), 'aek-websearch: key reveal API')
}
