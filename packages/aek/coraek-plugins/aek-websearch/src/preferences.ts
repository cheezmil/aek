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
 * - `POST /api/aek/preferences/backup`  → snapshots the settings file before
 *   a destructive "restore defaults" (2026-11-12 Q round)
 * - `POST /api/aek/preferences/restore` → puts that snapshot back (undo)
 *
 * The value type is restricted to JSON primitives (string / number /
 * boolean): nested structures would invite schema drift nobody owns.
 *
 * @module aek-websearch/preferences
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@cheezmil/coraek/types'
import { resolveAekHome } from '@cheezmil/coraek/home'

/** The settings route the console talks to. */
export const PREFERENCES_API_PATH = '/api/aek/preferences'
/** Copies the current settings file before a destructive "restore defaults". */
export const PREFERENCES_BACKUP_API_PATH = '/api/aek/preferences/backup'
/** Puts the backup back over the settings file (undo the restore). */
export const PREFERENCES_RESTORE_API_PATH = '/api/aek/preferences/restore'
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
  return writePrefs({ [key]: value })
}

/**
 * Upsert several settings in ONE read/write pass. The settings page is
 * schema-driven (2026-11-09 round): switching a preset or resetting a group
 * must not fire N separate HTTP requests and N file rewrites.
 * @param values - validated key/value pairs.
 * @returns the written file path.
 */
export function writePrefs(values: Record<string, PrefValue>): string {
  const file = prefsFile()
  mkdirSync(dirname(file), { recursive: true })
  const current = readPrefs()
  for (const [key, value] of Object.entries(values)) current[key] = value
  writeFileSync(file, JSON.stringify(current, null, 2) + '\n', 'utf-8')
  return file
}

/**
 * The snapshot the "restore defaults" flow keeps next to the live file, so
 * the user can undo the reset (user rule 2026-11-12: backup BEFORE reset,
 * and the reset must be undoable).
 * @returns the backup file path.
 */
export function backupPrefsFile(): string {
  return `${prefsFile()}.backup`
}

/**
 * Copy the live settings file to the backup snapshot. A missing live file is
 * the normal first-run state: nothing to back up, and the call still succeeds.
 * @returns whether a snapshot was written.
 */
export function backupPrefs(): boolean {
  const target = backupPrefsFile()
  mkdirSync(dirname(target), { recursive: true })
  const current = readPrefs()
  writeFileSync(target, JSON.stringify(current, null, 2) + '\n', 'utf-8')
  return true
}

/**
 * Put the backup snapshot back over the live settings file.
 * @returns the restored settings map, or `undefined` when no snapshot exists.
 */
export function restorePrefs(): Record<string, PrefValue> | undefined {
  const source = backupPrefsFile()
  if (!existsSync(source)) return undefined
  const parsed = JSON.parse(readFileSync(source, 'utf-8')) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const file = prefsFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n', 'utf-8')
  return readPrefs()
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
      const batch = body?.values
      if (typeof batch === 'object' && batch !== null && !Array.isArray(batch)) {
        const entries = Object.entries(batch as Record<string, unknown>)
        const normalized: Record<string, PrefValue> = {}
        for (const [key, value] of entries) {
          const safe = normalizeValue(value)
          if (!isPrefKey(key) || safe === undefined) {
            send(res, 400, { code: 'bad-request', message: 'every values entry needs a storable key and a primitive value' })
            return
          }
          normalized[key] = safe
        }
        try {
          writePrefs(normalized)
        } catch {
          // A disk failure keeps the console working on its in-memory values.
        }
        send(res, 200, readPrefs())
        return
      }
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
  ctx.effect(() => server.register({
    kind: 'exact',
    path: PREFERENCES_BACKUP_API_PATH,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        send(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      try {
        backupPrefs()
      } catch {
        // A disk failure means the backup cannot be promised; say so instead
        // of silently continuing with the destructive default reset.
        send(res, 500, { code: 'backup-failed', message: 'could not write the settings backup' })
        return
      }
      send(res, 200, { ok: true })
    },
  }), 'aek-websearch: settings backup')
  ctx.effect(() => server.register({
    kind: 'exact',
    path: PREFERENCES_RESTORE_API_PATH,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        send(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      try {
        const restored = restorePrefs()
        if (restored === undefined) {
          send(res, 404, { code: 'no-backup', message: 'there is no settings backup to restore' })
          return
        }
        send(res, 200, restored)
      } catch {
        send(res, 500, { code: 'restore-failed', message: 'could not restore the settings backup' })
      }
    },
  }), 'aek-websearch: settings restore')
}
