import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CapabilitySupervisor } from '../external-supervisor.mjs'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fixture-provider.mjs')

/**
 * An env that is guaranteed to resolve the running `node` binary, so a
 * relative `command: 'node'` spawns this exact node regardless of the harness
 * that launched the test.
 */
const NODE_DIR = dirname(process.execPath)
const TEST_ENV = { ...process.env, PATH: `${NODE_DIR}${delimiter}${process.env.PATH ?? ''}` }

/** A fresh throwaway AEK home. */
function freshHome(parent: string): string {
  const root = mkdtempSync(join(parent, 'case-'))
  mkdirSync(join(root, 'logs'), { recursive: true })
  return root
}

/** A legal stdio descriptor for the fixture provider (relative `node`). */
function fixtureDescriptor(kind: 'jsonrpc-stdio' | 'mcp-stdio' | 'cli' | 'http', name = 'fixture') {
  return {
    protocol: 'aek-capability/1',
    name,
    version: '0.0.1',
    spdx: 'MIT',
    attach: kind === 'http'
      ? { kind, command: 'node', args: [FIXTURE] as string[] }
      : { kind, command: 'node', args: [FIXTURE] },
  }
}

describe('CapabilitySupervisor state store', () => {
  let root: string
  beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'aek-cap-')) })
  afterAll(() => { rmSync(root, { recursive: true, force: true }) })

  it('is empty on a missing store and atomic on write', async () => {
    const supervisor = new CapabilitySupervisor({ aekHome: freshHome(root), env: TEST_ENV })
    expect(await supervisor.list()).toEqual({})
    const result = await supervisor.register('fixture', fixtureDescriptor('jsonrpc-stdio'))
    expect(result.ok).toBe(true)
    expect(await supervisor.list()).toHaveProperty('fixture')
    expect(existsSync(supervisor.storePath())).toBe(true)
  })

  it('rejects an invalid descriptor at registration', async () => {
    const supervisor = new CapabilitySupervisor({ aekHome: freshHome(root), env: TEST_ENV })
    const result = await supervisor.register('bad', {
      protocol: 'aek-capability/1',
      name: 'x',
      version: '1',
      attach: { kind: 'shared-memory', command: 'node' },
    })
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('attach.kind')
  })

  it('unregister removes the entry and stops a live child first', async () => {
    const supervisor = new CapabilitySupervisor({ aekHome: freshHome(root), env: TEST_ENV })
    await supervisor.register('fixture', fixtureDescriptor('jsonrpc-stdio'))
    await supervisor.start('fixture')
    const gone = await supervisor.unregister('fixture')
    expect(gone.ok).toBe(true)
    expect(await supervisor.status('fixture')).toBeNull()
  })
})

describe('CapabilitySupervisor lifecycle', () => {
  let root: string
  let home: string
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'aek-cap-'))
    home = freshHome(root)
  })
  afterAll(() => { rmSync(root, { recursive: true, force: true }) })

  it('spawns a stdio provider, tracks its pid, stops it SIGTERM-only', async () => {
    const supervisor = new CapabilitySupervisor({ aekHome: home, env: TEST_ENV })
    await supervisor.register('fixture', fixtureDescriptor('jsonrpc-stdio'))
    const started = await supervisor.start('fixture')
    expect(started.ok).toBe(true)
    const running = await supervisor.status('fixture')
    expect(running?.state).toBe('running')
    expect(typeof running?.pid).toBe('number')
    expect(CapabilitySupervisor.isPidAlive(running?.pid ?? -1)).toBe(true)

    const stopped = await supervisor.stop('fixture')
    expect(stopped.ok).toBe(true)
    expect(stopped.state).toBe('stopped')
    expect(CapabilitySupervisor.isPidAlive(running?.pid ?? -1)).toBe(false)
  })

  it('adopts a live recorded instance instead of spawning a second one', async () => {
    const supervisor = new CapabilitySupervisor({ aekHome: home, env: TEST_ENV })
    await supervisor.register('fixture', fixtureDescriptor('jsonrpc-stdio'))
    await supervisor.start('fixture')
    const first = await supervisor.status('fixture')
    const second = await supervisor.start('fixture')
    expect(second.ok).toBe(true)
    expect(second.state).toBe('running')
    expect((await supervisor.status('fixture'))?.pid).toBe(first?.pid)
    await supervisor.stop('fixture')
  })

  it('attaches an http endpoint without spawning, and refuses to kill it', async () => {
    const port = 16000 + Math.floor(Math.random() * 200)
    const descriptor = fixtureDescriptor('http')
    delete (descriptor.attach as Record<string, unknown>).command
    delete (descriptor.attach as Record<string, unknown>).args
    descriptor.attach.endpoint = `http://127.0.0.1:${port}`
    const server = createServer((req, res) => {
      if (req.url === '/.well-known/aek-capabilities.json') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(descriptor))
        return
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))

    try {
      const supervisor = new CapabilitySupervisor({ aekHome: home, env: TEST_ENV })
      await supervisor.register('httpd', descriptor)
      const started = await supervisor.start('httpd')
      expect(started.ok).toBe(true)
      expect((await supervisor.status('httpd'))?.startedBy).toBe('external')

      const stopResult = await supervisor.stop('httpd')
      expect(stopResult.ok).toBe(false)
      expect(stopResult.problem).toContain('never kill')
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('reports a failed start when the child exits immediately', async () => {
    const supervisor = new CapabilitySupervisor({ aekHome: home, env: TEST_ENV })
    const descriptor = {
      protocol: 'aek-capability/1',
      name: 'fixture',
      version: '0.0.1',
      attach: { kind: 'jsonrpc-stdio', command: 'node', args: [join(dirname(FIXTURE), 'does-not-exist.mjs')] },
    }
    await supervisor.register('dying', descriptor)
    const started = await supervisor.start('dying')
    expect(started.ok).toBe(false)
    expect(started.state).toBe('failed')
  })

  it('stopAllNow signals in-memory children synchronously', async () => {
    const supervisor = new CapabilitySupervisor({ aekHome: home, env: TEST_ENV })
    await supervisor.register('fixture', fixtureDescriptor('jsonrpc-stdio'))
    await supervisor.start('fixture')
    const pid = (await supervisor.status('fixture'))?.pid
    supervisor.stopAllNow()
    let alive = true
    for (let i = 0; i < 50 && alive; i += 1) {
      alive = CapabilitySupervisor.isPidAlive(pid ?? -1)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    expect(alive).toBe(false)
  })
})

describe('CapabilitySupervisor discovery', () => {
  let root: string
  let home: string
  let supervisor: CapabilitySupervisor
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'aek-cap-'))
    home = freshHome(root)
    supervisor = new CapabilitySupervisor({ aekHome: home, env: TEST_ENV })
  })
  afterAll(async () => {
    await supervisor.disposeAll()
    rmSync(root, { recursive: true, force: true })
  })

  it('live-describes a jsonrpc provider via aek.describe', async () => {
    await supervisor.register('fixture', fixtureDescriptor('jsonrpc-stdio'))
    const result = await supervisor.describe('fixture')
    expect(result.ok).toBe(true)
    expect(result.source).toBe('live')
    expect(result.descriptor?.spdx).toBe('MIT')
    expect(result.descriptor?.source).toBe('https://example.com/fixture-provider')
  })

  it('live-describes a CLI provider via --describe (log-prefixed envelope)', async () => {
    await supervisor.register('clifix', { ...fixtureDescriptor('cli'), name: 'clifix' })
    const result = await supervisor.describe('clifix')
    expect(result.ok).toBe(true)
    expect(result.source).toBe('live')
    expect(result.descriptor?.name).toBe('fixture')
  })

  it('synthesises an MCP descriptor from initialize', async () => {
    await supervisor.register('mcpx', fixtureDescriptor('mcp-stdio'))
    const result = await supervisor.describe('mcpx')
    expect(result.ok).toBe(true)
    expect(result.source).toBe('live')
    expect(result.descriptor?.name).toBe('fixture')
    // License is manifest-asserted, not MCP-asserted.
    expect(result.descriptor?.spdx).toBeUndefined()
  })

  it('health-checks a running jsonrpc provider via aek.ping', async () => {
    await supervisor.register('fixture', fixtureDescriptor('jsonrpc-stdio'))
    await supervisor.start('fixture')
    try {
      const health = await supervisor.health('fixture')
      expect(health.healthy).toBe(true)
      expect(health.detail).toContain('ping answered')
    } finally {
      await supervisor.stop('fixture')
    }
  })

  it('compliance lines render from provider-asserted data only', async () => {
    await supervisor.register('fixture', fixtureDescriptor('jsonrpc-stdio'))
    const entry = await supervisor.status('fixture')
    expect(entry).not.toBeNull()
    const line = CapabilitySupervisor.complianceLine(entry as NonNullable<typeof entry>)
    expect(line).toContain('separate process')
    expect(line).toContain('MIT')
    expect(line).toContain('not part of the AEK host process')
  })
})
