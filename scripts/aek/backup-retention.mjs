#!/usr/bin/env node
/**
 * Bound `<container>/backups/` to the newest N snapshots (default 10).
 *
 * Three different scripts write into that folder — `migrate-data-root.mjs`
 * (`<ts>-pre-layout`), `promote.mjs` (`<ts>-pre-promote`) and the stray-shelf
 * cleanups (`<ts>-stray-…`). Each of them only ever ADDS, so the folder grows
 * without bound: a layout move plus a dozen promotions is a dozen trees, and
 * the 1.7 GB copy case makes that expensive rather than merely untidy.
 *
 * Two properties make deleting here safe enough to be automatic:
 *
 *   - **Name guard.** Only entries whose name starts with `YYYYMMDD` are ever
 *     candidates. `.DS_Store`, a hand-made `my-notes/`, a checkout someone
 *     dropped in — never touched, whatever their position in the sort. The
 *     timestamp prefix is also what proves the entry came from these scripts.
 *   - **Newest wins, and the newest is protected.** Sorting is by mtime, newest
 *     first, so the snapshot a caller just created is at index 0 and is never a
 *     candidate. Callers may additionally pass `protect` (absolute paths) for
 *     the case where an older snapshot is the one they are working on.
 *
 * Default is a read-only preview. `--yes` (or `apply: true`) deletes.
 *
 * Usage:
 *   node scripts/aek/backup-retention.mjs                    # preview
 *   node scripts/aek/backup-retention.mjs --keep 5 --yes     # keep 5
 *   node scripts/aek/backup-retention.mjs --json             # machine-readable
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { aekBackupsPath } from '../../packages/aek/base/coraek/home.mjs'

/** How many snapshots to keep when a caller does not say. */
export const DEFAULT_KEEP = 10

/**
 * A snapshot directory this tool is allowed to delete. Both spellings in use:
 * `20261111-031342-pre-layout` (dashed time) and `20261110044913-stray-…`
 * (time glued to the date). The leading `YYYYMMDD` is the provenance marker —
 * everything else in the folder is somebody's business, not ours.
 */
const SNAPSHOT_NAME = /^\d{8}(\d{6}|-\d{6})?-/

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

/** @param {string} message */
function say(message) {
  process.stdout.write(`${message}\n`)
}

function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--yes')
  const json = argv.includes('--json')
  const dirAt = argv.indexOf('--dir')
  const keepAt = argv.indexOf('--keep')
  const dir = dirAt >= 0 && argv[dirAt + 1] ? resolve(argv[dirAt + 1]) : aekBackupsPath()
  const keepRaw = keepAt >= 0 ? Number(argv[keepAt + 1]) : DEFAULT_KEEP
  if (!Number.isInteger(keepRaw) || keepRaw < 1) {
    process.stderr.write(`[backups] --keep 需要一个 ≥1 的整数，收到 ${String(argv[keepAt + 1])}\n`)
    process.exit(1)
  }

  const result = pruneBackups(dir, { keep: keepRaw, apply })

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2))
    return
  }

  say(`备份目录 ${result.dir}`)
  say(`${apply ? '执行' : '预览（加 --yes 执行）'}：共 ${String(result.total)} 份，保留最新 ${String(result.keep)} 份`)
  for (const path of result.kept) say(`  保留 ${path}`)
  for (const path of result.protected) say(`  保护 ${path}`)
  for (const path of result.removed) say(`  ${apply ? '已删除' : '将删除'} ${path}`)
  if (result.total <= result.keep) say('  无需清理')
  if (result.errors.length > 0) {
    for (const line of result.errors) process.stderr.write(`[backups] 删除失败 ${line}\n`)
    process.exitCode = 1
  }
}

// Only run when invoked directly: migrate/promote import `pruneBackups`.
const INVOKED = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url : false
if (INVOKED) main()
