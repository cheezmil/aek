/**
 * The single source of truth for "which packages are AEK system skills".
 *
 * The manifest lives at the PACKAGE ROOT (`system-skills.yml`), which is the
 * same relative location in a dev checkout and in a published tarball. We walk
 * up from the calling module instead of hardcoding a directory depth or a
 * monorepo layout: tsc preserves `src/` -> `lib/`, so both resolve to the root.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { SkillsManagerError } from './errors.js'

export const SYSTEM_SKILL_MANIFEST_FILE = 'system-skills.yml'

/** Legacy hub shelf holding mirrored copies of bundled system skills. */
export const SYSTEM_SKILL_SHELF_DIR = 'aek-system-skill'

/** Backup area for shelf entries not declared in the manifest. */
export const SYSTEM_SKILL_BACKUP_DIR = '.backups'

export type SystemSkillPackageEntry = {
  /** Package directory name, e.g. `aek-websearch`. */
  name: string
  /** Skill directories this package provides under `skills/`. */
  skills: string[]
  /** `false` for skills seeded by another service (the manager skill). */
  seed: boolean
}

export type SystemSkillManifest = {
  version: number
  packages: SystemSkillPackageEntry[]
}

/** No slashes, no `..`, no absolute paths — names become directory names. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function assertSafeName(value: unknown, what: string): string {
  if (typeof value !== 'string' || !SAFE_NAME.test(value) || value === '..') {
    throw new SkillsManagerError(
      'system_skill_manifest_invalid',
      `${SYSTEM_SKILL_MANIFEST_FILE}: invalid ${what} ${JSON.stringify(value)} (expected a plain directory name).`,
    )
  }
  return value
}

/**
 * Locate the manifest by walking up from a module directory. Layout-agnostic:
 * works from `src/shared/`, `lib/shared/`, `src/cli/` or any future location.
 */
export function findSystemSkillManifest(startDir: string): string {
  let dir = path.resolve(startDir)
  for (;;) {
    const candidate = path.join(dir, SYSTEM_SKILL_MANIFEST_FILE)
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new SkillsManagerError(
        'system_skill_manifest_missing',
        `${SYSTEM_SKILL_MANIFEST_FILE} not found at or above ${startDir}. ` +
          'The published package must ship this file (package.json "files").',
      )
    }
    dir = parent
  }
}

/** Parse + validate. A malformed manifest fails loudly instead of seeding nothing. */
export function loadSystemSkillManifest(startDir: string): SystemSkillManifest {
  const file = findSystemSkillManifest(startDir)
  let raw: unknown
  try {
    raw = YAML.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new SkillsManagerError('system_skill_manifest_invalid', `${file}: ${String(error)}`)
  }
  if (!raw || typeof raw !== 'object') {
    throw new SkillsManagerError('system_skill_manifest_invalid', `${file}: expected a YAML mapping.`)
  }
  const doc = raw as Record<string, unknown>
  if (doc.version !== 1) {
    throw new SkillsManagerError('system_skill_manifest_invalid', `${file}: unsupported version ${String(doc.version)} (expected 1).`)
  }
  if (!Array.isArray(doc.packages) || doc.packages.length === 0) {
    throw new SkillsManagerError('system_skill_manifest_invalid', `${file}: "packages" must be a non-empty list.`)
  }
  const packages: SystemSkillPackageEntry[] = []
  const seenSkills = new Set<string>()
  const seenPackages = new Set<string>()
  for (const item of doc.packages) {
    if (!item || typeof item !== 'object') {
      throw new SkillsManagerError('system_skill_manifest_invalid', `${file}: every package must be a mapping.`)
    }
    const entry = item as Record<string, unknown>
    const name = assertSafeName(entry.name, 'package name')
    if (seenPackages.has(name)) {
      throw new SkillsManagerError('system_skill_manifest_invalid', `${file}: duplicate package "${name}".`)
    }
    seenPackages.add(name)
    if (!Array.isArray(entry.skills) || entry.skills.length === 0) {
      throw new SkillsManagerError('system_skill_manifest_invalid', `${file}: package "${name}" needs a non-empty "skills" list.`)
    }
    const skills = entry.skills.map(skill => assertSafeName(skill, `skill name in "${name}"`))
    for (const skill of skills) {
      if (seenSkills.has(skill)) {
        throw new SkillsManagerError('system_skill_manifest_invalid', `${file}: duplicate skill "${skill}".`)
      }
      seenSkills.add(skill)
    }
    packages.push({ name, skills, seed: entry.seed !== false })
  }
  return { version: 1, packages }
}

/** Every skill name the manifest declares — the allowlist for the hub shelf. */
export function allowedSystemSkillNames(manifest: SystemSkillManifest): Set<string> {
  return new Set(manifest.packages.flatMap(entry => entry.skills))
}

/** Packages SystemSkillService should seed (excludes `seed: false` entries). */
export function seedablePackages(manifest: SystemSkillManifest): SystemSkillPackageEntry[] {
  return manifest.packages.filter(entry => entry.seed)
}
