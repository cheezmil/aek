/**
 * Unit tests for the selective runtime-mode model (`runtime.mjs`) and the
 * `aek.runtime` manifest marker (`plugin-meta.mjs`): the pure policy half of
 * the class-① share/isolate boundary. No processes are spawned and no real
 * AEK_HOME is touched — the store uses a temp directory.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  RUNTIME_MODES,
  isStrongCopyleft,
  hasExternalManifest,
  effectiveModes,
  resolveRuntimeMode,
  readRuntimeModes,
  writeRuntimeMode,
  runtimeModesPath,
  discoverAekSiblingPackages,
  bootIsolateRuntimePackages,
} from '../runtime.mjs'
import { runtimeMetaOf } from '../plugin-meta.mjs'

describe('runtime mode model', () => {
  describe('isStrongCopyleft', () => {
    it('matches AGPL and GPL families', () => {
      expect(isStrongCopyleft('AGPL-3.0-or-later')).toBe(true)
      expect(isStrongCopyleft('GPL-3.0')).toBe(true)
      expect(isStrongCopyleft('MIT AND GPL-2.0-or-later')).toBe(true)
    })
    it('does not match permissive licenses or missing values', () => {
      expect(isStrongCopyleft('MIT')).toBe(false)
      expect(isStrongCopyleft('Apache-2.0')).toBe(false)
      expect(isStrongCopyleft(undefined)).toBe(false)
      expect(isStrongCopyleft(42)).toBe(false)
    })
  })

  describe('resolveRuntimeMode — the four decision branches', () => {
    it('external wrapper with strong-copyleft spdx is license-forced isolate', () => {
      const manifest = { aek: { external: { spdx: 'AGPL-3.0-or-later', attach: { kind: 'mcp-stdio', command: 'fury-agent' } } } }
      expect(hasExternalManifest(manifest)).toBe(true)
      expect(resolveRuntimeMode({ manifest, storedMode: 'share' })).toEqual({ mode: 'isolate', forced: true, reason: 'license-forced' })
    })

    it('external wrapper without strong-copyleft spdx is runtime-forced isolate', () => {
      const manifest = { aek: { external: { spdx: 'MIT', attach: { kind: 'cli', command: 'native-tool' } } } }
      expect(resolveRuntimeMode({ manifest, storedMode: 'share' })).toEqual({ mode: 'isolate', forced: true, reason: 'runtime-forced' })
    })

    it('class ① with a stored isolate choice is user-select', () => {
      const manifest = { main: './lib/index.js', aek: { distribution: 'A1', runtime: { isolate: { bin: 'bin/aekws.mjs' } } } }
      expect(resolveRuntimeMode({ manifest, storedMode: 'isolate' })).toEqual({ mode: 'isolate', forced: false, reason: 'user-select' })
    })

    it('class ① with a stored share choice is user-select', () => {
      expect(resolveRuntimeMode({ manifest: { main: './lib/index.js' }, storedMode: 'share' }))
        .toEqual({ mode: 'share', forced: false, reason: 'user-select' })
    })

    it('class ① without any stored choice defaults to share (memory-lean)', () => {
      expect(resolveRuntimeMode({ manifest: { main: './lib/index.js' }, storedMode: undefined }))
        .toEqual({ mode: 'share', forced: false, reason: 'default-share' })
    })
  })

  describe('effectiveModes', () => {
    it('external wrappers are isolate-only', () => {
      const manifest = { aek: { external: { spdx: 'AGPL-3.0-or-later', attach: { kind: 'jsonrpc-stdio', command: 'x' } } } }
      expect(effectiveModes(manifest)).toEqual({ canShare: false, canIsolate: true })
    })

    it('plain class ① plugins are share-only unless aek.runtime.isolate is declared', () => {
      expect(effectiveModes({ main: './lib/index.js', aek: { distribution: 'A1' } })).toEqual({ canShare: true, canIsolate: false })
      expect(effectiveModes({ main: './lib/index.js', aek: { distribution: 'A1', runtime: { isolate: { bin: 'bin/x.mjs' } } } }))
        .toEqual({ canShare: true, canIsolate: true })
    })
  })

  describe('store (runtime-modes.json)', () => {
    let aekHome: string
    afterEach(() => {
      if (aekHome !== undefined) rmSync(aekHome, { recursive: true, force: true })
    })

    it('missing store reads as an empty map', () => {
      aekHome = mkdtempSync(join(tmpdir(), 'aek-runtime-home-'))
      expect(readRuntimeModes(aekHome)).toEqual({})
    })

    it('write + read round-trips the choice', () => {
      aekHome = mkdtempSync(join(tmpdir(), 'aek-runtime-home-'))
      const written = writeRuntimeMode(aekHome, 'aek-websearch', 'isolate')
      expect(written.ok).toBe(true)
      const modes = readRuntimeModes(aekHome)
      expect(modes['aek-websearch']).toBe('isolate')
    })

    it('rejects illegal mode values without touching the store', () => {
      aekHome = mkdtempSync(join(tmpdir(), 'aek-runtime-home-'))
      const bad = writeRuntimeMode(aekHome, 'x', 'fork' as unknown as 'share' | 'isolate')
      expect(bad.ok).toBe(false)
      expect(bad.problems.length).toBeGreaterThan(0)
      expect(readRuntimeModes(aekHome)).toEqual({})
    })

    it('the path is derived from aekHome, never hardcoded', () => {
      aekHome = mkdtempSync(join(tmpdir(), 'aek-runtime-home-'))
      expect(runtimeModesPath(aekHome)).toBe(join(aekHome, 'runtime-modes.json'))
      expect(RUNTIME_MODES).toEqual(['share', 'isolate'])
    })
  })

  describe('aek.runtime manifest marker (plugin-meta)', () => {
    it('absent block is legal', () => {
      expect(runtimeMetaOf({ main: './lib/index.js' })).toEqual({ ok: true, value: null, problems: [] })
    })

    it('legal share + isolate with an in-process entry passes', () => {
      const result = runtimeMetaOf({
        main: './lib/index.js',
        aek: { distribution: 'A1', runtime: { share: true, isolate: { bin: 'bin/aekws.mjs', spdx: 'MIT' } } },
      })
      expect(result.ok).toBe(true)
      expect(result.problems).toEqual([])
    })

    it('isolate without a spawnable bin fails', () => {
      const result = runtimeMetaOf({ main: './lib/index.js', aek: { runtime: { isolate: { spdx: 'MIT' } } } })
      expect(result.ok).toBe(false)
      expect(result.problems.join(' ')).toContain('bin')
    })

    it('share without any in-process entry fails', () => {
      const result = runtimeMetaOf({ aek: { runtime: { isolate: { bin: 'bin/x.mjs' } } } })
      expect(result.ok).toBe(false)
      expect(result.problems.join(' ')).toContain('in-process entry')
    })

    it('share explicitly off does not need an in-process entry', () => {
      const result = runtimeMetaOf({ aek: { runtime: { share: false, isolate: { bin: 'bin/x.mjs' } } } })
      expect(result.ok).toBe(true)
    })

    it('an absolute or shell-bearing bin fails', () => {
      const result = runtimeMetaOf({ main: './lib/index.js', aek: { runtime: { isolate: { bin: '/usr/local/bin/x' } } } })
      expect(result.ok).toBe(false)
      expect(result.problems.join(' ')).toContain('relative')
    })

    it('aek.runtime must not ride on an aek.external wrapper', () => {
      const result = runtimeMetaOf({
        aek: {
          external: { spdx: 'AGPL-3.0-or-later', attach: { kind: 'mcp-stdio', command: 'fury-agent' } },
          runtime: { share: false, isolate: { bin: 'bin/x.mjs' } },
        },
      })
      expect(result.ok).toBe(false)
      expect(result.problems.join(' ')).toContain('aek.external')
    })
  })
})

describe('runtime boot switch (discover + bootIsolateRuntimePackages)', () => {
  it('discovers sibling AEK packages from a host module location', () => {
    const root = mkdtempSync(join(tmpdir(), 'aek-runtime-boot-'))
    try {
      // `<root>/@cheezmil/` is the scope dir; the "host module" sits two
      // levels below it, mirroring `@cheezmil/coraek/lib/index.js`.
      const scope = join(root, '@cheezmil')
      const hostModuleUrl = join(scope, 'coraek', 'lib', 'index.js')
      for (const [name, pkg] of [
        ['aek-websearch', { name: '@cheezmil/aek-websearch', version: '1.0.0', license: 'Apache-2.0', aek: { distribution: 'A1', runtime: { share: true, isolate: { bin: 'bin/isolate.mjs' } } } }],
        ['plain-pkg', { name: 'plain-pkg', version: '0.1.0' }],
        ['coraek', { name: '@cheezmil/coraek', version: '0.9.0', aek: { distribution: 'A1' } }],
      ] as const) {
        const dir = join(scope, name)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
      }
      // `root` doubles as the fake cwd: it has no `packages/aek` layout, so
      // only the install-scope source contributes.
      const found = discoverAekSiblingPackages(`file:///${hostModuleUrl.replace(/\\/gu, '/')}`, root)
      expect(found.map(entry => entry.id)).toEqual(['aek-websearch', 'coraek'])
      expect(found.every(entry => entry.packageDir.startsWith(scope))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('discovers the dev repo layout (packages/aek/**) from the working directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'aek-runtime-dev-'))
    try {
      // Fake the dev checkout: <cwd>/packages/aek/coraek-plugins/aek-websearch.
      const pkgDir = join(root, 'packages', 'aek', 'coraek-plugins', 'aek-websearch')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
        name: '@cheezmil/aek-websearch',
        version: '1.0.0',
        aek: { distribution: 'A1', runtime: { share: true, isolate: { bin: 'bin/isolate.mjs' } } },
      }))
      // A package without an `aek` block must not surface.
      const plainDir = join(root, 'packages', 'aek', 'coraek-plugins', 'plain')
      mkdirSync(plainDir, { recursive: true })
      writeFileSync(join(plainDir, 'package.json'), JSON.stringify({ name: 'plain', version: '0.1.0' }))

      // No install scope (module url points nowhere): only the dev source hits.
      const found = discoverAekSiblingPackages('file:///nonexistent/coraek/lib/index.js', root)
      expect(found.map(entry => entry.id)).toEqual(['aek-websearch'])
      expect(found[0].packageDir).toBe(pkgDir)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('boots only stored isolates; registers with an absolute spawn command', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aek-runtime-boot-'))
    try {
      const home = join(root, 'home')
      const pkgDir = join(root, 'aek-websearch')
      mkdirSync(pkgDir, { recursive: true })
      const manifest = {
        name: '@cheezmil/aek-websearch',
        version: '1.0.0',
        license: 'Apache-2.0',
        aek: { runtime: { share: true, isolate: { bin: 'bin/isolate.mjs' } } },
      }
      expect(writeRuntimeMode(home, 'aek-websearch', 'isolate').ok).toBe(true)
      expect(writeRuntimeMode(home, 'other-capability', 'share').ok).toBe(true)

      const registered: string[] = []
      const started: string[] = []
      const fakeSupervisor = {
        register: async (id: string) => { registered.push(id); return { ok: true, problems: [] as string[] } },
        start: async (id: string) => { started.push(id); return { ok: true, state: 'running' } },
      }
      const results = await bootIsolateRuntimePackages({
        supervisor: fakeSupervisor as never,
        aekHome: home,
        packages: [{ id: 'aek-websearch', manifest, packageDir: pkgDir }],
      })
      expect(registered).toEqual(['aek-websearch'])
      expect(started).toEqual(['aek-websearch'])
      expect(results['aek-websearch']?.ok).toBe(true)
      // share-stored / undeclared ids never reach the supervisor.
      expect(registered).not.toContain('other-capability')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports a missing isolate bin without touching the supervisor', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aek-runtime-boot-'))
    try {
      const home = join(root, 'home')
      expect(writeRuntimeMode(home, 'no-bin', 'isolate').ok).toBe(true)
      const fakeSupervisor = {
        register: async (): Promise<{ ok: boolean; problems: string[] }> => ({ ok: true, problems: [] }),
        start: async (): Promise<{ ok: boolean; state?: string }> => ({ ok: true, state: 'running' }),
      }
      const results = await bootIsolateRuntimePackages({
        supervisor: fakeSupervisor as never,
        aekHome: home,
        packages: [{ id: 'no-bin', manifest: { name: 'no-bin', version: '0.1.0', aek: {} }, packageDir: root }],
      })
      expect(results['no-bin']?.ok).toBe(false)
      expect(String(results['no-bin']?.problem)).toContain('bin')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
