/**
 * Release-state read-only API (C round: the About page needs a visible
 * version marker so a shipped update is actually observable in the shell).
 *
 * `release.mjs` records `<AEK_HOME>/release-state.json`
 * (`{ currentTag, previousTag, updatedAt }`) when a release swaps the
 * current slot. The About page shows the tag instead of the user having to
 * grep a JSON file. The next slot has no release-state.json (releases pin
 * current only) → the API answers `{}` and the client hides the row.
 *
 * @module aek-websearch/release-state
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@cheezmil/coraek/types'
import { resolveAekHome } from '@cheezmil/coraek/home'

/** The read-only route the console talks to. */
export const RELEASE_STATE_API_PATH = '/api/aek/release-state'

/** The release-state record `release.mjs` writes into the slot home. */
export interface ReleaseState {
  currentTag?: string
  previousTag?: string
  updatedAt?: string
}

/** The release-state file inside the slot's data root. */
export function releaseStateFile(): string {
  return join(resolveAekHome(), 'release-state.json')
}

/**
 * Read the recorded release state. A missing file is the normal state for
 * the next slot and reads as "no release recorded".
 * @returns the state, or an empty record.
 */
export function readReleaseState(): ReleaseState {
  const file = releaseStateFile()
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: ReleaseState = {}
    const record = parsed as Record<string, unknown>
    for (const key of ['currentTag', 'previousTag', 'updatedAt'] as const) {
      if (typeof record[key] === 'string') out[key] = record[key] as string
    }
    return out
  }
  catch {
    return {}
  }
}

/**
 * Register the release-state route on the composition's web server.
 * @param ctx - the plugin context (typed via @cheezmil/coraek/types).
 */
export function registerReleaseState(ctx: Context): void {
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
    path: RELEASE_STATE_API_PATH,
    handler: async (_req, res) => {
      send(res, 200, readReleaseState())
    },
  }), 'aek-websearch: release-state')
}
