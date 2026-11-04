import { symlinkSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

/**
 * Directory-link policy (ported, two sources — see NOTICE):
 *
 * - **Windows**: a directory *junction* instead of a real directory symlink
 *   (from luongnv89/asm `createDirSymlink`). Real directory symlinks need
 *   elevation / Developer Mode and fail with EPERM; junctions need no
 *   special privileges. Node still reports a junction as a symlink via
 *   `lstat().isSymbolicLink()` and resolves it through `readlink()` /
 *   `realpath()`, so the ported symlink detection, dedup, and rollback
 *   logic keep working unchanged. Junction targets must be absolute, so a
 *   possibly-relative target is resolved against the link's parent
 *   directory — the same base against which a symlink target is interpreted.
 *
 * - **POSIX**: a *relative* directory symlink when the target is absolute
 *   (from tc9011/skills-manager `computeRelativeSymlinkTarget`, the same
 *   scheme vercel-labs/skills uses) so the link stays valid if the hub
 *   tree or the home directory moves. Already-relative targets are kept
 *   verbatim — they are interpreted against the link's directory, exactly
 *   like a plain symlink's target.
 *
 * File-level symlinks (and directory targets that do not exist yet) fall
 * back to a plain `symlinkSync` with the caller's target verbatim.
 */
export function createDirLink(target: string, linkPath: string): void {
  if (process.platform === 'win32') {
    symlinkSync(resolve(dirname(linkPath), target), linkPath, 'junction')
  } else {
    const rel = isAbsolute(target) ? relative(dirname(linkPath), target) || '.' : target
    symlinkSync(rel, linkPath)
  }
}

/**
 * Compute the relative symlink target from linkPath to targetPath
 * (tc9011 `computeRelativeSymlinkTarget` — kept as the canonical helper for
 * idempotent link checks: a link is healthy iff `readlink` equals this).
 */
export function computeRelativeSymlinkTarget(linkPath: string, targetPath: string): string {
  return relative(dirname(linkPath), targetPath) || '.'
}

/**
 * Normalize a *relative* path for storage in on-disk metadata (asm
 * `toPortableRelativePath`). `path.relative()` returns backslashes on
 * Windows; persisting them verbatim writes machine-specific separators
 * into files meant to be portable. Storing POSIX separators is safe in
 * both directions: `path.join()` on Windows accepts `/` transparently.
 * Only relative paths; absolute Windows paths keep their drive prefix and
 * are not portable anyway.
 */
export function toPortableRelativePath(relPath: string): string {
  return relPath.split('\\').join('/')
}
