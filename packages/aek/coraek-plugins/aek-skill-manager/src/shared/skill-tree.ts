import path from 'node:path'
import type { FileSystemPort } from '../core/ports/filesystem.js'

/**
 * A skill is a single-level directory: `<skills>/<name>/SKILL.md`.
 *
 * A "double-nested" skill (`<name>/<name>/SKILL.md`) is what copying a skill
 * directory into an already-existing directory of the same name produces
 * (`cp -r <name> <name>/` semantics, or a copy of an already-polluted source).
 * The inner copy is never a real skill: agents only discover `SKILL.md` at the
 * first level, and it silently changes the hub tree fingerprint, which makes
 * `SystemSkillService` classify the skill as `user-managed` and skip every
 * future refresh. See `todos/archive/20261106-aeksm嵌套修复-done.md`.
 */
export type SkillTreeLayout =
  /** Normal: `dir/SKILL.md`, no same-named inner skill. */
  | { kind: 'clean' }
  /** `dir/SKILL.md` plus a redundant `dir/<name>/SKILL.md` copy. */
  | { kind: 'duplicate'; innerDir: string }
  /** Only `dir/<name>/SKILL.md` exists — the real skill is buried one level down. */
  | { kind: 'buried'; innerDir: string }

/**
 * Inspect a skill directory for a redundant same-named inner layer.
 * `skillName` is passed separately because a source checkout directory does not
 * have to be named after the skill (the destination directory always is).
 */
export function inspectSkillTree(fs: FileSystemPort, dir: string, skillName: string = path.basename(dir)): SkillTreeLayout {
  const innerDir = path.join(dir, skillName)
  if (fs.kind(path.join(innerDir, 'SKILL.md')) !== 'file') return { kind: 'clean' }
  return fs.kind(path.join(dir, 'SKILL.md')) === 'file'
    ? { kind: 'duplicate', innerDir }
    : { kind: 'buried', innerDir }
}
