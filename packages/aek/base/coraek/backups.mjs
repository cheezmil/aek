/**
 * Bound `<container>/backups/` to the newest N snapshots.
 *
 * Lives in the package rather than in `scripts/` because the RUNTIME needs the
 * same rule: `schema.mjs` runs data migrations at app startup, and a migration
 * that writes a snapshot without ever pruning turns `backups/` into an
 * unbounded pile on every user's machine. Two copies of a deletion policy is
 * exactly the kind of drift that ends with one of them deleting the wrong
 * folder, so there is one implementation and `scripts/aek/backup-retention.mjs`
 * is a thin CLI over it.
 *
 * Two properties make deleting here safe enough to be automatic:
 *
 *   - **Name guard.** Only entries whose name starts with `YYYYMMDD` are ever
 *     candidates. `.DS_Store`, a hand-made `my-notes/`, a checkout someone
 *     dropped in — never touched, whatever their position in the sort. The
 *     timestamp prefix is also what proves the entry came from these tools.
 *   - **Newest wins, and the newest is protected.** Sorting is by mtime, newest
 *     first, so the snapshot a caller just created is at index 0 and is never a
 *     candidate. Callers may additionally pass `protect` (absolute paths) for
 *     the case where an older snapshot is the one they are working on.
 *
 * @module @cheezmil/coraek/backups
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** How many snapshots to keep when a caller does not say. */
export const DEFAULT_KEEP = 10

/**
 * A snapshot directory this tool is allowed to delete. Both spellings in use:
 * `20261111-031342-pre-layout` (dashed time) and `20261110044913-stray-…`
 * (time glued to the date). The leading `YYYYMMDD` is the provenance marker —
 * everything else in the folder is somebody's business, not ours.
 */
export const SNAPSHOT_NAME = /^\d{8}(\d{6}|-\d{6})?-/

/** `YYYYMMDD-HHMMSS`, the prefix every snapshot folder starts with. */
export function snapshotStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/**
 * Snapshots in `dir`, newest first.
 * @param {string} dir - the backups folder.
 * @returns {{ name: string, path: string, mtimeMs: number }[]} candidates only.
 */
export function listBackups(dir) {
  if (!existsSync(dir)) return []
  /** @type {{ name: string, path: string, mtimeMs: number }[]} */
  const rows = []
  for (const name of readdirSync(dir)) {
    if (!SNAPSHOT_NAME.test(name)) continue
    const full = join(dir, name)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    rows.push({ name, path: full, mtimeMs: stat.mtimeMs })
  }
  return rows.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/**
 * Keep the newest `keep` snapshots, delete the rest.
 *
 * @param {string} dir - the backups folder.
 * @param {object} [options] - behaviour.
 * @param {number} [options.keep] - how many to keep (newest first).
 * @param {string[]} [options.protect] - absolute paths never deleted, even when
 *   they fall outside the newest `keep` (a caller working on an older snapshot).
 * @param {boolean} [options.apply] - false previews, true deletes.
 * @returns {{ dir: string, keep: number, total: number, kept: string[], removed: string[], protected: string[], errors: string[], applied: boolean }}
 */
export function pruneBackups(dir, options = {}) {
  const keep = Number.isFinite(options.keep) && /** @type {number} */ (options.keep) >= 0
    ? /** @type {number} */ (options.keep)
    : DEFAULT_KEEP
  const guaranteed = new Set((options.protect ?? []).map(p => resolve(p)))
  const apply = options.apply === true

  const rows = listBackups(dir)
  const kept = rows.slice(0, keep)
  const overflow = rows.slice(keep)
  const protectedRows = overflow.filter(row => guaranteed.has(resolve(row.path)))
  const candidates = overflow.filter(row => !guaranteed.has(resolve(row.path)))

  /** @type {string[]} */
  const errors = []
  /** @type {string[]} */
  const removed = []
  for (const row of candidates) {
    if (!apply) continue
    try {
      rmSync(row.path, { recursive: true, force: true })
      removed.push(row.path)
    } catch (error) {
      errors.push(`${row.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    dir,
    keep,
    total: rows.length,
    kept: [...kept, ...protectedRows].map(row => row.path),
    removed: apply ? removed : candidates.map(row => row.path),
    protected: protectedRows.map(row => row.path),
    errors,
    applied: apply,
  }
}
