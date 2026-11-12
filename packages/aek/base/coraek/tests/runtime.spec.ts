/**
 * Unit tests for the selective runtime-mode model (`runtime.mjs`) and the
 * `aek.runtime` manifest marker (`plugin-meta.mjs`): the pure policy half of
 * the class-① share/isolate boundary. No processes are spawned and no real
 * AEK_HOME is touched — the store uses a temp directory.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
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
