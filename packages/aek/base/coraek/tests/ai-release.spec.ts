/**
 * Unit tests for the AI auto-release switch (`ai-release.mjs`): the safe
 * default (missing / corrupt file = `{ allowed: false }`), the atomic
 * round-trip, and the host route's 428 confirm rule. No real AEK_HOME is
 * touched — the store uses a temp directory.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AI_RELEASE_FILE,
  aiReleasePath,
  readAiRelease,
  writeAiRelease,
} from '../ai-release.mjs'
import { registerAiReleaseApi, AI_RELEASE_API_PATH } from '../src/ai-release-api.ts'

/** One temp AEK home per test. */
function freshHome(): string {
  return mkdtempSync(join(tmpdir(), 'aek-ai-release-'))
}

describe('ai-release store', () => {
  let home: string

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('a missing file is the safe default, not an error', () => {
    home = freshHome()
    expect(readAiRelease(home)).toEqual({ allowed: false })
    expect(join(home, AI_RELEASE_FILE)).toBe(aiReleasePath(home))
  })

  it('a corrupt file falls back to the safe default', () => {
    home = freshHome()
    writeFileSync(aiReleasePath(home), '{ not json', 'utf8')
    expect(readAiRelease(home)).toEqual({ allowed: false })
  })

  it('a wrong-shape document falls back to the safe default', () => {
    home = freshHome()
    writeFileSync(aiReleasePath(home), JSON.stringify({ allowed: 'yes' }), 'utf8')
    expect(readAiRelease(home)).toEqual({ allowed: false })
  })

  it('writeAiRelease round-trips both states', () => {
    home = freshHome()
    expect(writeAiRelease(home, true)).toEqual({ ok: true, problems: [] })
    expect(readAiRelease(home)).toEqual({ allowed: true })
    writeAiRelease(home, false)
    expect(readAiRelease(home)).toEqual({ allowed: false })
  })

  it('rejects a non-boolean without touching the file', () => {
    home = freshHome()
    const result = writeAiRelease(home, 'on' as unknown as boolean)
    expect(result.ok).toBe(false)
    expect(result.problems.length).toBeGreaterThan(0)
    expect(readAiRelease(home)).toEqual({ allowed: false })
  })
})

describe('ai-release host route', () => {
  let home: string

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  /** A minimal `webServer` seam + `Context` fake, mirroring the runtime smoke. */
  type Route = { path: string; handler: (r: unknown, s: unknown) => void }
  function fakeCtx(): {
    routes: Route[]
    ctx: Parameters<typeof registerAiReleaseApi>[0]
    flush: () => void
  } {
    const routes: Route[] = []
    const effectFns: Array<() => unknown> = []
    const ctx = {
      effect(fn: () => unknown) { effectFns.push(fn) },
    } as unknown as Parameters<typeof registerAiReleaseApi>[0]
    ;(ctx as unknown as { webServer: unknown }).webServer = {
      register(route: { path: string; handler: (r: unknown, s: unknown) => void }) {
        routes.push(route)
        return () => {
          const i = routes.indexOf(route)
          if (i >= 0) routes.splice(i, 1)
        }
      },
    }
    // The real Context runs effect bodies lazily; flush them after the route
    // module has registered its effect so the handler exists on `routes`.
    const flush = (): void => {
      effectFns.splice(0).forEach(fn => fn())
    }
    return { routes, ctx, flush }
  }

  it('GET returns the safe default when no file exists', async () => {
    home = freshHome()
    const { routes, ctx, flush } = fakeCtx()
    registerAiReleaseApi(ctx, { aekHome: home })
    flush()
    const route = routes.find(r => r.path === AI_RELEASE_API_PATH)
    expect(route).toBeDefined()
    const res = { statusCode: 0, setHeader() {}, end(p?: string) { this.body = p } }
    await route!.handler({ method: 'GET' }, res as never)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(String(res.body))).toEqual({ protocol: 'aek-ai-release/1', allowed: false })
  })

  it('a POST without confirm: true answers 428 and writes nothing', async () => {
    home = freshHome()
    const { routes, ctx, flush } = fakeCtx()
    registerAiReleaseApi(ctx, { aekHome: home })
    flush()
    const route = routes.find(r => r.path === AI_RELEASE_API_PATH)!
    const res = { statusCode: 0, setHeader() {}, end(p?: string) { this.body = p } }
    await route.handler({ method: 'POST', async *[Symbol.asyncIterator]() { yield JSON.stringify({ allowed: true }) } }, res as never)
    expect(res.statusCode).toBe(428)
    expect(readAiRelease(home)).toEqual({ allowed: false })
  })

  it('a POST with confirm: true persists the switch', async () => {
    home = freshHome()
    const { routes, ctx, flush } = fakeCtx()
    registerAiReleaseApi(ctx, { aekHome: home })
    flush()
    const route = routes.find(r => r.path === AI_RELEASE_API_PATH)!
    const res = { statusCode: 0, setHeader() {}, end(p?: string) { this.body = p } }
    await route.handler({ method: 'POST', async *[Symbol.asyncIterator]() { yield JSON.stringify({ allowed: true, confirm: true }) } }, res as never)
    expect(res.statusCode).toBe(200)
    expect(readAiRelease(home)).toEqual({ allowed: true })
  })
})
