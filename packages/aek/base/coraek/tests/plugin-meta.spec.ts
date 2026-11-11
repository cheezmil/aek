import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  checkPluginClasses,
  classViolationMessage,
  clearLanguageCache,
  findAekPackageDirs,
  pluginClassOf,
  publishablePlugins,
  readPluginMeta,
  scanLanguages,
} from '../plugin-meta.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')

/** @returns a fresh throwaway repository root. */
function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'aek-plugin-meta-'))
}

describe('audience classification', () => {
  it('accepts only A1 and A2', () => {
    expect(pluginClassOf({ aek: { distribution: 'A1' } })).toEqual({ value: 'A1', ok: true, reason: '' })
    expect(pluginClassOf({ aek: { distribution: 'A2' } })).toEqual({ value: 'A2', ok: true, reason: '' })
  })

  it('rejects a missing declaration with no fallback', () => {
    expect(pluginClassOf({}).reason).toBe('missing')
    expect(pluginClassOf({ aek: {} }).ok).toBe(false)
  })

  it('rejects a third class or any other value', () => {
    expect(pluginClassOf({ aek: { distribution: 'A3' } }).reason).toBe('invalid')
    expect(pluginClassOf({ aek: { distribution: 'local' } }).ok).toBe(false)
  })

  it('explains how to fix a violation', () => {
    const message = classViolationMessage(pluginClassOf({}), '@cheezmil/bad')
    expect(message).toContain('aek.distribution')
    expect(message).toContain('A1')
    expect(message).toContain('A2')
  })
})

describe('whole-tree gate', () => {
  it('passes for this repository', () => {
    const result = checkPluginClasses(REPO_ROOT)
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
    expect(result.packages.length).toBeGreaterThan(5)
  })

  it('finds the A2 quick-prompt scaffold', () => {
    const dirs = findAekPackageDirs(REPO_ROOT)
    expect(dirs.some(dir => dir.endsWith('/aek-quick-prompt'))).toBe(true)
  })

  it('never offers an A2 package to a publish path', () => {
    const publishable = publishablePlugins(REPO_ROOT)
    expect(publishable.some(pkg => pkg.packageName === '@cheezmil/aek-quick-prompt')).toBe(false)
    expect(publishable.every(pkg => pkg.distribution.value === 'A1')).toBe(true)
  })

  it('fails a fake repository with an undeclared plugin', () => {
    const root = scratch()
    try {
      const dir = join(root, 'packages', 'aek', 'coraek-plugins', 'bad')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@cheezmil/bad', version: '0.0.1' }))
      const result = checkPluginClasses(root)
      expect(result.ok).toBe(false)
      expect(result.violations[0]).toContain('MISSING')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('cheap language scan', () => {
  const roots: string[] = []

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  })

  it('detects implementation languages from extensions only', () => {
    const root = scratch()
    roots.push(root)
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'native'), { recursive: true })
    mkdirSync(join(root, 'bin'), { recursive: true })
    mkdirSync(join(root, 'lib'), { recursive: true })
    writeFileSync(join(root, 'src', 'a.ts'), '')
    writeFileSync(join(root, 'src', 'b.ts'), '')
    writeFileSync(join(root, 'native', 'c.go'), '')
    writeFileSync(join(root, 'bin', 'd.mjs'), '')
    writeFileSync(join(root, 'lib', 'should-not-count.ts'), '')
    writeFileSync(join(root, 'src', 'README.md'), 'TypeScript Go Rust JavaScript')
    clearLanguageCache()
    const scan = scanLanguages(root)
    expect(scan.primary).toBe('TypeScript')
    expect(scan.languages).toContain('Go')
    expect(scan.languages).toContain('JavaScript')
    expect(scan.files).toBe(4) // lib/ is skipped, README content is never read
  })

  it('is cached and can be invalidated', () => {
    const root = scratch()
    roots.push(root)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'a.ts'), '')
    clearLanguageCache()
    const first = scanLanguages(root, { now: 1000 })
    expect(first.files).toBe(1)
    writeFileSync(join(root, 'src', 'b.go'), '')
    expect(scanLanguages(root, { now: 2000 }).files).toBe(1) // cached
    clearLanguageCache()
    expect(scanLanguages(root, { now: 3000 }).files).toBe(2)
  })

  it('exposes classification and languages together', () => {
    const plugins = readPluginMeta(REPO_ROOT)
    const quick = plugins.find(pkg => pkg.packageName === '@cheezmil/aek-quick-prompt')
    expect(quick?.distribution.value).toBe('A2')
    expect(quick?.private).toBe(true)
    expect(quick?.languages.primary).toBe('TypeScript')
  })
})
