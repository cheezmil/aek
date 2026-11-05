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
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { KeyStore } from '@cheezmil/prevent-agent-directly-seeing-key'
import { PROVIDER_KINDS } from './defaults.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'aek-websearch-admin'

/** Only the web server seam is required. */
export const inject = ['webServer'] as const

/** The route the AEK management page talks to. */
export const WEBSEARCH_API_PATH = '/api/aek/websearch'

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
 * The AEK home directory. The path must match where the readers actually
 * look: the key pool (`@cheezmil/prevent-agent-directly-seeing-key`) and the
 * providers reader both resolve `~/.aek`, so the management page resolves the
 * same directory — otherwise it would report on files nobody reads.
 * @returns the absolute AEK home directory.
 */
function aekHome(): string {
  return join(homedir(), '.aek')
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

/**
 * Register the management API on the composition's web server.
 * @param ctx - the plugin context (typed via @cheezmil/coraek/types).
 */
export function apply(ctx: Context): void {
  ctx.effect(() => webServerOf(ctx).register({
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
      if (!PROVIDER_KINDS.includes(kind as typeof PROVIDER_KINDS[number])) {
        sendJson(res, 400, { code: 'unknown-provider', message: `unknown provider "${kind}"` })
        return
      }
      writeEnabled(kind, enabled)
      sendJson(res, 200, readStatus())
    },
  }), 'aek-websearch: management API')
}
