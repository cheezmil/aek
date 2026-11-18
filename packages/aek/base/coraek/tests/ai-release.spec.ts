/**
 * Unit tests for the AI auto-release + auto-close-next switches
 * (`ai-release.mjs`, S7 + S9): the per-key defaults (missing / corrupt file /
 * absent key = `allowed: false`, `autoCloseNext: true` — the two defaults are
 * deliberately opposite), the partial-patch merge write, and the host route's
 * 428 confirm rule + partial-patch validation. No real AEK_HOME is touched —
 * the store uses a temp directory.
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

/** The per-key defaults every "no usable document" path must yield. */
const DEFAULTS = { allowed: false, autoCloseNext: true }

describe('ai-release store', () => {
  let home: string

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('a missing file yields the per-key defaults, not an error', () => {
    home = freshHome()
    expect(readAiRelease(home)).toEqual(DEFAULTS)
    expect(join(home, AI_RELEASE_FILE)).toBe(aiReleasePath(home))
  })

  it('a corrupt file falls back to the per-key defaults', () => {
    home = freshHome()
    writeFileSync(aiReleasePath(home), '{ not json', 'utf8')
    expect(readAiRelease(home)).toEqual(DEFAULTS)
  })

  it('a wrong-shape document falls back to the per-key defaults', () => {
    home = freshHome()
    writeFileSync(aiReleasePath(home), JSON.stringify([true, true]), 'utf8')
    expect(readAiRelease(home)).toEqual(DEFAULTS)
  })

  it('a non-boolean stored value falls back key-by-key, keeping the other key', () => {
    home = freshHome()
    writeFileSync(aiReleasePath(home), JSON.stringify({ allowed: 'yes', autoCloseNext: false }), 'utf8')
    expect(readAiRelease(home)).toEqual({ allowed: false, autoCloseNext: false })
  })

  it('the pre-S9 shape { allowed } keeps autoCloseNext at its default', () => {
    home = freshHome()
    writeFileSync(aiReleasePath(home), JSON.stringify({ allowed: true }), 'utf8')
    expect(readAiRelease(home)).toEqual({ allowed: true, autoCloseNext: true })
  })

  it('writeAiRelease round-trips partial patches, merging over the stored doc', () => {
    home = freshHome()
    expect(writeAiRelease(home, { allowed: true })).toEqual({ ok: true, problems: [] })
    expect(readAiRelease(home)).toEqual({ allowed: true, autoCloseNext: true })
    // patch only autoCloseNext: the stored allowed=true must survive
    expect(writeAiRelease(home, { autoCloseNext: false })).toEqual({ ok: true, problems: [] })
    expect(readAiRelease(home)).toEqual({ allowed: true, autoCloseNext: false })
    expect(writeAiRelease(home, { autoCloseNext: true })).toEqual({ ok: true, problems: [] })
    expect(readAiRelease(home)).toEqual({ allowed: true, autoCloseNext: true })
  })

  it('rejects a non-boolean without touching the file', () => {
    home = freshHome()
    const result = writeAiRelease(home, { allowed: 'on' as unknown as boolean })
    expect(result.ok).toBe(false)
    expect(result.problems.length).toBeGreaterThan(0)
    expect(readAiRelease(home)).toEqual(DEFAULTS)
  })

  it('rejects an empty patch and unknown keys', () => {
    home = freshHome()
    expect(writeAiRelease(home, {}).ok).toBe(false)
    expect(writeAiRelease(home, { bogus: true }).ok).toBe(false)
    expect(readAiRelease(home)).toEqual(DEFAULTS)
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

  it('GET returns the per-key defaults when no file exists', async () => {
    home = freshHome()
    const { routes, ctx, flush } = fakeCtx()
    registerAiReleaseApi(ctx, { aekHome: home })
    flush()
    const route = routes.find(r => r.path === AI_RELEASE_API_PATH)
    expect(route).toBeDefined()
    const res = { statusCode: 0, setHeader() {}, end(p?: string) { this.body = p } }
    await route!.handler({ method: 'GET' }, res as never)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(String(res.body))).toEqual({
      protocol: 'aek-ai-release/2',
      allowed: false,
      autoCloseNext: true,
    })
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
    expect(readAiRelease(home)).toEqual(DEFAULTS)
  })

  it('a POST patching only autoCloseNext merges over the stored allowed', async () => {
    home = freshHome()
    writeFileSync(aiReleasePath(home), JSON.stringify({ allowed: true }), 'utf8')
    const { routes, ctx, flush } = fakeCtx()
    registerAiReleaseApi(ctx, { aekHome: home })
    flush()
    const route = routes.find(r => r.path === AI_RELEASE_API_PATH)!
    const res = { statusCode: 0, setHeader() {}, end(p?: string) { this.body = p } }
    await route.handler({ method: 'POST', async *[Symbol.asyncIterator]() { yield JSON.stringify({ autoCloseNext: false, confirm: true }) } }, res as never)
    expect(res.statusCode).toBe(200)
    expect(readAiRelease(home)).toEqual({ allowed: true, autoCloseNext: false })
    expect(JSON.parse(String(res.body))).toEqual({
      protocol: 'aek-ai-release/2',
      allowed: true,
      autoCloseNext: false,
    })
  })

  it('a POST with no switch at all answers 400', async () => {
    home = freshHome()
    const { routes, ctx, flush } = fakeCtx()
    registerAiReleaseApi(ctx, { aekHome: home })
    flush()
    const route = routes.find(r => r.path === AI_RELEASE_API_PATH)!
    const res = { statusCode: 0, setHeader() {}, end(p?: string) { this.body = p } }
    await route.handler({ method: 'POST', async *[Symbol.asyncIterator]() { yield JSON.stringify({ confirm: true }) } }, res as never)
    expect(res.statusCode).toBe(400)
    expect(readAiRelease(home)).toEqual(DEFAULTS)
  })

  it('a POST with a non-boolean switch answers 400 and writes nothing', async () => {
    home = freshHome()
    const { routes, ctx, flush } = fakeCtx()
    registerAiReleaseApi(ctx, { aekHome: home })
    flush()
    const route = routes.find(r => r.path === AI_RELEASE_API_PATH)!
    const res = { statusCode: 0, setHeader() {}, end(p?: string) { this.body = p } }
    await route.handler({ method: 'POST', async *[Symbol.asyncIterator]() { yield JSON.stringify({ autoCloseNext: 'nope', confirm: true }) } }, res as never)
    expect(res.statusCode).toBe(400)
    expect(readAiRelease(home)).toEqual(DEFAULTS)
  })

  it('a full POST persists both switches', async () => {
    home = freshHome()
    const { routes, ctx, flush } = fakeCtx()
    registerAiReleaseApi(ctx, { aekHome: home })
    flush()
    const route = routes.find(r => r.path === AI_RELEASE_API_PATH)!
    const res = { statusCode: 0, setHeader() {}, end(p?: string) { this.body = p } }
    await route.handler({ method: 'POST', async *[Symbol.asyncIterator]() { yield JSON.stringify({ allowed: true, autoCloseNext: true, confirm: true }) } }, res as never)
    expect(res.statusCode).toBe(200)
    expect(readAiRelease(home)).toEqual({ allowed: true, autoCloseNext: true })
  })
})
