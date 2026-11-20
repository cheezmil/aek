/**
 * The add-view source detection (the display-side mirror of the engine's
 * source parser): every input the engine accepts, named for the badge.
 *
 * @module aek-web/tests/skill-manager/sourceDetect.spec
 */
import { describe, expect, it } from 'vitest'
import { detectSourceKind } from '../../src/skill-manager/domain/sourceDetect.ts'

describe('detectSourceKind', () => {
  it('names an empty or whitespace input', () => {
    expect(detectSourceKind('')).toBe('empty')
    expect(detectSourceKind('   ')).toBe('empty')
  })

  it('names git-host repos (plain, .git-suffixed, and a subdomain host)', () => {
    expect(detectSourceKind('https://github.com/owner/repo')).toBe('git-repo')
    expect(detectSourceKind('https://gitlab.com/owner/repo.git')).toBe('git-repo')
    expect(detectSourceKind('https://foo.github.com/owner/repo')).toBe('git-repo')
  })

  it('keeps a 3-segment git-host path a plain http URL (the engine wants owner/repo)', () => {
    expect(detectSourceKind('https://github.com/owner/repo/sub')).toBe('http-url')
  })

  it('names non-git hosts (and archive links over http) as http URLs', () => {
    expect(detectSourceKind('https://example.com/owner/repo')).toBe('http-url')
    expect(detectSourceKind('http://example.com/a/skills.zip')).toBe('http-url')
  })

  it('names zip / tar archives by suffix', () => {
    expect(detectSourceKind('/tmp/skills.zip')).toBe('zip-archive')
    expect(detectSourceKind('dist/skills.tar.gz')).toBe('zip-archive')
    expect(detectSourceKind('bundle.tgz')).toBe('zip-archive')
    expect(detectSourceKind('bundle.tar')).toBe('zip-archive')
  })

  it('names clean two-segment owner/repo', () => {
    expect(detectSourceKind('xingkongliang/skills-manager')).toBe('owner-repo')
  })

  it('keeps subpaths, dirty segments, and colon pairs as local directories', () => {
    expect(detectSourceKind('owner/repo/sub')).toBe('local-dir')
    expect(detectSourceKind('a b/c')).toBe('local-dir')
    expect(detectSourceKind('.hidden/repo')).toBe('local-dir')
    expect(detectSourceKind('owner:repo')).toBe('local-dir')
    expect(detectSourceKind('owner/repo.zip')).toBe('zip-archive')
  })

  it('falls back to local-dir for plain local paths', () => {
    expect(detectSourceKind('/Users/tester/skills')).toBe('local-dir')
    expect(detectSourceKind('./relative/path')).toBe('local-dir')
  })
})
