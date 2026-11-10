#!/usr/bin/env node
/**
 * One-shot migration: flat data roots -> slot container.
 *
 *   before: ~/.aek        (the `aek` slot's data root)
 *           ~/.aek-next   (the `next` slot's data root)
 *   after:  ~/.aek/current
 *           ~/.aek/next
 *           ~/.aek/backups/<ts>-pre-layout/   (manifest + rollback record)
 *
 * The move invalidates every consumer-side skill link: `~/.claude/skills/x`
 * points at `../../.aek/skill-manager/skills/x`, which no longer exists once
 * the hub lives at `~/.aek/current/skill-manager`. Those links cannot follow on
 * their own (a relative link is computed once, and from outside the container
 * it has to spell every level out), so the migration REPAIRS THEM ITSELF as its
 * last step — no separate manual pass, no window where other agents see zero
 * skills. `--no-repair` exists only for debugging.
 *
 * Both slot directories are REAL directories. No symlink is ever created for
 * the old `~/.aek-next` path: a link would let one slot's writes land inside
 * the other's tree, which is exactly the isolation this layout exists to give.
 *
 * Why `mv` and not `cp`: both roots live on the same volume, so every step is
 * a rename — instant and space-free. Copying 1.7 GB would need double the disk
 * and would leave a window where both copies exist.
 *
 * Why a manifest instead of a full backup: the moves are reversible in place
 * (`--rollback`), and a real copy of 1.7 GB is what the user already has in
 * their own snapshot tooling.
 *
 * SAFETY (all deliberate):
 *   - Dry run by default. Nothing is created, moved, deleted or written until
 *     `--yes` is passed.
 *   - Refuses to run while ANY slot is running. A live shell or web server
 *     holds file handles under the old root; renaming underneath it produces a
 *     split-brain (process writes to the old inode, new path sees nothing).
 *   - Refuses to run when the two roots are not on the same device (a rename
 *     would fail halfway through the sequence).
 *   - Idempotent: an already-migrated container is detected and left alone.
 *   - Every failure path reports exactly which step failed; the sequence is
 *     ordered so the container is only renamed into place at the very end.
 *   - `backups/` is capped at {@link DEFAULT_KEEP} snapshots after the move, so
 *     repeated layout experiments cannot grow it without bound.
 *
 * Usage:
 *   node scripts/aek/migrate-data-root.mjs                # plan, read-only
 *   node scripts/aek/migrate-data-root.mjs --yes          # migrate
 *   node scripts/aek/migrate-data-root.mjs --rollback <snapshot-dir> --yes
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAekRoot } from '../../packages/aek/base/coraek/home.mjs'
import { SLOT_DIRS, SLOTS, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { manifestFor, resolveDir } from '../../packages/aek/base/coraek/paths.mjs'
import { DEFAULT_KEEP, pruneBackups } from './backup-retention.mjs'

/** Folder name of the skill hub inside a slot (and inside a flat container). */
const HUB_DIRNAME = 'skill-manager'

/** Suffix of the pre-container second root (`<container>-next`). */
const LEGACY_NEXT_SUFFIX = '-next'

/** Directory inside the container that holds migration records. */
const BACKUP_DIRNAME = 'backups'

const ARGS = process.argv.slice(2)
const APPLY = ARGS.includes('--yes')
const NO_REPAIR = ARGS.includes('--no-repair')
/**
 * TEST-ONLY escape hatch, mirroring `promote.mjs`. The self-test migrates a
 * throwaway container while the developer's own apps hold 1685/1687, and the
 * port guard cannot tell those apart from the fake slot's. Never use it on a
 * real data root.
 */
const SKIP_RUNNING_CHECK = ARGS.includes('--no-running-check')
const ROLLBACK_AT = ARGS.indexOf('--rollback')
const ROLLBACK_DIR = ROLLBACK_AT >= 0 ? ARGS[ROLLBACK_AT + 1] : undefined
const KEEP_AT = ARGS.indexOf('--keep-backups')
const KEEP_BACKUPS = KEEP_AT >= 0 ? Number(ARGS[KEEP_AT + 1]) : DEFAULT_KEEP
if (KEEP_AT >= 0 && (!Number.isInteger(KEEP_BACKUPS) || KEEP_BACKUPS < 1)) {
  console.error(`error: --keep-backups needs an integer ≥ 1, got ${String(ARGS[KEEP_AT + 1])}`)
  process.exit(1)
}

/**
 * `AEK_ROOT` is honoured on purpose: it is the documented "where all slots
 * live" variable, and without it the migration could not be exercised on a
 * throwaway container at all. Every step is still dry-run until `--yes`.
 */
const ROOT = resolveAekRoot(process.env)
const LEGACY_NEXT = join(dirname(ROOT), `${basename(ROOT)}${LEGACY_NEXT_SUFFIX}`)
const CURRENT = join(ROOT, SLOT_DIRS.aek)
const NEXT = join(ROOT, SLOT_DIRS.next)
const BACKUPS = join(ROOT, BACKUP_DIRNAME)

/** @param {string} msg */
function say(msg) { console.log(msg) }
/** @param {string} msg */
function fail(msg) { console.error(`error: ${msg}`); process.exit(1) }

/** @param {string} p @returns {boolean} */
function isDir(p) {
  try { return lstatSync(p).isDirectory() } catch { return false }
}
/** @param {string} p @returns {boolean} */
function isLink(p) {
  try { return lstatSync(p).isSymbolicLink() } catch { return false }
}
/** @param {string} p @returns {boolean} */
function exists(p) { return existsSync(p) }

/**
 * Pids currently listening on a port.
 * @param {number} port @returns {string[]}
 */
function listenPids(port) {
  try {
    return execFileSync('/usr/sbin/lsof',
      ['-nP', `-iTCP:${String(port)}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' })
      .split('\n').filter(l => l.startsWith('p')).map(l => l.slice(1)).filter(Boolean)
  } catch { return [] }
}

/**
 * Anything still running for either slot. `lsof` alone is enough: both slots
 * always own a listening web port while they run, and a shell without a web
 * backend is not a working shell.
 * @returns {string[]} human-readable "slot pid port" lines.
 */
function runningProcesses() {
  const busy = []
  for (const slot of Object.keys(SLOTS)) {
    for (const port of [SLOTS[slot].webPort, SLOTS[slot].cdpPort]) {
      for (const pid of listenPids(port)) busy.push(`${slot}: pid ${pid} holds port ${port}`)
    }
  }
  return busy
}

/** @returns {string} timestamp for snapshot directory names. */
function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Where the link repair pass lives — computed from this file, never spelled out. */
const REPAIR_SCRIPT = fileURLToPath(new URL('./repair-skill-links.mjs', import.meta.url))

/**
 * Run the consumer-link repair pass against THIS container.
 *
 * `AEK_ROOT` is pinned to the container we just migrated: the child must look
 * at the layout this script produced, never at an inherited environment.
 * @param {boolean} apply - false previews (nothing is written), true rewrites.
 * @param {string[]} [assumeGone] - directories to treat as gone even though they
 *   still resolve (the flat hub, during the dry run).
 * @returns {{ ok: boolean, counts: Record<string, number>, output: string }} the child's tally.
 */
function repairLinks(apply, assumeGone = []) {
  const args = [REPAIR_SCRIPT, '--json', ...(apply ? ['--yes'] : [])]
  for (const dir of assumeGone) args.push('--assume-gone', dir)
  const options = { encoding: 'utf8', env: { ...process.env, AEK_ROOT: ROOT }, stdio: ['ignore', 'pipe', 'pipe'] }
  try {
    const out = execFileSync(process.execPath, args, options)
    return { ok: true, counts: JSON.parse(out).counts ?? {}, output: out }
  } catch (error) {
    // A non-zero exit means "some links are still dangling", not "the pass
    // crashed": keep the tally so the caller can report it instead of guessing.
    const raw = /** @type {any} */ (error)
    const out = `${raw.stdout ?? ''}${raw.stderr ?? ''}`
    try {
      return { ok: false, counts: JSON.parse(String(raw.stdout ?? '')).counts ?? {}, output: out }
    } catch {
      return { ok: false, counts: {}, output: out }
    }
  }
}

/**
 * Where the skill hub sits while the container is still FLAT: directly under the
 * container, not under a slot. The manifest's `dirs` table is consulted anyway,
 * so a renamed hub folder is still found.
 * @returns {string} absolute hub path in the flat layout.
 */
function flatHubPath() {
  const manifest = manifestFor(ROOT)
  return manifest ? resolveDir(manifest.dirs, ROOT, HUB_DIRNAME) : join(ROOT, HUB_DIRNAME)
}

/**
 * Merge extra fields into a snapshot record that already exists.
 * @param {string} snapshot - snapshot directory.
 * @param {Record<string, unknown>} extras - fields to add.
 */
function recordExtras(snapshot, extras) {
  const file = join(snapshot, 'manifest.json')
  let current = {}
  try {
    current = JSON.parse(readFileSync(file, 'utf8'))
  } catch { /* a missing record must not block the repair report */ }
  try {
    writeFileSync(file, JSON.stringify({ ...current, ...extras }, null, 2), 'utf8')
  } catch (error) {
    say(`warning: could not update ${file} (${/** @type {Error} */ (error).message})`)
  }
}

/** @param {string} p @returns {number} st_dev, or -1 */
function deviceOf(p) {
  try { return statSync(p).dev } catch { return -1 }
}

/** Top-level entries that belong INSIDE a slot (everything but the container's own furniture). */
function slotEntries() {
  if (!isDir(ROOT)) return []
  return readdirSync(ROOT).filter((name) => name !== BACKUP_DIRNAME
    && name !== SLOT_DIRS.aek && name !== SLOT_DIRS.next)
}

/** @returns {boolean} true when the container already has the new shape. */
function alreadyMigrated() {
  if (!isDir(CURRENT)) return false
  // New layout: both slot directories exist as real directories and the old
  // flat path is gone.
  return isDir(NEXT) && !exists(LEGACY_NEXT)
}

/**
 * Entries a freshly-initialised slot directory contains and nothing more.
 * Anything else (`browser/`, `plugins.json`, `skill-manager/`, …) proves real
 * data, which this script must never move aside.
 */
const SKELETON_ENTRIES = new Set([
  '.DS_Store', '.anonymous-user-id', '.credentials.yaml', '.aek-runtime.pid',
  'profiles', 'storages',
])

/** @param {string} dir @returns {boolean} */
function isSkeleton(dir) {
  try {
    const names = readdirSync(dir)
    return names.length > 0 && names.every((name) => SKELETON_ENTRIES.has(name))
  } catch { return false }
}

function plan() {
  say(`container:    ${ROOT}`)
  say(`aek slot ->   ${CURRENT}`)
  say(`next slot ->  ${NEXT}`)
  say(`legacy next:  ${LEGACY_NEXT}${isDir(LEGACY_NEXT) ? '  (dir)' : '  (absent)'}`)
  say('')
  if (alreadyMigrated()) {
    say('state: already migrated — nothing to do.')
    return
  }
  const entries = slotEntries()
  say(`state: flat layout. ${String(entries.length)} top-level entr${entries.length === 1 ? 'y' : 'ies'} must move into ${SLOT_DIRS.aek}/:`)
  for (const name of entries) say(`  - ${name}`)
  say('')
  say('steps (all renames on one volume, instant):')
  say(`  1. write record  ${join(BACKUPS, '<ts>-pre-layout', 'manifest.json')}`)
  say(`  2. move the entries above into a staging dir, then rename it to ${SLOT_DIRS.aek}/`)
  say(`  3. rename ${LEGACY_NEXT} -> ${SLOT_DIRS.next}/  (a REAL directory, never a symlink)`)
  say(`  4. re-point consumer skill links at the new hub  (${NO_REPAIR ? 'SKIPPED by --no-repair' : 'automatic'})`)
  say(`  5. keep the newest ${String(KEEP_BACKUPS)} snapshots in ${BACKUPS}`)
  say('')
  if (!NO_REPAIR) {
    // The flat hub still resolves right now, so it has to be declared "about to
    // be gone" for the preview to see the breakage the move will cause.
    const preview = repairLinks(false, [flatHubPath()])
    const counts = preview.counts
    const atRisk = counts.wouldBreak ?? 0
    if (counts.broken === undefined) {
      say('warning: the link preview did not report a tally; the repair step will still run.')
    } else if (atRisk === 0) {
      say('links: nothing points at the flat hub — the repair step will have nothing to re-point.')
    } else {
      say(`links: ${String(atRisk)} consumer link(s) point at the flat hub and will be re-pointed at ${SLOT_DIRS.aek}/skill-manager right after the move.`)
    }
  }
  if (!exists(LEGACY_NEXT)) {
    say('warning: the next root does not exist; step 3 is skipped (only the `aek` slot moves).')
  }
  say('dry run: no files were changed. Re-run with --yes to apply.')
}

function migrate() {
  if (alreadyMigrated()) {
    say('already migrated — nothing to do.')
    return
  }
  if (!isDir(ROOT)) fail(`container ${ROOT} does not exist; nothing to migrate.`)

  const busy = SKIP_RUNNING_CHECK ? [] : runningProcesses()
  if (busy.length > 0) {
    console.error('refusing to migrate while AEK is running:')
    for (const line of busy) console.error(`  - ${line}`)
    console.error('stop both slots first:  node scripts/aek/slots.mjs --stop-all')
    process.exit(1)
  }

  const hasLegacyNext = isDir(LEGACY_NEXT)
  if (hasLegacyNext && deviceOf(ROOT) !== deviceOf(LEGACY_NEXT)) {
    fail(`${LEGACY_NEXT} is on another volume; a rename would fail halfway. Move it manually first.`)
  }

  const entries = slotEntries()
  const snapshot = join(BACKUPS, `${stamp()}-pre-layout`)
  mkdirSync(snapshot, { recursive: true })

  // A reader that already knows the NEW layout can create `<container>/current`
  // and `<container>/next` as empty skeletons before this script runs (a
  // `slots.mjs --stop-all` does exactly that while resolving both roots). Move
  // those aside instead of letting `rename` fail with ENOTEMPTY halfway.
  //
  // Guard: only a SKELETON may be moved aside. A directory that already holds
  // real data (browser/, plugins.json, …) means the migration already ran or
  // the user pointed the container somewhere unexpected — never touch it.
  for (const [dir, label] of [[CURRENT, 'skeleton-current'], [NEXT, 'skeleton-next']]) {
    if (!isDir(dir)) continue
    if (!isSkeleton(dir)) {
      fail(`${dir} already holds data; refusing to move it aside. Run with --rollback if a migration was interrupted.`)
    }
    renameSync(dir, join(snapshot, label))
    say(`[0/7] moved pre-built skeleton ${dir} -> ${label}/`)
  }
  writeFileSync(join(snapshot, 'manifest.json'), JSON.stringify({
    kind: 'aek-data-root-layout',
    layout: 'flat -> container',
    createdAt: new Date().toISOString(),
    container: ROOT,
    movedInto: SLOT_DIRS.aek,
    entries: entries.map((name) => {
      const full = join(ROOT, name)
      let bytes = 0
      try { bytes = isDir(full) ? 0 : statSync(full).size } catch { /* ignore */ }
      return { name, kind: isDir(full) ? 'dir' : 'file', bytes }
    }),
    nextRoot: hasLegacyNext ? LEGACY_NEXT : null,
  }, null, 2), 'utf8')
  say(`[1/7] record  ${snapshot}/manifest.json`)

  const staging = join(snapshot, 'staging')
  mkdirSync(staging)
  for (const name of entries) {
    try {
      renameSync(join(ROOT, name), join(staging, name))
    } catch (error) {
      fail(`move "${name}" failed (${/** @type {Error} */ (error).message}). The staging dir is ${staging}; nothing else was touched.`)
    }
  }
  say(`[2/7] moved ${String(entries.length)} entries into staging`)

  try {
    renameSync(staging, CURRENT)
  } catch (error) {
    fail(`rename staging -> ${CURRENT} failed (${/** @type {Error} */ (error).message}); recover with --rollback ${snapshot}`)
  }
  say(`[3/7] ${SLOT_DIRS.aek}/ in place`)

  if (hasLegacyNext) {
    try {
      renameSync(LEGACY_NEXT, NEXT)
    } catch (error) {
      fail(`rename ${LEGACY_NEXT} -> ${NEXT} failed (${/** @type {Error} */ (error).message}); recover with --rollback ${snapshot}`)
    }
    say(`[4/7] ${LEGACY_NEXT} -> ${SLOT_DIRS.next}/`)
  } else {
    say('[4/7] no legacy next root; skipped')
  }

  if (exists(LEGACY_NEXT)) {
    // Should be unreachable: the rename above moved it. Never create a link in
    // its place — say so loudly instead of hiding the inconsistency.
    say(`[5/7] ${LEGACY_NEXT} still exists; left untouched (inspect it manually)`)
  } else {
    say('[5/7] old flat path removed; both slots are real directories')
  }

  verify()

  // 6. Re-point consumer links. Written as its own step, not "run this later":
  // until it has run, every other agent (`~/.claude/skills`, `~/.qoder/skills`,
  // …) sees a hub that does not exist. A failure here is reported, not fatal —
  // the data is migrated and safe, only the links are still stale.
  if (NO_REPAIR) {
    say('[6/7] link repair skipped (--no-repair)')
    recordExtras(snapshot, { linkRepair: { skipped: true } })
  } else {
    const repair = repairLinks(true)
    const counts = repair.counts
    say(
      `[6/7] links: ${String(counts.repointed ?? 0)} re-pointed, ` +
        `${String(counts.pruned ?? 0)} pruned, ${String(counts.unresolved ?? 0)} unrelated` +
        `${repair.ok ? '' : '  (some links still dangle — see the repair report)'}`,
    )
    if (!repair.ok) console.error(repair.output.trim())
    recordExtras(snapshot, { linkRepair: { skipped: false, ok: repair.ok, counts } })
    if (!repair.ok) process.exitCode = 1
  }

  // 7. Cap `backups/`. The snapshot just written is protected by mtime order,
  // and passed explicitly so an unexpected clock cannot make it the oldest.
  const pruned = pruneBackups(BACKUPS, { keep: KEEP_BACKUPS, protect: [snapshot], apply: true })
  say(
    `[7/7] backups: ${String(pruned.total)} snapshots, kept ${String(pruned.kept.length)}` +
      `${pruned.removed.length > 0 ? `, removed ${String(pruned.removed.length)} older` : ''}`,
  )
  for (const error of pruned.errors) console.error(`  ! ${error}`)

  say('')
  say('done. Restart with:  node scripts/aek/slots.mjs --start-all')
}

function rollback(dir) {
  const snapshot = dir ? resolve(dir) : undefined
  if (!snapshot) fail('--rollback needs the snapshot directory printed by the migration.')
  if (!exists(snapshot)) fail(`snapshot not found: ${snapshot}`)
  const busy = SKIP_RUNNING_CHECK ? [] : runningProcesses()
  if (busy.length > 0) {
    console.error('refusing to roll back while AEK is running:')
    for (const line of busy) console.error(`  - ${line}`)
    process.exit(1)
  }

  if (isLink(LEGACY_NEXT)) {
    rmSync(LEGACY_NEXT)
    say(`removed stray symlink ${LEGACY_NEXT}`)
  }
  if (isDir(NEXT) && !exists(LEGACY_NEXT)) {
    renameSync(NEXT, LEGACY_NEXT)
    say(`${SLOT_DIRS.next}/ -> ${LEGACY_NEXT}`)
  }
  if (isDir(CURRENT)) {
    for (const name of readdirSync(CURRENT)) {
      const target = join(ROOT, name)
      if (exists(target)) fail(`refusing to overwrite ${target}; move it away first.`)
      renameSync(join(CURRENT, name), target)
    }
    rmdirSync(CURRENT)
    say(`${SLOT_DIRS.aek}/ contents restored to ${ROOT}`)
  }
  // The manifest stays behind on purpose: backups/ is the container's own
  // furniture and keeping the record costs nothing.

  // Rolling back moves the hub to the flat path, so the links that the
  // migration re-pointed are stale again — same class of breakage, same fix.
  if (NO_REPAIR) {
    say('link repair skipped (--no-repair); consumer links still point at the container layout')
  } else {
    const repair = repairLinks(true)
    const counts = repair.counts
    say(`links: ${String(counts.repointed ?? 0)} re-pointed back at the flat hub`)
    if (!repair.ok) console.error(repair.output.trim())
    recordExtras(snapshot, { rollbackAt: new Date().toISOString(), rollbackLinkRepair: { ok: repair.ok, counts } })
    if (!repair.ok) process.exitCode = 1
  }
  say(`rollback complete. Record kept at ${snapshot}`)
}

function verify() {
  const problems = []
  for (const name of readdirSync(ROOT)) {
    if (![SLOT_DIRS.aek, SLOT_DIRS.next, BACKUP_DIRNAME].includes(name)) {
      problems.push(`unexpected entry in container: ${name}`)
    }
  }
  for (const slot of Object.keys(SLOTS)) {
    const home = slotHome(slot, { AEK_ROOT: ROOT })
    if (!isDir(home)) problems.push(`slot root missing: ${home}`)
  }
  if (isLink(NEXT)) problems.push('next slot is a symlink; it must be a real directory')
  if (isLink(CURRENT)) problems.push('current slot is a symlink; it must be a real directory')
  if (exists(LEGACY_NEXT)) problems.push(`${LEGACY_NEXT} still exists; the flat layout was not cleaned up`)
  if (problems.length > 0) {
    console.error('verification failed:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  say('verified: container holds only the two slots + backups, both real directories.')
}

if (ROLLBACK_AT >= 0) {
  if (!APPLY) {
    say(`would roll back using ${ROLLBACK_DIR ?? '(missing snapshot)'}`)
    say('dry run: no files were changed. Re-run with --yes to apply.')
  } else {
    rollback(ROLLBACK_DIR)
  }
} else if (APPLY) {
  migrate()
} else {
  plan()
}
