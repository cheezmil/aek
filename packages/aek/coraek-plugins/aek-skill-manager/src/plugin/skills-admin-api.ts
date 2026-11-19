/**
 * Host half of the aek-skill-manager management API.
 *
 * The webui (the `@cheezmil/aek-web` console) is a static app the host serves;
 * it cannot spawn the `aeksm` CLI and it cannot import this package's engine.
 * This module registers the skill-hub routes on the composition's `webServer`
 * seam so the browser reads the SAME in-process engine the `aeksm` CLI drives
 * (the `SkillsManagerService`): one truth, two faces.
 *
 * Routes (all read the lazily-built engine; a missing/unbootstrapped hub
 * degrades to an honest `bootstrapped: false` + doctor warnings, never a 500):
 *   - `GET  /api/aek/skills`             → overview (list + distribution + doctor + home)
 *   - `GET  /api/aek/skills/get?skill=`  → one hub skill's SKILL.md body (zero-retention read)
 *   - `GET  /api/aek/skills/cost`        → the resident context-cost ledger
 *   - `GET  /api/aek/skills/update-plan` → update candidates grouped by source
 *   - `POST /api/aek/skills/distribute`  → apply a distribution request (428 without `confirm`)
 *   - `POST /api/aek/skills/undistribute`→ remove managed runtime entries (428 without `confirm`)
 *   - `POST /api/aek/skills/add`         → discover + install from a source (428 without `confirm`)
 *   - `POST /api/aek/skills/update`      → update one source group or selected skills (428 without `confirm`)
 *
 * The write surface follows the console's write-confirm rule: a mutating call
 * without `confirm: true` is a `428 confirm-required`, mirroring
 * `/api/aek/plugin-console/run`.
 *
 * This module is the body of the ADMIN face (`src/admin.ts`, the
 * `aek-skill-manager-admin` profile entry): its inject list declares
 * `webServer` + `skillsManager`, so by the time `apply` runs both seams are
 * up — a headless composition never mounts this face at all.
 *
 * Module is node-builtin-free on purpose: this package's tsconfig is a
 * client shape (no ambient `node` types), so the host half spells its own
 * narrow local seam types instead of importing `node:http` (the same
 * convention the coraek capability/ai-release routes and aek-websearch use).
 *
 * @module @cheezmil/aek-skill-manager/plugin/skills-admin-api
 */

import type { Context } from '@cheezmil/coraek/types'
import type { SkillsManagerService } from './skills-manager-service.js'

/** The overview protocol version the console pins against. */
export const SKILLS_API = '/api/aek/skills'
export const SKILLS_API_PROTOCOL = 'aek-skills/1'

/** A narrow structural spelling of the response the seam passes to a handler. */
interface SeamResponse {
  statusCode: number
  setHeader(key: string, value: string): void
  end(payload?: string): void
}

/** A narrow structural spelling of the request the seam passes to a handler. */
interface SeamRequest {
  readonly method?: string
  [Symbol.asyncIterator](): AsyncIterator<unknown, void, unknown>
}

/**
 * The narrow `webServer` seam, spelled locally (same convention as coraek's
 * capability/ai-release routes and aek-websearch's admin half). The ADMIN
 * face declares it in its inject list, so by `apply` time it is always up.
 */
type WebServerSeam = {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: SeamRequest, res: SeamResponse) => void | Promise<void>
  }): () => void
}

function webServerOf(ctx: Context): WebServerSeam {
  return (ctx as unknown as { webServer: WebServerSeam }).webServer
}

function sendJson(res: SeamResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function toUtf8(chunk: unknown): string {
  const candidate = chunk as { toString?: (encoding?: string) => string } | Uint8Array
  if (typeof candidate?.toString === 'function' && candidate instanceof Uint8Array === false) {
    return candidate.toString('utf8')
  }
  if (candidate instanceof Uint8Array) return new TextDecoder().decode(candidate)
  return ''
}

async function readJsonBody(req: SeamRequest): Promise<Record<string, unknown> | undefined> {
  const pieces: string[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const piece = typeof chunk === 'string' ? chunk : toUtf8(chunk)
      size += piece.length
      if (size > 64 * 1024) return undefined
      pieces.push(piece)
    }
    if (size === 0) return undefined
    const parsed: unknown = JSON.parse(pieces.join(''))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** The result of an engine call: a machine-coded failure OR the raw data. */
type EngineCallResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

/** Run an engine call that may raise a machine-coded SkillsManagerError. */
function engineCall<T>(fn: () => T): EngineCallResult<T> {
  try {
    return { ok: true, data: fn() }
  } catch (cause) {
    const err = cause as { code?: string; message?: string }
    return { ok: false, code: typeof err?.code === 'string' ? err.code : 'engine-failed', message: messageOf(cause) }
  }
}

/** Send one engine result as a READ face: a `protocol` envelope on every outcome. */
function sendReadResult<T>(res: SeamResponse, result: EngineCallResult<T>, payload: (data: T) => Record<string, unknown>): void {
  if (result.ok) {
    sendJson(res, 200, { protocol: SKILLS_API_PROTOCOL, ...payload(result.data) })
    return
  }
  sendJson(res, 502, { protocol: SKILLS_API_PROTOCOL, code: result.code, message: result.message })
}

/** Send one engine result as a WRITE face: `{ ok, data }` on success, `{ ok: false, code, message }` on failure. */
function sendWriteResult<T>(res: SeamResponse, result: EngineCallResult<T>): void {
  if (result.ok) {
    sendJson(res, 200, { ok: true, data: result.data })
    return
  }
  sendJson(res, 502, { ok: false, code: result.code, message: result.message })
}

const asStringArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : undefined

const asBoolean = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)

/** The only two distribution target kinds (`DistributionTargetKind`). */
const asTarget = (v: unknown): 'user' | 'project' | undefined => (v === 'user' || v === 'project' ? v : undefined)

/**
 * Register the skill-hub management API on the current host.
 *
 * @param ctx - the plugin context carrying the `webServer` seam.
 * @param svc - the in-process skill-hub engine face (the `ctx.skillsManager`
 *   service); the routes call it directly, so the browser and the CLI share
 *   one engine instance and its lazily-rebuilt hub cache.
 */
export function registerSkillsManagerApi(ctx: Context, svc: SkillsManagerService): void {
  const server = webServerOf(ctx)

  ctx.effect(() => {
    const unsubscribers = [
      server.register({
        kind: 'exact',
        path: SKILLS_API,
        handler: async (_req, res) => {
          const snapshot = engineCall(() => ({
            home: svc.home(),
            bootstrapped: svc.isBootstrapped(),
            skills: svc.list(),
            agents: svc.agents(),
            projects: svc.knownProjects(),
            distribution: svc.status(),
            distributionBySkill: svc.distributionBySkill(),
            doctor: svc.doctor(),
          }))
          if (snapshot.ok) {
            sendJson(res, 200, { protocol: SKILLS_API_PROTOCOL, ...snapshot.data })
            return
          }
          sendJson(res, 502, { protocol: SKILLS_API_PROTOCOL, code: snapshot.code, message: snapshot.message })
        },
      }),
      server.register({
        kind: 'exact',
        path: `${SKILLS_API}/get`,
        handler: async (req, res) => {
          // The exact-match seam still delivers the query string; parse the
          // `skill` param off the raw request URL without importing node:url.
          let skill: string | undefined
          const rawUrl = (req as unknown as { url?: string }).url
          if (typeof rawUrl === 'string') {
            const qIndex = rawUrl.indexOf('?')
            if (qIndex >= 0) {
              const query = rawUrl.slice(qIndex + 1)
              for (const pair of query.split('&')) {
                const eq = pair.indexOf('=')
                if (eq <= 0) continue
                if (pair.slice(0, eq) !== 'skill') continue
                skill = decodeURIComponent(pair.slice(eq + 1))
                break
              }
            }
          }
          if (skill === undefined || skill.trim() === '') {
            sendJson(res, 400, { protocol: SKILLS_API_PROTOCOL, code: 'bad-request', message: '?skill=<name> is required' })
            return
          }
          const result = engineCall(() => svc.get(skill))
          sendReadResult(res, result, data => ({ ...data }))
        },
      }),
      server.register({
        kind: 'exact',
        path: `${SKILLS_API}/cost`,
        handler: async (_req, res) => {
          const result = engineCall(() => svc.cost())
          sendReadResult(res, result, data => ({ ...data }))
        },
      }),
      server.register({
        kind: 'exact',
        path: `${SKILLS_API}/update-plan`,
        handler: async (_req, res) => {
          const result = engineCall(() => svc.updatePlan())
          sendReadResult(res, result, data => ({ plan: data }))
        },
      }),
      server.register({
        kind: 'exact',
        path: `${SKILLS_API}/distribute`,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            res.setHeader('allow', 'POST')
            sendJson(res, 405, { code: 'method-not-allowed', message: 'POST only' })
            return
          }
          const body = await readJsonBody(req)
          if (body?.confirm !== true) {
            sendJson(res, 428, { code: 'confirm-required', message: 'distributing is a write operation: resend with confirm: true' })
            return
          }
          const to = asTarget(body.to)
          const skills = asStringArray(body.skills)
          if (to === undefined || skills === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { to: "user" | "project", skills: string[], agents?, mode?, force?, confirm: true } is required' })
            return
          }
          const result = engineCall(() =>
            svc.distribute({
              to,
              skills,
              projectRoot: typeof body.projectRoot === 'string' ? body.projectRoot : undefined,
              agents: asStringArray(body.agents),
              mode: body.mode === 'symlink' || body.mode === 'copy' ? body.mode : undefined,
              force: asBoolean(body.force),
            }),
          )
          sendWriteResult(res, result)
        },
      }),
      server.register({
        kind: 'exact',
        path: `${SKILLS_API}/undistribute`,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            res.setHeader('allow', 'POST')
            sendJson(res, 405, { code: 'method-not-allowed', message: 'POST only' })
            return
          }
          const body = await readJsonBody(req)
          if (body?.confirm !== true) {
            sendJson(res, 428, { code: 'confirm-required', message: 'undistributing is a write operation: resend with confirm: true' })
            return
          }
          const to = asTarget(body.to)
          const skills = asStringArray(body.skills)
          if (to === undefined || skills === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { to: "user" | "project", skills: string[], agents?, confirm: true } is required' })
            return
          }
          const result = engineCall(() =>
            svc.undistribute({
              to,
              skills,
              projectRoot: typeof body.projectRoot === 'string' ? body.projectRoot : undefined,
              agents: asStringArray(body.agents),
            }),
          )
          sendWriteResult(res, result)
        },
      }),
      server.register({
        kind: 'exact',
        path: `${SKILLS_API}/add`,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            res.setHeader('allow', 'POST')
            sendJson(res, 405, { code: 'method-not-allowed', message: 'POST only' })
            return
          }
          const body = await readJsonBody(req)
          if (body?.confirm !== true) {
            sendJson(res, 428, { code: 'confirm-required', message: 'installing is a write operation: resend with confirm: true' })
            return
          }
          const source = typeof body.source === 'string' ? body.source : undefined
          if (source === undefined || source.trim() === '') {
            sendJson(res, 400, { code: 'bad-request', message: 'body { source, all?, skills?, overwrite?, confirm: true } is required' })
            return
          }
          const result = engineCall(() =>
            svc.add(source, {
              all: asBoolean(body.all),
              skills: asStringArray(body.skills),
              overwrite: asBoolean(body.overwrite),
              allowInsecureHttp: asBoolean(body.allowInsecureHttp),
            }),
          )
          sendWriteResult(res, result)
        },
      }),
      server.register({
        kind: 'exact',
        path: `${SKILLS_API}/update`,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            res.setHeader('allow', 'POST')
            sendJson(res, 405, { code: 'method-not-allowed', message: 'POST only' })
            return
          }
          const body = await readJsonBody(req)
          if (body?.confirm !== true) {
            sendJson(res, 428, { code: 'confirm-required', message: 'updating is a write operation: resend with confirm: true' })
            return
          }
          const source = typeof body.source === 'string' ? body.source : undefined
          const skills = asStringArray(body.skills)
          if (source === undefined && skills === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: 'body { source? , skills? , confirm: true } requires at least one of source | skills' })
            return
          }
          const result = engineCall(() => svc.update({ source, skills }))
          sendWriteResult(res, result)
        },
      }),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, 'aek-skill-manager: skills api routes')
}
