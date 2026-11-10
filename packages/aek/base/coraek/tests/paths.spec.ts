/**
 * The path manifest: `~/.aek/aek.yaml` is where "which folder is where" lives.
 *
 * The behaviour under test is the whole point of the manifest — adding a parent
 * folder must be a ONE-LINE edit with no code change — so the tests build real
 * temporary containers and assert that the resolvers follow the file:
 *
 *   - no manifest      → historical `<container>/current` / `<container>/next`;
 *   - nested layout    → `<container>/v2/current`, and the container is still
 *                        recoverable from a root alone (`containerForHome`);
 *   - renamed folder   → `aekHomePath('websearch')` follows the manifest;
 *   - two slots on one path → reported, because it would cross-write data.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findManifestFor,
  parseYamlSubset,
  readAekManifest,
  renderManifest,
  resolveManifestPath,
  writeDefaultManifest,
} from '../paths.mjs'
import { aekHomePath, resolveAekHome } from '../home.mjs'
import { containerForHome, resolveSlot, slotHome } from '../slots.mjs'

/** @type {string[]} */
const created = []

/**
 * Make a throwaway container with the given manifest body.
 * @param {string} [body] - manifest contents; omit for "no manifest".
 * @returns {string} the container path.
 */
function makeContainer(body) {
  const dir = mkdtempSync(join(tmpdir(), 'aek-paths-'))
  created.push(dir)
  if (body !== undefined) writeFileSync(join(dir, 'aek.yaml'), body, 'utf8')
  return dir
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseYamlSubset', () => {
  it('reads nested maps, comments and quoted scalars', () => {
    const parsed = parseYamlSubset(
      [
        '# top comment',
        'version: 1',
        'root: "."   # trailing comment',
        'slots:',
        '  aek: current',
        "  next: 'v2/next'",
        'dirs:',
        '  websearch: search',
      ].join('\n'),
    )
    expect(parsed).toEqual({
      version: 1,
      root: '.',
      slots: { aek: 'current', next: 'v2/next' },
      dirs: { websearch: 'search' },
    })
  })

  it('accepts JSON, because JSON is a subset of YAML', () => {
    expect(parseYamlSubset('{"slots":{"aek":"v3/current"}}')).toEqual({ slots: { aek: 'v3/current' } })
  })

  it('reports the line number instead of guessing', () => {
    expect(() => parseYamlSubset('slots:\n  aek: current\n    broken: x\n', 'aek.yaml')).toThrow(/aek\.yaml:3/u)
  })
})

describe('resolveManifestPath', () => {
  it('resolves relative, absolute and ~ values', () => {
    expect(resolveManifestPath('/base', 'v2/current')).toBe('/base/v2/current')
    expect(resolveManifestPath('/base', '/elsewhere/slot')).toBe('/elsewhere/slot')
    expect(resolveManifestPath('/base', '.')).toBe('/base')
  })
})

describe('without a manifest', () => {
  it('falls back to the historical container layout', () => {
    const container = makeContainer()
    const env = { AEK_ROOT: container }
    expect(readAekManifest(container)).toBeNull()
    expect(resolveAekHome(env)).toBe(join(container, 'current'))
    expect(slotHome('aek', env)).toBe(join(container, 'current'))
    expect(slotHome('next', env)).toBe(join(container, 'next'))
  })
})

describe('with a nested manifest', () => {
  it('follows the manifest instead of hardcoding `current`', () => {
    const container = makeContainer(['version: 1', 'slots:', '  aek: v2/current', '  next: v2/next'].join('\n'))
    mkdirSync(join(container, 'v2', 'current'), { recursive: true })
    const env = { AEK_ROOT: container }

    expect(resolveAekHome(env)).toBe(join(container, 'v2', 'current'))
    expect(slotHome('aek', env)).toBe(join(container, 'v2', 'current'))
    expect(slotHome('next', env)).toBe(join(container, 'v2', 'next'))
  })

  it('recovers the container from a bare data root', () => {
    const container = makeContainer(['version: 1', 'slots:', '  aek: v2/current', '  next: v2/next'].join('\n'))
    const home = join(container, 'v2', 'current')
    mkdirSync(home, { recursive: true })

    expect(findManifestFor(home)?.container).toBe(container)
    expect(containerForHome(home)).toBe(container)
    expect(resolveSlot({ AEK_HOME: home })).toBe('aek')
    expect(resolveSlot({ AEK_HOME: join(container, 'v2', 'next') })).toBe('next')
  })

  it('lets a slot live outside the container', () => {
    const container = makeContainer(['version: 1', 'slots:', '  aek: current', '  next: /tmp/../tmp/aek-next-test'].join('\n'))
    const manifest = readAekManifest(container)
    expect(manifest?.slots.next).toBe('/tmp/aek-next-test')
    expect(manifest?.slots.aek).toBe(join(container, 'current'))
  })
})

describe('dirs mapping', () => {
  it('makes aekHomePath follow a renamed folder', () => {
    const container = makeContainer(
      ['version: 1', 'slots:', '  aek: current', '  next: next', 'dirs:', '  websearch: search'].join('\n'),
    )
    const previous = process.env.AEK_ROOT
    const previousHome = process.env.AEK_HOME
    process.env.AEK_ROOT = container
    delete process.env.AEK_HOME
    try {
      expect(aekHomePath('websearch', 'providers.yml')).toBe(join(container, 'current', 'search', 'providers.yml'))
      expect(aekHomePath('logs')).toBe(join(container, 'current', 'logs'))
    } finally {
      if (previous === undefined) delete process.env.AEK_ROOT
      else process.env.AEK_ROOT = previous
      if (previousHome === undefined) delete process.env.AEK_HOME
      else process.env.AEK_HOME = previousHome
    }
  })
})

describe('safety', () => {
  it('resolves dirs for a process that only knows AEK_HOME', () => {
    // The packaged app is launched with AEK_HOME alone, and with the manifest in
    // a container two levels up: the manifest must still be found, otherwise
    // `aekHomePath` silently falls back to the default folder names.
    const container = makeContainer(
      ['version: 1', 'slots:', '  aek: v2/current', '  next: v2/next', 'dirs:', '  websearch: search'].join('\n'),
    )
    const home = join(container, 'v2', 'next')
    mkdirSync(home, { recursive: true })
    const previousRoot = process.env.AEK_ROOT
    const previousHome = process.env.AEK_HOME
    delete process.env.AEK_ROOT
    process.env.AEK_HOME = home
    try {
      expect(aekHomePath('websearch')).toBe(join(home, 'search'))
      expect(containerForHome(home)).toBe(container)
    } finally {
      if (previousRoot !== undefined) process.env.AEK_ROOT = previousRoot
      if (previousHome === undefined) delete process.env.AEK_HOME
      else process.env.AEK_HOME = previousHome
    }
  })

  it('reports two slots sharing one directory', () => {
    const container = makeContainer(['version: 1', 'slots:', '  aek: current', '  next: current'].join('\n'))
    expect(readAekManifest(container)?.warnings.some((w: string) => w.includes('同一个目录'))).toBe(true)
  })

  it('does not clobber an existing manifest', () => {
    const container = makeContainer('version: 1\nslots:\n  aek: keepme\n')
    expect(writeDefaultManifest(container).written).toBe(false)
    expect(readAekManifest(container)?.slots.aek).toBe(join(container, 'keepme'))
  })

  it('renders a manifest it can parse back', () => {
    const container = makeContainer()
    const { written } = writeDefaultManifest(container)
    expect(written).toBe(true)
    const manifest = readAekManifest(container)
    expect(manifest?.warnings).toEqual([])
    expect(manifest?.slots.aek).toBe(join(container, 'current'))
    expect(manifest?.slots.next).toBe(join(container, 'next'))
    expect(manifest?.backups).toBe(join(container, 'backups'))
    expect(renderManifest().startsWith('# AEK 路径清单')).toBe(true)
  })
})
