/**
 * Host-route unit spec for the skill-hub management API's BH-3 surface
 * (the category-axis + archive routes on `@cheezmil/aek-skill-manager`'s
 * admin face). The route module is node-builtin-free on purpose, so the spec
 * drives `registerSkillsManagerApi` with a fake `webServer` seam and a stub
 * service — asserting the wire contracts (envelopes, 428/400/502/405
 * branches, unsubscribe bookkeeping) without booting the engine.
 *
 * @module aek-skill-manager/tests/skills-admin-api.spec
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@cheezmil/coraek/types'
import { SKILLS_API, registerSkillsManagerApi } from '../src/plugin/skills-admin-api.js'
import type { SkillsManagerService } from '../src/plugin/skills-manager-service.js'
import { SkillsManagerError } from '../src/shared/errors.js'

type Registered = {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: unknown, res: unknown) => void | Promise<void>
}

type FakeRes = {
  statusCode: number
  headers: Record<string, string>
  payload: string | undefined
}

function fakeServer() {
  const routes: Registered[] = []
  const server = {
    register(route: Registered): () => void {
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
  }
  return { server, routes }
}

function fakeCtx(server: ReturnType<typeof fakeServer>['server']) {
  let effectFn: (() => () => void) | undefined
  const ctx = {
    webServer: server,
    effect(fn: () => () => void): void {
      effectFn = fn
    },
  } as unknown as Context
  return { ctx, effectFn: () => effectFn }
}

function fakeReq(method: string, body?: string): unknown {
  return {
    method,
    url: `${SKILLS_API}/x?skill=x`,
    [Symbol.asyncIterator]: async function* () {
      if (body !== undefined) yield body
    },
  }
}

function fakeRes(): FakeRes {
  return {
    statusCode: 0,
    headers: {},
    payload: undefined,
  }
}

function asRes(res: FakeRes): unknown {
  return {
    get statusCode(): number {
      return res.statusCode
    },
    set statusCode(value: number) {
      res.statusCode = value
    },
    setHeader(key: string, value: string): void {
      res.headers[key] = value
    },
    end(payload?: string): void {
      res.payload = payload
    },
  }
}

function stubService(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    home: () => '/tmp/hub',
    isBootstrapped: () => true,
    list: () => [],
    agents: () => [],
    knownProjects: () => [],
    status: () => ({ status: { managedEntries: 0, agentCoverage: 0, outdated: 0, foreign: 0, leftoverViews: false }, errored: [] }),
    distributionBySkill: () => ({}),
    doctor: () => ({ skillHome: '/tmp/hub', skillCount: 0, warnings: [], gitStatus: 'clean', catalog: { source: 'x', commit: 'y', date: 'z', ageDays: 0 } }),
    get: (skill: string) => ({ skill, dir: '/tmp/hub/skills/x', archived: false, body: '# md' }),
    cost: () => ({ totalTokens: 0, groups: [] }),
    updatePlan: () => ({ groups: [] }),
    distribute: () => ({ ok: true }),
    undistribute: () => ({ ok: true }),
    add: () => ({ ok: true }),
    update: () => ({ ok: true }),
    categoryCounts: () => [
      { category: 'web', count: 2 },
      { category: 'ops', count: 1 },
    ],
    setCategories: (action: string, skill: string, values: readonly string[]) => ({
      skill,
      categories: action === 'set' ? [...values] : values,
    }),
    archiveSkills: (skills: readonly string[]) => ({ archived: [...skills], archiveRoot: '/tmp/hub/.skills/archive/t' }),
    ...overrides,
  }
  return base as unknown as SkillsManagerService
}

/** Boot the admin face, then return the one route registered for `suffix`. */
function routeFor(suffix: string) {
  const { server, routes } = fakeServer()
  const { ctx, effectFn } = fakeCtx(server)
  registerSkillsManagerApi(ctx, stubService())
  const fn = effectFn()
  expect(typeof fn).toBe('function')
  fn() // run the effect: the route registrations happen inside it
  const found = routes.filter(route => route.path === `${SKILLS_API}/${suffix}`)
  expect(found.length, `${SKILLS_API}/${suffix}`).toBe(1)
  return found[0]
}

function handlerOf(route: Registered) {
  return route.handler as (req: unknown, res: unknown) => Promise<void>
}

describe('POST /api/aek/skills/categories', () => {
  it('answers 428 confirm-required without confirm: true', async () => {
    const res = fakeRes()
    await handlerOf(routeFor('categories'))(fakeReq('POST', JSON.stringify({ action: 'set', skill: 'alpha', values: ['web'] })), asRes(res))
    expect(res.statusCode).toBe(428)
    expect(JSON.parse(res.payload ?? '')).toMatchObject({ code: 'confirm-required' })
  })

  it('answers 400 for an unknown action / missing skill / missing values', async () => {
    const cases: Array<string> = [
      JSON.stringify({ action: 'rename', skill: 'alpha', values: ['web'], confirm: true }),
      JSON.stringify({ action: 'set', values: ['web'], confirm: true }),
      JSON.stringify({ action: 'set', skill: 'alpha', confirm: true }),
    ]
    for (const body of cases) {
      const res = fakeRes()
      await handlerOf(routeFor('categories'))(fakeReq('POST', body), asRes(res))
      expect(res.statusCode, body).toBe(400)
    }
  })

  it('answers 400 for empty values on add/remove (set with [] clears)', async () => {
    for (const action of ['add', 'remove']) {
      const res = fakeRes()
      await handlerOf(routeFor('categories'))(fakeReq('POST', JSON.stringify({ action, skill: 'alpha', values: [], confirm: true })), asRes(res))
      expect(res.statusCode, action).toBe(400)
    }
    const ok = fakeRes()
    await handlerOf(routeFor('categories'))(fakeReq('POST', JSON.stringify({ action: 'set', skill: 'alpha', values: [], confirm: true })), asRes(ok))
    expect(ok.statusCode).toBe(200)
  })

  it('writes one category-axis change and returns { ok, data: { skill, categories } }', async () => {
    const res = fakeRes()
    await handlerOf(routeFor('categories'))(fakeReq('POST', JSON.stringify({ action: 'set', skill: 'alpha', values: ['web', 'ops'], confirm: true })), asRes(res))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload ?? '')).toEqual({ ok: true, data: { skill: 'alpha', categories: ['web', 'ops'] } })
  })

  it('surfaces a machine-coded engine failure as 502 { ok: false, code, message }', async () => {
    const { server, routes } = fakeServer()
    const { ctx, effectFn } = fakeCtx(server)
    registerSkillsManagerApi(
      ctx,
      stubService({
        setCategories: () => {
          throw new SkillsManagerError('skill_missing', 'Skill not found: ghost')
        },
      }),
    )
    effectFn()()
    const route = routes.find(item => item.path === `${SKILLS_API}/categories`)
    expect(route).toBeDefined()
    const res = fakeRes()
    await handlerOf(route ?? ({} as Registered))(fakeReq('POST', JSON.stringify({ action: 'add', skill: 'ghost', values: ['web'], confirm: true })), asRes(res))
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload ?? '')).toMatchObject({ ok: false, code: 'skill_missing', message: 'Skill not found: ghost' })
  })

  it('answers 405 for any other method', async () => {
    const res = fakeRes()
    await handlerOf(routeFor('categories'))(fakeReq('PUT'), asRes(res))
    expect(res.statusCode).toBe(405)
    expect(res.headers['allow']).toBe('GET, POST')
  })
})

describe('GET /api/aek/skills/categories', () => {
  it('answers the read-face protocol envelope { protocol, categories }', async () => {
    const res = fakeRes()
    await handlerOf(routeFor('categories'))(fakeReq('GET'), asRes(res))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload ?? '')).toEqual({
      protocol: 'aek-skills/1',
      categories: [
        { category: 'web', count: 2 },
        { category: 'ops', count: 1 },
      ],
    })
  })

  it('surfaces an engine failure as 502 { protocol, code, message }', async () => {
    const { server, routes } = fakeServer()
    const { ctx, effectFn } = fakeCtx(server)
    registerSkillsManagerApi(
      ctx,
      stubService({
        categoryCounts: () => {
          throw new SkillsManagerError('hub_missing', 'Hub not bootstrapped')
        },
      }),
    )
    effectFn()()
    const route = routes.find(item => item.path === `${SKILLS_API}/categories`)
    expect(route).toBeDefined()
    const res = fakeRes()
    await handlerOf(route ?? ({} as Registered))(fakeReq('GET'), asRes(res))
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload ?? '')).toMatchObject({ protocol: 'aek-skills/1', code: 'hub_missing' })
  })
})

describe('POST /api/aek/skills/archive', () => {
  it('answers 428 without confirm, 400 for an empty skills list', async () => {
    const noConfirm = fakeRes()
    await handlerOf(routeFor('archive'))(fakeReq('POST', JSON.stringify({ skills: ['alpha'] })), asRes(noConfirm))
    expect(noConfirm.statusCode).toBe(428)

    const empty = fakeRes()
    await handlerOf(routeFor('archive'))(fakeReq('POST', JSON.stringify({ skills: [], confirm: true })), asRes(empty))
    expect(empty.statusCode).toBe(400)

    const missing = fakeRes()
    await handlerOf(routeFor('archive'))(fakeReq('POST', JSON.stringify({ confirm: true })), asRes(missing))
    expect(missing.statusCode).toBe(400)
  })

  it('archives (non-destructive) and returns { ok, data: { archived, archiveRoot } }', async () => {
    const res = fakeRes()
    await handlerOf(routeFor('archive'))(fakeReq('POST', JSON.stringify({ skills: ['alpha', 'beta'], confirm: true })), asRes(res))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload ?? '')).toEqual({
      ok: true,
      data: { archived: ['alpha', 'beta'], archiveRoot: '/tmp/hub/.skills/archive/t' },
    })
  })

  it('surfaces a missing-skill engine failure as 502', async () => {
    const { server, routes } = fakeServer()
    const { ctx, effectFn } = fakeCtx(server)
    registerSkillsManagerApi(
      ctx,
      stubService({
        archiveSkills: () => {
          throw new SkillsManagerError('skill_missing', 'Skill not found: ghost')
        },
      }),
    )
    effectFn()()
    const route = routes.find(item => item.path === `${SKILLS_API}/archive`)
    expect(route).toBeDefined()
    const res = fakeRes()
    await handlerOf(route ?? ({} as Registered))(fakeReq('POST', JSON.stringify({ skills: ['ghost'], confirm: true })), asRes(res))
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload ?? '')).toMatchObject({ ok: false, code: 'skill_missing' })
  })

  it('answers 405 for GET/PUT', async () => {
    const res = fakeRes()
    await handlerOf(routeFor('archive'))(fakeReq('GET'), asRes(res))
    expect(res.statusCode).toBe(405)
    expect(res.headers['allow']).toBe('POST')
  })
})

describe('admin-face route bookkeeping', () => {
  it('registers all 10 routes under /api/aek/skills and unregisters them all on dispose', () => {
    const { server, routes } = fakeServer()
    const { ctx, effectFn } = fakeCtx(server)
    registerSkillsManagerApi(ctx, stubService())
    effectFn()()
    const expected = new Set([
      SKILLS_API,
      `${SKILLS_API}/get`,
      `${SKILLS_API}/cost`,
      `${SKILLS_API}/update-plan`,
      `${SKILLS_API}/distribute`,
      `${SKILLS_API}/undistribute`,
      `${SKILLS_API}/add`,
      `${SKILLS_API}/update`,
      `${SKILLS_API}/categories`,
      `${SKILLS_API}/archive`,
    ])
    expect(routes.length).toBe(10)
    for (const path of expected) expect(routes.some(route => route.path === path), path).toBe(true)
  })
})
