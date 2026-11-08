/**
 * Host-persisted UI settings for the AEK console (C11).
 *
 * PRINCIPLE: no UI setting may live in the browser's localStorage — it is
 * scoped to one browser and would silently ignore the AEK data root, so the
 * same user sees different settings in Electron, in Safari, on another
 * machine. Every setting is therefore stored on the host under
 * `<AEK_HOME>/preferences/` (the slot's own data root, so AEK and AEK Next
 * never share settings) and is served back through this module's routes.
 *
 * - `GET  /api/aek/preferences` → `{ [key]: value }` (all known settings)
 * - `POST /api/aek/preferences` → `{ key, value }` upserts ONE setting
 *
 * The value type is restricted to JSON primitives (string / number /
 * boolean): nested structures would invite schema drift nobody owns.
 *
 * @module aek-websearch/preferences
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@cheezmil/coraek/types'
import { resolveAekHome } from '@cheezmil/coraek/home'

/** The settings route the console talks to. */
export const PREFERENCES_API_PATH = '/api/aek/preferences'
/** One stored setting value. */
export type PrefValue = string | number | boolean

/**
 * A setting key: short, flat, namespaced by the surface that owns it
 * (`aek-home.panel`). One whitelist pattern guards the file against path
 * tricks — the key is used as a JSON property, not a path, but the rule
 * keeps the on-disk shape predictable.
 * @param key - untrusted key.
 * @returns true when the key is storable.
 */
export function isPrefKey(key: unknown): key is string {
  return typeof key === 'string' && /^[a-z0-9._-]{1,64}$/iu.test(key)
}

/**
 * @param value - untrusted value.
 * @returns the value, or `undefined` when it is not a JSON primitive.
 */
function normalizeValue(value: unknown): PrefValue | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

/**
 * The settings file, inside the slot's data root.
 * @returns the absolute path.
 */
function prefsFile(): string {
  return join(resolveAekHome(), 'preferences', 'aek-home.json')
}

/**
 * Read every stored setting. A missing or malformed file is the normal
 * first-run state and reads as "no settings yet".
 * @returns the settings map.
 */
export function readPrefs(): Record<string, PrefValue> {
  try {
    const parsed = JSON.parse(readFileSync(prefsFile(), 'utf-8')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, PrefValue> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const normalized = normalizeValue(value)
      if (normalized !== undefined) out[key] = normalized
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Upsert one setting, keeping every other key untouched.
 * @param key - a validated setting key.
 * @param value - the new value.
 * @returns the written file path.
 */
export function writePref(key: string, value: PrefValue): string {
  const file = prefsFile()
  mkdirSync(dirname(file), { recursive: true })
  const current = readPrefs()
  current[key] = value
  writeFileSync(file, JSON.stringify(current, null, 2) + '\n', 'utf-8')
  return file
}

/**
 * Register the settings routes on the composition's web server.
 * @param ctx - the plugin context (typed via @cheezmil/coraek/types).
 */
export function registerPreferences(ctx: Context): void {
  // The narrow `webServer` seam this module uses; spelled out locally so the
  // plugin stays host-shape agnostic (same convention as inventory.ts).
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
    path: PREFERENCES_API_PATH,
    handler: async (req, res) => {
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        send(res, 200, readPrefs())
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        send(res, 405, { code: 'method-not-allowed', message: 'use GET or POST' })
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
      let body: Record<string, unknown> | undefined
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>
        }
      } catch { /* malformed body → bad request below */ }
      const key = body?.key
      const value = normalizeValue(body?.value)
      if (!isPrefKey(key) || value === undefined) {
        send(res, 400, { code: 'bad-request', message: 'a storable key and a primitive value are required' })
        return
      }
      try {
        writePref(key, value)
      } catch {
        // A disk failure keeps the console working on its in-memory values;
        // the inconsistency becomes visible on the next read instead of
        // turning a settings write into a hard error.
      }
      send(res, 200, readPrefs())
    },
  }), 'aek-websearch: preferences API')
}
