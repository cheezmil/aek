import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CAPABILITIES_API_PATH, CAPABILITIES_STOP_API_PATH, registerCapabilityApi } from '../src/capability-api.ts'
import { CapabilitySupervisor } from '../external-supervisor.mjs'
import { writeRuntimeMode } from '../runtime.mjs'

/**
 * Route-level composition test: the real route module, the real supervisor,
 * a real state store on disk — with the webServer seam and the ctx effect
 * machinery stubbed to the narrow surface the module actually uses.
 * (A full Loader boot of the web profile is the next rung; the seam shape
 * here is the one spelled out in the aek-websearch convention.)
 */

/** A minimal ServerResponse stand-in that records what the route wrote. */
interface FakeRes {
  statusCode: number
  headers: Record<string, string>
  setHeader(key: string, value: string): void
  end(payload?: string): void
  ended?: string
}

function fakeRes(): FakeRes {
  return {
    statusCode: 0,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value
    },
    end(payload) {
      this.ended = payload
    },
  }
}

/** Feed a JSON body through a POST handler, streaming one chunk at a time. */
async function postJson(handler: (req: unknown, res: unknown) => Promise<void>, body: unknown): Promise<FakeRes> {
  const text = JSON.stringify(body)
  let index = 0
  const req = {
    method: 'POST',
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<{ done: boolean; value?: string }> {
          if (index < text.length) {
            const value = text.slice(index, index + 7)
            index += 7
            return Promise.resolve({ done: false, value })
          }
          return Promise.resolve({ done: true })
        },
      }
    },
  }
  const res = fakeRes()
  await handler(req, res as never)
  return res
}

/**
 * A fake composition context: exposes the webServer seam with route
 * registration and mirrors the REAL cordis `ctx.effect` semantics — `execute`
 * runs eagerly at registration and its returned disposer is what disposal
 * runs. That is the only surface the route module touches.
 */
function fakeCtx() {
  /** @type {{ kind: string, path: string, handler: (req: unknown, res: unknown) => unknown }[]} */
  const routes = []
  /** @type {{ label: string, dispose: () => void }[]} */
  const disposers = []
  const ctx = {
    webServer: {
      register(route: { kind: string; path: string; handler: (req: unknown, res: unknown) => unknown }) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index !== -1) routes.splice(index, 1)
        }
      },
    },
    /** Mirror of cordis: run `execute` now, keep whatever disposer it returns. */
    effect(execute: () => (() => void) | undefined, label: string): void {
      const disposer = execute()
      if (disposer !== undefined) disposers.push({ label, dispose: disposer })
    },
  }
  return {
    ctx,
    routes,
    stopAll: () => disposers.forEach(entry => entry.dispose()),
  }
}

describe('capability api routes', () => {
  let root: string
  let aekHome: string
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'aek-cap-api-'))
    aekHome = join(root, 'home')
  })
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('registers exactly the two capability routes and disposes them', () => {
    const harness = fakeCtx()
    registerCapabilityApi(harness.ctx as never)
    expect(harness.routes.map(route => route.path)).toEqual([CAPABILITIES_API_PATH, CAPABILITIES_STOP_API_PATH])
    harness.stopAll()
    expect(harness.routes).toEqual([])
  })

  it('GET /api/aek/capabilities lists the registry with compliance lines', async () => {
    const harness = fakeCtx()
    const supervisor = new CapabilitySupervisor({ aekHome })
    registerCapabilityApi(harness.ctx as never, { supervisor, aekHome })
    await supervisor.register('fury-like', {
      protocol: 'aek-capability/1',
      name: 'fury-like',
      version: '0.4.20',
      spdx: 'AGPL-3.0-or-later',
      source: 'https://example.com/fury-like',
      attach: { kind: 'mcp-stdio', command: 'fury-like', args: ['mcp'] },
    }, { installPolicy: 'managed' })

    const route = harness.routes.find(candidate => candidate.path === CAPABILITIES_API_PATH)
    expect(route).toBeDefined()
    const res = fakeRes()
    await route?.handler({ method: 'GET' } as never, res as never)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(String(res.ended)) as {
      protocol: string
      runtime: { defaultMode: string; choices: Record<string, string> }
      providers: {
        id: string
        state: string
        spdx: string | null
        compliance: string
        installPolicy: string | null
        runtime?: { mode: string; reason: string }
      }[]
    }
    expect(body.protocol).toBe('aek-capability/1')
    expect(body.providers).toHaveLength(1)
    expect(body.providers[0].id).toBe('fury-like')
    expect(body.providers[0].spdx).toBe('AGPL-3.0-or-later')
    expect(body.providers[0].installPolicy).toBe('managed')
    expect(body.providers[0].compliance).toContain('separate process')
    expect(body.providers[0].compliance).toContain('AGPL-3.0-or-later')
    expect(body.providers[0].compliance).toContain('not part of the AEK host process')
    // A registered provider is always out-of-process, and a strong-copyleft
    // license makes it license-forced.
    expect(body.providers[0].runtime).toEqual({ mode: 'isolate', reason: 'license-forced' })
    expect(body.runtime.defaultMode).toBe('share')
    expect(body.runtime.choices).toEqual({})
    harness.stopAll()
  })

  it('GET /api/aek/capabilities surfaces selective class-① runtime choices', async () => {
    const harness = fakeCtx()
    const supervisor = new CapabilitySupervisor({ aekHome })
    registerCapabilityApi(harness.ctx as never, { supervisor, aekHome })
    expect(writeRuntimeMode(aekHome, 'aek-websearch', 'isolate').ok).toBe(true)

    const route = harness.routes.find(candidate => candidate.path === CAPABILITIES_API_PATH)
    expect(route).toBeDefined()
    const res = fakeRes()
    await route?.handler({ method: 'GET' } as never, res as never)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(String(res.ended)) as { runtime: { choices: Record<string, string> } }
    expect(body.runtime.choices['aek-websearch']).toBe('isolate')
    harness.stopAll()
  })

  it('POST stop without confirm is 428 (the console write-confirm rule)', async () => {
    const harness = fakeCtx()
    const supervisor = new CapabilitySupervisor({ aekHome })
    registerCapabilityApi(harness.ctx as never, { supervisor })
    await supervisor.register('noop', {
      protocol: 'aek-capability/1',
      name: 'noop',
      version: '1',
      attach: { kind: 'jsonrpc-stdio', command: 'noop' },
    })
    const route = harness.routes.find(candidate => candidate.path === CAPABILITIES_STOP_API_PATH)
    expect(route).toBeDefined()

    const refused = await postJson(route?.handler as never, { id: 'noop' })
    expect(refused.statusCode).toBe(428)
    expect(JSON.parse(String(refused.ended)).code).toBe('confirm-required')

    const accepted = await postJson(route?.handler as never, { id: 'noop', confirm: true })
    expect(accepted.statusCode).toBe(200)
    expect(JSON.parse(String(accepted.ended)).state).toBe('stopped')
    harness.stopAll()
  })

  it('POST stop for an unknown id reports the failure, not a crash', async () => {
    const harness = fakeCtx()
    registerCapabilityApi(harness.ctx as never)
    const route = harness.routes.find(candidate => candidate.path === CAPABILITIES_STOP_API_PATH)
    expect(route).toBeDefined()
    const res = await postJson(route?.handler as never, { id: 'ghost', confirm: true })
    expect(res.statusCode).toBe(502)
    harness.stopAll()
  })

  it('GET marks a user-selected class-① isolate provider as user-select, not forced', async () => {
    const harness = fakeCtx()
    const supervisor = new CapabilitySupervisor({ aekHome })
    registerCapabilityApi(harness.ctx as never, { supervisor, aekHome, runtimePackages: [] })
    await supervisor.register('aek-websearch', {
      protocol: 'aek-capability/1',
      name: 'aek-websearch',
      version: '1.0.0',
      spdx: 'Apache-2.0',
      attach: { kind: 'jsonrpc-stdio', command: 'bin/isolate.mjs', cwd: '/opt/fixture/aek-websearch', args: [] },
    })
    expect(writeRuntimeMode(aekHome, 'aek-websearch', 'isolate').ok).toBe(true)

    const route = harness.routes.find(candidate => candidate.path === CAPABILITIES_API_PATH)
    const res = fakeRes()
    await route?.handler({ method: 'GET' } as never, res as never)
    const body = JSON.parse(String(res.ended)) as { providers: { id: string; runtime?: { mode: string; reason: string } }[] }
    const row = body.providers.find(candidate => candidate.id === 'aek-websearch')
    expect(row?.runtime).toEqual({ mode: 'isolate', reason: 'user-select' })
    harness.stopAll()
  })

  it('boots user-selected isolates through the injected supervisor at registration', async () => {
    const home = mkdtempSync(join(tmpdir(), 'aek-cap-boot-'))
    try {
      const harness = fakeCtx()
      const registered: string[] = []
      const started: string[] = []
      const fakeSupervisor = {
        register: async (id: string) => { registered.push(id); return { ok: true, problems: [] as string[] } },
        start: async (id: string) => { started.push(id); return { ok: true, state: 'running' as const } },
        statusAll: async () => ({}),
        stopAllNow: async () => undefined,
        stop: async () => ({ ok: false, problem: 'fake' }),
      }
      expect(writeRuntimeMode(home, 'aek-websearch', 'isolate').ok).toBe(true)
      registerCapabilityApi(harness.ctx as never, {
        supervisor: fakeSupervisor as never,
        aekHome: home,
        runtimePackages: [{ id: 'aek-websearch', manifest: { name: '@cheezmil/aek-websearch', version: '1.0.0', license: 'Apache-2.0', aek: { runtime: { share: true, isolate: { bin: 'bin/isolate.mjs' } } } }, packageDir: '/opt/fixture/aek-websearch' }],
      })
      // The boot is fire-and-forget; one macrotask later the calls are in.
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(registered).toEqual(['aek-websearch'])
      expect(started).toEqual(['aek-websearch'])
      harness.stopAll()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
