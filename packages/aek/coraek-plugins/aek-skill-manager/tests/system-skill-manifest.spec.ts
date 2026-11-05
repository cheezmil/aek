import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeFileSystem } from '../src/infra/fs-skill-home.js'
import {
  allowedSystemSkillNames,
  findSystemSkillManifest,
  loadSystemSkillManifest,
  seedablePackages,
  SYSTEM_SKILL_BACKUP_DIR,
  SYSTEM_SKILL_MANIFEST_FILE,
  SYSTEM_SKILL_SHELF_DIR,
} from '../src/shared/system-skill-manifest.js'
import { listUndefinedSystemSkills, quarantineUndefinedSystemSkills } from '../src/core/services/system-skill-guard.js'

const fs = new NodeFileSystem()
const temps: string[] = []
const here = path.dirname(fileURLToPath(import.meta.url))

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aeksm-system-manifest-'))
  temps.push(dir)
  return dir
}

const MANIFEST = `version: 1
packages:
  - name: aek-websearch
    skills: [aek-websearch]
  - name: aek-prompt-manager
    skills: [aek-prompt-manager]
  - name: aek-skill-manager
    skills: [aek-skill-manager]
    seed: false
`

function writeManifest(pkgRoot: string, contents = MANIFEST): void {
  mkdirSync(pkgRoot, { recursive: true })
  writeFileSync(path.join(pkgRoot, SYSTEM_SKILL_MANIFEST_FILE), contents, 'utf8')
}

describe('system-skills.yml (the only allowlist)', () => {
  it('reads the shipped manifest from the real package root', () => {
    const manifest = loadSystemSkillManifest(here)
    expect(manifest.version).toBe(1)
    expect(manifest.packages.map(entry => entry.name)).toEqual([
      'aek-websearch', 'aek-prompt-manager', 'aek-skill-manager',
    ])
    expect([...allowedSystemSkillNames(manifest)].sort()).toEqual([
      'aek-prompt-manager', 'aek-skill-manager', 'aek-websearch',
    ])
    // manager skill is seeded by ManagerSkillService, not SystemSkillService
    expect(seedablePackages(manifest).map(entry => entry.name)).toEqual([
      'aek-websearch', 'aek-prompt-manager',
    ])
  })

  it('resolves the SAME manifest from dev (src/) and installed (lib/) layouts', () => {
    const pkgRoot = temp()
    writeManifest(pkgRoot)
    const dev = path.join(pkgRoot, 'src', 'shared')
    const installed = path.join(pkgRoot, 'lib', 'shared')
    mkdirSync(dev, { recursive: true })
    mkdirSync(installed, { recursive: true })
    expect(findSystemSkillManifest(dev)).toBe(path.join(pkgRoot, SYSTEM_SKILL_MANIFEST_FILE))
    expect(findSystemSkillManifest(installed)).toBe(findSystemSkillManifest(dev))
    expect(loadSystemSkillManifest(installed).packages).toHaveLength(3)
  })

  it('fails loudly when the manifest is missing (an npm tarball without it)', () => {
    const pkgRoot = temp()
    const nested = path.join(pkgRoot, 'lib', 'core', 'services')
    mkdirSync(nested, { recursive: true })
    expect(() => findSystemSkillManifest(nested)).toThrow(/not found/)
  })

  it('rejects unsafe names, bad versions and duplicate skills', () => {
    const cases = [
      'version: 2\npackages:\n  - name: aek-websearch\n    skills: [aek-websearch]\n',
      'version: 1\npackages:\n  - name: aek-websearch\n    skills: ["../escape"]\n',
      'version: 1\npackages: []\n',
      'version: 1\npackages:\n  - name: a\n    skills: [x]\n  - name: b\n    skills: [x]\n',
    ]
    for (const contents of cases) {
      const pkgRoot = temp()
      writeManifest(pkgRoot, contents)
      expect(() => loadSystemSkillManifest(pkgRoot)).toThrow()
    }
  })
})

describe('undeclared system skills are backed up, not deleted', () => {
  function shelfHub(): string {
    const hub = temp()
    const shelf = path.join(hub, SYSTEM_SKILL_SHELF_DIR)
    mkdirSync(path.join(shelf, 'aek-websearch'), { recursive: true })
    writeFileSync(path.join(shelf, 'aek-websearch', 'SKILL.md'), 'declared', 'utf8')
    mkdirSync(path.join(shelf, 'aek-task-manager'), { recursive: true })
    writeFileSync(path.join(shelf, 'aek-task-manager', 'SKILL.md'), 'unknown package', 'utf8')
    mkdirSync(path.join(shelf, 'aek-install-and-init'), { recursive: true })
    writeFileSync(path.join(shelf, 'aek-install-and-init', 'SKILL.md'), 'unknown package', 'utf8')
    writeFileSync(path.join(shelf, '.DS_Store'), 'junk', 'utf8')
    return hub
  }

  it('lists only undeclared first-level directories', () => {
    const hub = shelfHub()
    const manifest = loadSystemSkillManifest(here)
    expect(listUndefinedSystemSkills(fs, hub, manifest)).toEqual([
      'aek-install-and-init', 'aek-task-manager',
    ])
  })

  it('moves undeclared entries into .backups/ and keeps declared ones', () => {
    const hub = shelfHub()
    const manifest = loadSystemSkillManifest(here)
    const before = listUndefinedSystemSkills(fs, hub, manifest)
    expect(before).toEqual(['aek-install-and-init', 'aek-task-manager'])

    const result = quarantineUndefinedSystemSkills(fs, hub, manifest, new Date('2026-11-06T03:00:00.000Z'))
    expect(result.moved.sort()).toEqual(['aek-install-and-init', 'aek-task-manager'])
    expect(result.backupDir).toContain(path.join(SYSTEM_SKILL_BACKUP_DIR, 'undefined-system-skills-'))
    expect(existsSync(path.join(result.backupDir!, 'aek-task-manager', 'SKILL.md'))).toBe(true)
    expect(readFileSync(path.join(result.backupDir!, 'aek-task-manager', 'SKILL.md'), 'utf8')).toBe('unknown package')

    const shelf = path.join(hub, SYSTEM_SKILL_SHELF_DIR)
    expect(existsSync(path.join(shelf, 'aek-websearch', 'SKILL.md'))).toBe(true)
    expect(existsSync(path.join(shelf, '.DS_Store'))).toBe(true)
    expect(existsSync(path.join(shelf, 'aek-task-manager'))).toBe(false)
    expect(listUndefinedSystemSkills(fs, hub, manifest)).toEqual([])
  })

  it('is idempotent: a second pass moves nothing and creates no backup', () => {
    const hub = shelfHub()
    const manifest = loadSystemSkillManifest(here)
    quarantineUndefinedSystemSkills(fs, hub, manifest, new Date('2026-11-06T03:00:00.000Z'))
    const second = quarantineUndefinedSystemSkills(fs, hub, manifest, new Date('2026-11-06T03:01:00.000Z'))
    expect(second).toEqual({ moved: [], backupDir: null })
  })
})
