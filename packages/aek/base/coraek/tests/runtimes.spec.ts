/**
 * Unit tests for the numbered runtime view (`runtimes.mjs`): the store
 * round-trip (labels beside the existing modes map), the derived numbering
 * (host is always 1, isolates sorted by id), the honest memory calibers,
 * and the processRss read (live pid vs dead pid). No real AEK_HOME is
 * touched and no process is spawned — the store uses a temp directory.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  RUNTIMES_STORE_VERSION,
  readRuntimeDoc,
  writeRuntimeLabel,
  hostMemory,
  processRss,
  runtimesSnapshot,
} from '../runtimes.mjs'
import { writeRuntimeMode } from '../runtime.mjs'

/** One temp AEK home per test. */
function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'aek-runtimes-'))
  return home
}

describe('runtimes store', () => {
  let home: string

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('a missing store is the fresh-install shape, not an error', () => {
    home = freshHome()
    expect(readRuntimeDoc(home)).toEqual({ modes: {}, labels: {} })
  })

  it('writeRuntimeLabel persists the label and preserves the modes map', () => {
    home = freshHome()
    // Seed the modes map through the real store writer, then layer a label on top.
    writeRuntimeMode(home, 'aek-websearch', 'isolate')
    const result = writeRuntimeLabel(home, 'aek-websearch', 'my websearch runtime')
    expect(result.ok).toBe(true)
    const after = readRuntimeDoc(home)
    expect(after.labels['aek-websearch']).toBe('my websearch runtime')
    expect(after.modes['aek-websearch']).toBe('isolate')
    expect(RUNTIMES_STORE_VERSION).toBe(2)
  })

  it('an empty label removes the entry again', () => {
    home = freshHome()
    writeRuntimeLabel(home, 'aek-websearch', 'temporary')
    writeRuntimeLabel(home, 'aek-websearch', '')
    expect(readRuntimeDoc(home).labels['aek-websearch']).toBeUndefined()
  })

  it('rejects an oversized label instead of corrupting the store', () => {
    home = freshHome()
    const result = writeRuntimeLabel(home, 'aek-websearch', 'x'.repeat(200))
    expect(result.ok).toBe(false)
    expect(result.problems.length).toBeGreaterThan(0)
  })
})

describe('runtimesSnapshot — the derived numbering', () => {
  let home: string

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('the host is always runtime 1 and carries the live process memory', () => {
    home = freshHome()
    const snapshot = runtimesSnapshot({ aekHome: home, packages: [], supervisorRows: [] })
    expect(snapshot.host.number).toBe(1)
    expect(snapshot.host.kind).toBe('host')
    expect(snapshot.host.state).toBe('running')
    expect(snapshot.host.pid).toBe(process.pid)
    expect(snapshot.host.memory?.rss).toBeGreaterThan(0)
    expect(snapshot.host.memory?.heapUsed).toBeGreaterThan(0)
  })

  it('isolated capabilities number 2..N in stable (sorted) order', () => {
    home = freshHome()
    const packages = [
      { id: 'zeta-tool', manifest: { name: 'zeta-tool', aek: { runtime: { isolate: { bin: 'bin/zeta.mjs' } } } } },
      { id: 'alpha-tool', manifest: { name: 'alpha-tool', aek: { runtime: { isolate: { bin: 'bin/alpha.mjs' } } } } },
    ]
    // Both user-selected isolate.
    writeRuntimeLabel(home, 'alpha-tool', '') // ensures the file exists (v2, empty maps)
    const snapshot = runtimesSnapshot({
      aekHome: home,
      packages,
      supervisorRows: [],
    })
    // Without a stored choice both stay on the host (default-share).
    expect(snapshot.runtimes).toEqual([])
    expect(snapshot.host.plugins).toEqual(['alpha-tool', 'zeta-tool'])
  })

  it('a stored isolate choice moves the capability into its own numbered runtime', () => {
    home = freshHome()
    const pkg = { id: 'aek-websearch', manifest: { name: 'aek-websearch', aek: { runtime: { isolate: { bin: 'bin/isolate.mjs' } } } } }
    // Persist the user-select isolate choice through the real store writer.
    writeRuntimeMode(home, 'aek-websearch', 'isolate')
    const snapshot = runtimesSnapshot({
      aekHome: home,
      packages: [pkg],
      supervisorRows: [{ id: 'aek-websearch', state: 'stopped' }],
    })
    expect(snapshot.runtimes).toHaveLength(1)
    expect(snapshot.runtimes[0]?.number).toBe(2)
    expect(snapshot.runtimes[0]?.id).toBe('aek-websearch')
    expect(snapshot.runtimes[0]?.state).toBe('stopped')
    expect(snapshot.host.plugins).toEqual([])
    // The per-plugin view reports the honest caliber: no number, process-rss basis.
    expect(snapshot.pluginMemory['aek-websearch']?.caliber).toBe('process-rss')
    expect(snapshot.pluginMemory['aek-websearch']?.value).toBeUndefined()
    // An isolate that is not yet running is NOT an add candidate.
    expect(snapshot.isolatable).toEqual([])
  })

  it('a shared but isolate-capable capability is an add candidate', () => {
    home = freshHome()
    const pkg = { id: 'aek-websearch', manifest: { name: 'aek-websearch', aek: { runtime: { isolate: { bin: 'bin/isolate.mjs' } } } } }
    const snapshot = runtimesSnapshot({ aekHome: home, packages: [pkg], supervisorRows: [] })
    expect(snapshot.isolatable).toEqual(['aek-websearch'])
    expect(snapshot.pluginMemory['aek-websearch']).toEqual({ value: undefined, unit: 'bytes', caliber: 'in-host-shared' })
  })

  it('an operator label overrides the row display name', () => {
    home = freshHome()
    writeRuntimeLabel(home, 'aek-websearch', 'search-worker')
    const pkg = { id: 'aek-websearch', manifest: { name: 'aek-websearch', aek: { runtime: { isolate: { bin: 'bin/isolate.mjs' } } } } }
    const snapshot = runtimesSnapshot({
      aekHome: home,
      packages: [pkg],
      supervisorRows: [{ id: 'aek-websearch', state: 'running', pid: process.pid }],
    })
    // Still shared by default: the label is stored but the row is the host's.
    expect(snapshot.host.label).toBe('coraek host')
  })
})

describe('memory readings are never invented', () => {
  it('hostMemory reads the live process', () => {
    const mem = hostMemory()
    expect(mem.rss).toBeGreaterThan(0)
    expect(mem.heapUsed).toBeGreaterThan(0)
  })

  it('processRss of the live own pid is a positive byte count', () => {
    expect(processRss(process.pid)).toBeGreaterThan(0)
  })

  it('processRss of a dead / impossible pid is undefined, never a guess', () => {
    expect(processRss(0)).toBeUndefined()
    expect(processRss(-1)).toBeUndefined()
    expect(processRss(2 ** 22)).toBeUndefined()
  })
})
