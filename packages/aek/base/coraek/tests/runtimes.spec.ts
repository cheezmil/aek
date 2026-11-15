/**
 * Unit tests for the numbered runtime view (`runtimes.mjs`): the v2 store
 * round-trip (X2 multi-tenant document: modes + assignments + labels keyed by
 * RUNTIME id + explicit containers), the 0-based derived numbering, the
 * honest memory calibers, and the processRss read. No real AEK_HOME is
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
  runtimesV2MigrationWrites,
} from '../runtimes.mjs'
import { writeRuntimeMode, hostPackageDir, readRuntimeDocV2, writeRuntimeDocV2 } from '../runtime.mjs'

/** One temp AEK home per test. */
function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'aek-runtimes-'))
  return home
}

describe('runtimes store (X2 v2 document)', () => {
  let home: string

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('a missing store is the fresh-install shape, not an error', () => {
    home = freshHome()
    expect(readRuntimeDoc(home)).toEqual({ version: 3, modes: {}, assignments: {}, labels: {}, containers: {} })
  })

  it('writeRuntimeLabel persists a RUNTIME label and preserves the rest of the doc', () => {
    home = freshHome()
    // Seed the doc through the real store writer (isolate → auto assignment
    // to runtime1), then layer a label on the RUNTIME key.
    writeRuntimeMode(home, 'aek-websearch', 'isolate')
    const result = writeRuntimeLabel(home, 'runtime1', 'my websearch runtime')
    expect(result.ok).toBe(true)
    const after = readRuntimeDoc(home)
    expect(after.labels['runtime1']).toBe('my websearch runtime')
    expect(after.modes['aek-websearch']).toBe('isolate')
    expect(after.assignments['aek-websearch']).toBe('runtime1')
    expect(RUNTIMES_STORE_VERSION).toBe(3)
  })

  it('an empty label removes the entry again', () => {
    home = freshHome()
    writeRuntimeLabel(home, 'runtime1', 'temporary')
    writeRuntimeLabel(home, 'runtime1', '')
    expect(readRuntimeDoc(home).labels['runtime1']).toBeUndefined()
  })

  it('rejects an oversized label instead of corrupting the store', () => {
    home = freshHome()
    const result = writeRuntimeLabel(home, 'runtime1', 'x'.repeat(200))
    expect(result.ok).toBe(false)
    expect(result.problems.length).toBeGreaterThan(0)
  })
})

describe('runtimesSnapshot — the derived numbering', () => {
  let home: string

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('the host is always runtime 0 and carries the live process memory', () => {
    home = freshHome()
    const snapshot = runtimesSnapshot({ aekHome: home, packages: [], supervisorRows: [] })
    expect(snapshot.host.number).toBe(0)
    expect(snapshot.host.id).toBe('runtime0')
    expect(snapshot.host.kind).toBe('host')
    expect(snapshot.host.label).toBe('runtime0')
    expect(snapshot.host.state).toBe('running')
    expect(snapshot.host.pid).toBe(process.pid)
    expect(snapshot.host.memory?.rss).toBeGreaterThan(0)
    expect(snapshot.host.memory?.heapUsed).toBeGreaterThan(0)
  })

  it('isolated containers number 1..N (X2: one process may host SEVERAL capabilities)', () => {
    home = freshHome()
    const packages = [
      { id: 'zeta-tool', manifest: { name: 'zeta-tool', main: './lib/index.js', aek: { runtime: { isolate: { bin: 'bin/zeta.mjs' } } } } },
      { id: 'alpha-tool', manifest: { name: 'alpha-tool', main: './lib/index.js', aek: { runtime: { isolate: { bin: 'bin/alpha.mjs' } } } } },
    ]
    writeRuntimeLabel(home, 'alpha-tool', '') // ensures the file exists (v3, empty maps)
    const snapshot = runtimesSnapshot({
      aekHome: home,
      packages,
      supervisorRows: [],
    })
    // Without a stored choice both stay on the host (default-share).
    expect(snapshot.runtimes).toEqual([])
    expect(snapshot.host.plugins).toEqual(['alpha-tool', 'zeta-tool'])
  })

  it('a stored isolate choice moves the capability into its own numbered runtime (X2: keyed by the runtime id)', () => {
    home = freshHome()
    const pkg = { id: 'aek-websearch', manifest: { name: 'aek-websearch', main: './lib/index.js', aek: { runtime: { isolate: { bin: 'bin/isolate.mjs' } } } } }
    // Persist the user-select isolate choice through the real store writer
    // (v2: this also auto-assigns the capability to the next free runtime).
    writeRuntimeMode(home, 'aek-websearch', 'isolate')
    const snapshot = runtimesSnapshot({
      aekHome: home,
      packages: [pkg],
      // Pre-migration v1 rows are still answered for a single-member lookup.
      supervisorRows: [{ id: 'aek-websearch', state: 'stopped' }],
    })
    expect(snapshot.runtimes).toHaveLength(1)
    expect(snapshot.runtimes[0]?.number).toBe(1)
    expect(snapshot.runtimes[0]?.id).toBe('runtime1')
    expect(snapshot.runtimes[0]?.label).toBe('runtime1')
    expect(snapshot.runtimes[0]?.state).toBe('stopped')
    expect(snapshot.runtimes[0]?.plugins).toEqual(['aek-websearch'])
    expect(snapshot.host.plugins).toEqual([])
    // The per-plugin view reports the honest caliber: the container's reading,
    // undefined while stopped, plus the container id.
    expect(snapshot.pluginMemory['aek-websearch']?.caliber).toBe('process-rss')
    expect(snapshot.pluginMemory['aek-websearch']?.value).toBeUndefined()
    expect(snapshot.pluginMemory['aek-websearch']?.runtimeId).toBe('runtime1')
    // An isolate that is not yet running is NOT an add candidate.
    expect(snapshot.isolatable).toEqual([])
  })

  it('two stored isolates in ONE explicit container answer one process (X2 multi-tenant)', () => {
    home = freshHome()
    const { readRuntimeDocV2, writeRuntimeDocV2 } = require('../runtime.mjs')
    const a = { id: 'alpha-tool', manifest: { name: 'alpha-tool', main: './lib/index.js', aek: { runtime: { isolate: { bin: 'bin/alpha.mjs' } } } } }
    const b = { id: 'zeta-tool', manifest: { name: 'zeta-tool', main: './lib/index.js', aek: { runtime: { isolate: { bin: 'bin/zeta.mjs' } } } } }
    const doc = readRuntimeDocV2(home)
    doc.modes['alpha-tool'] = 'isolate'
    doc.modes['zeta-tool'] = 'isolate'
    doc.assignments['alpha-tool'] = 'runtime1'
    doc.assignments['zeta-tool'] = 'runtime1'
    doc.containers['runtime1'] = true
    doc.labels['runtime1'] = 'search + prompts'
    writeRuntimeDocV2(home, doc)
    const snapshot = runtimesSnapshot({
      aekHome: home,
      packages: [a, b],
      supervisorRows: [{ id: 'runtime1', state: 'running', pid: process.pid }],
    })
    expect(snapshot.runtimes).toHaveLength(1)
    expect(snapshot.runtimes[0]?.id).toBe('runtime1')
    expect(snapshot.runtimes[0]?.label).toBe('search + prompts')
    expect(snapshot.runtimes[0]?.plugins).toEqual(['alpha-tool', 'zeta-tool'])
    expect(snapshot.host.plugins).toEqual([])
    // Both plugins report the SAME container process reading (never split).
    expect(snapshot.pluginMemory['alpha-tool']?.runtimeId).toBe('runtime1')
    expect(snapshot.pluginMemory['zeta-tool']?.runtimeId).toBe('runtime1')
  })

  it('a shared but isolate-capable capability is an add candidate', () => {
    home = freshHome()
    const pkg = { id: 'aek-websearch', manifest: { name: 'aek-websearch', main: './lib/index.js', aek: { runtime: { isolate: { bin: 'bin/isolate.mjs' } } } } }
    const snapshot = runtimesSnapshot({ aekHome: home, packages: [pkg], supervisorRows: [] })
    expect(snapshot.isolatable).toEqual(['aek-websearch'])
    expect(snapshot.pluginMemory['aek-websearch']).toEqual({ value: undefined, unit: 'bytes', caliber: 'in-host-shared' })
  })

  it('an undeclared class ① capability with a JS entry is an add candidate automatically (T round)', () => {
    home = freshHome()
    const pkg = {
      id: 'aek-quick-prompt',
      manifest: { name: '@cheezmil/aek-quick-prompt', main: './lib/index.js', aek: { distribution: 'A2' } },
      bucket: 'plugins',
    }
    const snapshot = runtimesSnapshot({ aekHome: home, packages: [pkg], supervisorRows: [] })
    // No aek.runtime.isolate declaration anywhere: the auto-scope admits it.
    expect(snapshot.isolatable).toEqual(['aek-quick-prompt'])
    // The bucket rides on the per-plugin memory view entry.
    expect(snapshot.pluginMemory['aek-quick-prompt']).toEqual({ value: undefined, unit: 'bytes', caliber: 'in-host-shared', bucket: 'plugins' })
  })

  it('a bundle package (patch-yaml main, no JS part) is not an add candidate', () => {
    home = freshHome()
    const pkg = { id: 'aek-for-dsh', manifest: { name: 'aek-for-dsh', main: 'cordis.patch.yml', aek: { type: 'dsh-bundle' } } }
    const snapshot = runtimesSnapshot({ aekHome: home, packages: [pkg], supervisorRows: [] })
    expect(snapshot.isolatable).toEqual([])
  })

  it('the host package is never an add candidate (self-exclusion)', () => {
    home = freshHome()
    const pkg = {
      id: 'coraek',
      manifest: { name: '@cheezmil/coraek', main: './lib/index.js', aek: {} },
      packageDir: hostPackageDir(),
      bucket: 'base',
    }
    const snapshot = runtimesSnapshot({ aekHome: home, packages: [pkg], supervisorRows: [] })
    expect(snapshot.isolatable).toEqual([])
  })

  it('the snapshot carries the host platform for OS-specific memory wording', () => {
    home = freshHome()
    const snapshot = runtimesSnapshot({ aekHome: home, packages: [], supervisorRows: [] })
    expect(snapshot.platform).toBe(process.platform)
  })

  it('an operator label overrides the row display name (X2: the RUNTIME key)', () => {
    home = freshHome()
    const pkg = { id: 'aek-websearch', manifest: { name: 'aek-websearch', aek: { runtime: { isolate: { bin: 'bin/isolate.mjs' } } } } }
    writeRuntimeMode(home, 'aek-websearch', 'isolate')
    writeRuntimeLabel(home, 'runtime1', 'search-worker')
    const snapshot = runtimesSnapshot({
      aekHome: home,
      packages: [pkg],
      supervisorRows: [{ id: 'runtime1', state: 'running', pid: process.pid }],
    })
    expect(snapshot.runtimes[0]?.id).toBe('runtime1')
    expect(snapshot.runtimes[0]?.label).toBe('search-worker')
    // The host row's default label is its own id (never the legacy 'coraek host').
    expect(snapshot.host.label).toBe('runtime0')
  })
})

describe('runtimesV2MigrationWrites (schema step 4)', () => {
  it('rewrites a v1/v2 store into the multi-tenant document and re-keys the supervisor rows', () => {
    const modesDoc = JSON.stringify({
      version: 2,
      modes: { 'aek-prompt-manager': 'isolate', 'aek-websearch': 'isolate', 'other': 'share' },
      labels: { 'aek-prompt-manager': 'prompt worker', 'coraek-host': 'the big one' },
    })
    const capsDoc = JSON.stringify({
      version: 1,
      providers: {
        'aek-prompt-manager': { startedBy: 'boot' },
        'aek-websearch': { startedBy: 'boot' },
      },
    })
    const writes = runtimesV2MigrationWrites({
      runtimeModesText: modesDoc,
      runtimeModesPath: '/tmp/fixture/runtime-modes.json',
      capabilitiesText: capsDoc,
      capabilitiesPath: '/tmp/fixture/capabilities.json',
    })
    // Two files travel together: the modes doc and the provider re-keying.
    expect(writes).toHaveLength(2)
    const modesWrite = writes.find(w => w.file.endsWith('runtime-modes.json'))
    const capsWrite = writes.find(w => w.file.endsWith('capabilities.json'))
    const modesAfter = JSON.parse(modesWrite?.after ?? 'null')
    expect(modesAfter.version).toBe(3)
    // Sorted isolate capabilities → runtime1, runtime2; labels re-keyed to
    // the RUNTIME ids, the host label travels to runtime0.
    expect(modesAfter.assignments).toEqual({ 'aek-prompt-manager': 'runtime1', 'aek-websearch': 'runtime2' })
    expect(modesAfter.labels['runtime1']).toBe('prompt worker')
    expect(modesAfter.labels['runtime0']).toBe('the big one')
    expect(modesAfter.labels['aek-prompt-manager']).toBeUndefined()
    // The provider rows move onto their runtime keys.
    const capsAfter = JSON.parse(capsWrite?.after ?? 'null')
    expect(capsAfter.providers.runtime1?.startedBy).toBe('boot')
    expect(capsAfter.providers.runtime2?.startedBy).toBe('boot')
    expect(capsAfter.providers['aek-prompt-manager']).toBeUndefined()
  })

  it('is idempotent: a v2-shaped document answers zero writes', () => {
    const modesDoc = JSON.stringify({
      version: 3,
      modes: { 'aek-prompt-manager': 'isolate' },
      assignments: { 'aek-prompt-manager': 'runtime1' },
      labels: { runtime1: 'prompt worker' },
      containers: { runtime1: true },
    })
    const writes = runtimesV2MigrationWrites({
      runtimeModesText: modesDoc,
      runtimeModesPath: '/tmp/fixture/runtime-modes.json',
      capabilitiesText: null,
      capabilitiesPath: '/tmp/fixture/capabilities.json',
    })
    expect(writes).toEqual([])
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
