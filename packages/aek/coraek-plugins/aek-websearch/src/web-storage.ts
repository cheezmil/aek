/**
 * Host-persisted Web Storage for the AEK console (C11+, BI round).
 *
 * The web console's `window.localStorage` is redirected at boot by
 * `@cheezmil/aek-web`'s `host-storage.ts` shim: every value lands in the
 * data root as `<AEK_HOME>/preferences/web-storage.yml` (written by
 * `@cheezmil/coraek/web-storage`), served back through this module's routes.
 * Plugin code keeps calling `localStorage.*` unchanged — the redirect is the
 * architecture, not an opt-in.
 *
 * - `GET  /api/aek/web-storage` → `{ entries: { [key]: value } }`
 * - `POST /api/aek/web-storage` → `{ entries: { [key]: value } }` replaces
 *   the whole map (the shim posts the full map on every flush, so a replace
 *   is the natural atomic unit; last write wins between racing windows).
 *
 * Unlike `/api/aek/preferences` (schema-owning settings, one-key upserts,
 * primitive whitelist), this is a flat string map mirroring the Web Storage
 * semantics exactly: arbitrary keys (≤ 255 chars, no control characters),
 * string values, full-map replace.
 *
 * @module aek-websearch/web-storage
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@cheezmil/coraek/types'
import {
  readWebStorageEntries,
  webStorageFile,
  writeWebStorageEntries,
} from '@cheezmil/coraek/web-storage'

/** The web-storage route the console's localStorage shim talks to. */
export const WEB_STORAGE_API_PATH = '/api/aek/web-storage'
/** Body cap: a whole-console localStorage map is small; the cap guards abuse. */
const MAX_BODY_BYTES = 256 * 1024
/** Web Storage keys are arbitrary but bounded; control characters would break the file. */
const KEY_PATTERN = /^(?:[^\x00-\x1F\x7F]){1,255}$/u

/**
 * @param key - untrusted key.
 * @returns true when the key is storable.
 */
export function isWebStorageKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_PATTERN.test(key)
}

/**
 * Coerce an untrusted value to a storable string (Web Storage mandates
 * string values; primitives are stringified, everything else is dropped).
 * @param value - untrusted value.
 * @returns the string, or `undefined` when unstorable.
 */
function normalizeEntry(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return undefined
}

/**
 * @param req - untrusted POST body stream.
 * @returns the parsed `{ entries }` map, or `undefined` when malformed.
 */
async function readEntriesBody(req: IncomingMessage): Promise<Record<string, string> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buffer.length
    if (size > MAX_BODY_BYTES) break
    chunks.push(buffer)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const raw = (parsed as Record<string, unknown>).entries
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const entries: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const safe = normalizeEntry(value)
    if (!isWebStorageKey(key) || safe === undefined) return undefined
    entries[key] = safe
  }
  return entries
}

/**
 * Register the web-storage route on the composition's web server.
 * @param ctx - the plugin context (typed via @cheezmil/coraek/types).
 */
export function registerWebStorage(ctx: Context): void {
  // The narrow `webServer` seam this module uses; spelled out locally so the
  // plugin stays host-shape agnostic (same convention as preferences.ts).
  const server = (ctx as unknown as {
    webServer?: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
      }): () => void
    }
  }).webServer
  if (server === undefined) return
  const send = (res: ServerResponse, status: number, body: unknown): void => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(body))
  }
  ctx.effect(() => server.register({
    kind: 'exact',
    path: WEB_STORAGE_API_PATH,
    handler: async (req, res) => {
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        send(res, 200, { entries: readWebStorageEntries() })
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        send(res, 405, { code: 'method-not-allowed', message: 'use GET or POST' })
        return
      }
      const entries = await readEntriesBody(req)
      if (entries === undefined) {
        send(res, 400, { code: 'bad-request', message: 'body must be { "entries": { "<key>": "<string>" } }' })
        return
      }
      try {
        writeWebStorageEntries(entries)
      } catch {
        // A disk failure keeps the console working on its in-memory values,
        // exactly like the preferences routes: the inconsistency becomes
        // visible on the next read instead of turning a storage write into
        // a hard error.
      }
      send(res, 200, { entries: readWebStorageEntries(), file: webStorageFile() })
    },
  }), 'aek-websearch: web-storage API')
}
