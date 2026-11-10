#!/usr/bin/env node
/**
 * CLI over the backups retention policy.
 *
 * The policy itself is `@cheezmil/coraek/backups`, not a copy here: the RUNTIME
 * needs the same rule (`schema.mjs` snapshots before it migrates), and a
 * packaged app cannot import from `scripts/` — which the app does not ship. Two
 * implementations of "which folders may I delete" is how one of them eventually
 * deletes the wrong one, so there is exactly one and this file only parses
 * arguments and prints.
 *
 * Snapshots are `<container>/backups/<YYYYMMDD…-what>`; only entries whose name
 * starts with a date are candidates, so `.DS_Store` and hand-made folders are
 * never touched. The newest N (default 10) survive, and the newest one is never
 * a candidate — it is the snapshot the caller just wrote.
 *
 * Default is a read-only preview. `--yes` deletes.
 *
 * Usage:
 *   node scripts/aek/backup-retention.mjs                    # preview
 *   node scripts/aek/backup-retention.mjs --keep 5 --yes     # keep 5
 *   node scripts/aek/backup-retention.mjs --json             # machine-readable
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_KEEP, listBackups, pruneBackups } from '../../packages/aek/base/coraek/backups.mjs'
import { aekBackupsPath } from '../../packages/aek/base/coraek/home.mjs'

// Re-exported for the callers that already import them from this path.
export { DEFAULT_KEEP, listBackups, pruneBackups }

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

// Only run when invoked directly: migrate/promote/relocate import `pruneBackups`.
const INVOKED = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url : false
if (INVOKED) main()
