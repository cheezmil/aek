/**
 * Keep the legacy `aek-system-skill/` shelf consistent with the manifest.
 *
 * A shelf entry whose name is not declared in `aek-system-skills.yml` has no
 * corresponding AEK package. It must not stay in the hub; we MOVE it into
 * `.backups/undefined-system-skills-<timestamp>/` (never delete), so the
 * operator can restore it if a package is added to the manifest later.
 *
 * Scope is deliberately narrow: only first-level entries of the system shelf.
 * The main `skills/` pool is user-owned and is never touched here.
 */
import path from 'node:path'
import type { FileSystemPort } from '../ports/filesystem.js'
import {
  SYSTEM_SKILL_BACKUP_DIR,
  SYSTEM_SKILL_SHELF_DIR,
  allowedSystemSkillNames,
  type SystemSkillManifest,
} from '../../shared/system-skill-manifest.js'

export type QuarantineResult = {
  moved: string[]
  backupDir: string | null
}

function shelfEntries(fs: FileSystemPort, hubRoot: string): { name: string; kind: string }[] {
  const shelf = path.join(hubRoot, SYSTEM_SKILL_SHELF_DIR)
  if (fs.kind(shelf) !== 'directory') return []
  return fs.readDirectory(shelf)
    .filter(entry => (entry.kind === 'directory' || entry.kind === 'symlink') && !entry.name.startsWith('.'))
    .map(entry => ({ name: entry.name, kind: entry.kind }))
}

/** Read-only: names present in the shelf but absent from the manifest. */
export function listUndefinedSystemSkills(fs: FileSystemPort, hubRoot: string, manifest: SystemSkillManifest): string[] {
  const allowed = allowedSystemSkillNames(manifest)
  return shelfEntries(fs, hubRoot)
    .map(entry => entry.name)
    .filter(name => !allowed.has(name))
    .sort()
}

/** Move every undeclared shelf entry into a timestamped backup directory. */
export function quarantineUndefinedSystemSkills(
  fs: FileSystemPort,
  hubRoot: string,
  manifest: SystemSkillManifest,
  now: Date = new Date(),
): QuarantineResult {
  const undefinedNames = listUndefinedSystemSkills(fs, hubRoot, manifest)
  if (undefinedNames.length === 0) return { moved: [], backupDir: null }

  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(hubRoot, SYSTEM_SKILL_BACKUP_DIR, `undefined-system-skills-${stamp}`)
  fs.makeDirectory(backupDir)

  const shelf = path.join(hubRoot, SYSTEM_SKILL_SHELF_DIR)
  const moved: string[] = []
  for (const name of undefinedNames) {
    const source = path.join(shelf, name)
    if (fs.kind(source) === 'missing') continue
    fs.move(source, path.join(backupDir, name))
    moved.push(name)
  }
  return { moved, backupDir }
}
