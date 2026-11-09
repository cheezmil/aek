#!/usr/bin/env node
/**
 * Spotlight audit for the AEK desktop apps.
 *
 * Spotlight (and Finder) list EVERY `<product>.app` on the volume, so a
 * leftover build artifact under `apps/aek-desktop/v0/dist/` shows up as a
 * second "AEK" / "AEK Next" next to the installed one. This script answers
 * "what does the system currently see, and which of those is a duplicate?"
 * in one command instead of hand-running `mdfind` / `PlistBuddy` / `mv`.
 *
 * Scope: only bundles whose CFBundleIdentifier starts with `com.aek.` are
 * considered AEK desktop apps. Anything else that merely matches "aek" in its
 * name (e.g. `com.cheezmil.aekqp`, the quick-prompt tool) is reported as
 * external and never touched.
 *
 * Default (no arguments) is a READ-ONLY report: it writes nothing, deletes
 * nothing, and starts nothing. `--yes` deletes the repo-side build copies
 * (the only ones this project owns); stray copies outside the repo are only
 * listed, never deleted.
 *
 * Usage:
 *   node scripts/aek/spotlight-report.mjs            # report (read-only)
 *   node scripts/aek/spotlight-report.mjs --json     # same, machine readable
 *   node scripts/aek/spotlight-report.mjs --yes      # delete repo build copies
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join, sep } from 'node:path'
import {
  APP_ROOT,
  SLOTS,
  slotConfig,
  prodAppDirForSlot,
  pruneDistApp,
  distAppPath,
} from './shared-logic.mjs'

const AEK_BUNDLE_PREFIX = 'com.aek.'
const DIST_ROOT = join(APP_ROOT, 'dist')

const rest = process.argv.slice(2)
const asJson = rest.includes('--json')
const confirmed = rest.includes('--yes')

/**
 * Read one key out of a bundle's Info.plist.
 * @param appPath - the .app bundle.
 * @param key - the plist key to read.
 * @returns {string|null} the value, or null when it cannot be read.
 */
function plistValue(appPath, key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(appPath, 'Contents', 'Info.plist')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return null
  }
}

/**
 * Human-readable size of a bundle (`du -sh`), best effort.
 * @param appPath - the .app bundle.
 * @returns {string} e.g. `288M`, or `?` when du fails.
 */
function bundleSize(appPath) {
  try {
    return execFileSync('du', ['-sh', appPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\t')[0] ?? '?'
  } catch {
    return '?'
  }
}

/**
 * `<product>.app` bundles directly under a directory, depth-limited.
 *
 * The filesystem is scanned in ADDITION to the mdfind results: mds needs a few
 * seconds (sometimes minutes) to index a just-built bundle, so a fresh
 * duplicate would otherwise be invisible exactly when it matters.
 *
 * @param dir - directory to walk.
 * @param depth - how many levels down to look.
 * @returns {string[]} absolute bundle paths.
 */
function scanForApps(dir, depth) {
  let out = []
  if (depth < 0) return out
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const full = join(dir, entry.name)
    if (entry.name.endsWith('.app')) out.push(full)
    else out = out.concat(scanForApps(full, depth - 1))
  }
  return out
}

/**
 * Every application bundle Spotlight currently has indexed, plus the ones this
 * project can create (repo build output and the install dir), scanned directly.
 * @returns {string[]} absolute bundle paths (may include stale entries).
 */
function candidateBundles() {
  const found = new Set()
  try {
    for (const line of execFileSync('/usr/bin/mdfind', ["kMDItemContentType == 'com.apple.application-bundle'"], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\n')) {
      if (line.endsWith('.app')) found.add(line)
    }
  } catch {
    // mdfind missing or indexing disabled — the direct scans below still work.
  }
  for (const app of scanForApps(DIST_ROOT, 3)) found.add(app)
  for (const app of scanForApps(dirname(prodAppDirForSlot('aek')), 0)) found.add(app)
  return [...found]
}

/**
 * Is this path inside the repo's build output directory?
 * @param p - absolute path.
 * @returns {boolean} true when the path lives under `<repo>/dist`.
 */
function isBuildArtifactPath(p) {
  return p === DIST_ROOT || p.startsWith(DIST_ROOT + sep)
}

/**
 * Which slot owns this bundle id?
 * @param bundleId - the CFBundleIdentifier.
 * @returns {string|null} the slot name, or null when unknown.
 */
function slotForBundleId(bundleId) {
  for (const name of Object.keys(SLOTS)) {
    if (slotConfig(name).bundleId === bundleId || slotConfig(name).appId === bundleId) return name
  }
  return null
}

const seen = new Map()
for (const appPath of candidateBundles()) {
  // Cheap pre-filter on the file name, then decide by bundle id so a foreign
  // app that merely starts with "aek" is not mistaken for an AEK build.
  if (!basename(appPath).toLowerCase().includes('aek')) continue
  const bundleId = plistValue(appPath, 'CFBundleIdentifier')
  if (!bundleId) continue
  if (seen.has(appPath)) continue
  seen.set(appPath, {
    path: appPath,
    bundleId,
    version: plistValue(appPath, 'CFBundleShortVersionString'),
    managed: bundleId.startsWith(AEK_BUNDLE_PREFIX),
    exists: existsSync(appPath),
  })
}

const entries = [...seen.values()]
const managed = entries.filter(e => e.managed)
const external = entries.filter(e => !e.managed)

const byBundleId = new Map()
for (const entry of managed) {
  const slot = slotForBundleId(entry.bundleId)
  entry.slot = slot
  entry.keeper = slot ? entry.path === prodAppDirForSlot(slot) : false
  entry.artifact = isBuildArtifactPath(entry.path)
  entry.role = entry.keeper ? 'keeper' : entry.artifact ? 'build-artifact' : 'stray'
  entry.size = bundleSize(entry.path)
  const list = byBundleId.get(entry.bundleId) ?? []
  list.push(entry)
  byBundleId.set(entry.bundleId, list)
}

const duplicates = managed.filter(e => !e.keeper)
const plan = duplicates.filter(e => e.artifact && e.slot).map(e => ({ slot: e.slot, path: e.path, size: e.size }))

const report = {
  indexedTotal: entries.length,
  managed: managed.map(({ path, bundleId, version, slot, role, keeper, size }) => ({ path, bundleId, version, slot, role, keeper, size })),
  external: external.map(({ path, bundleId, version }) => ({ path, bundleId, version, note: 'not an AEK desktop app — never touched' })),
  duplicates: duplicates.length,
  plan,
  cleaned: [],
}

if (!asJson) {
  console.log(`[spotlight] ${entries.length} indexed bundle(s) matching "aek"\n`)
  for (const [bundleId, list] of byBundleId) {
    console.log(`${bundleId}`)
    for (const entry of list) {
      const mark = entry.role === 'keeper' ? '✓ keep' : entry.role === 'build-artifact' ? '✗ duplicate (build artifact)' : '✗ duplicate (copy outside the repo)'
      console.log(`  ${mark}`)
      console.log(`    ${entry.path}`)
      console.log(`    version ${entry.version ?? '?'}  slot ${entry.slot ?? '?'}  ${entry.size}${entry.exists ? '' : '  [missing on disk]'}`)
    }
    console.log('')
  }
  for (const entry of external) {
    console.log(`external (not touched): ${entry.path}  ${entry.bundleId} ${entry.version ?? '?'}`)
  }
  if (duplicates.length === 0) {
    console.log('\n[spotlight] no duplicates — one app per slot')
  } else {
    console.log(`\n[spotlight] ${duplicates.length} duplicate(s); ${plan.length} of them are repo build copies`)
    for (const item of plan) console.log(`  ${confirmed ? 'delete' : 'would delete'} [${item.slot}] ${item.path}  ${item.size}`)
    const stray = duplicates.filter(e => !e.artifact)
    for (const entry of stray) console.log(`  manual: ${entry.path} is a copy outside the repo — listed only, not deleted`)
    if (!confirmed) console.log('\n[spotlight] read-only; pass --yes to delete the repo build copies')
  }
}

if (confirmed && plan.length > 0) {
  for (const item of plan) {
    // pruneDistApp owns the canonical path (and documents why the copy must
    // go); a stale slot layout is removed the same way so it cannot survive.
    const canonical = item.path === distAppPath(item.slot)
    let done = false
    try {
      if (canonical) done = pruneDistApp(item.slot)
      else if (existsSync(item.path)) { rmSync(item.path, { recursive: true, force: true }); done = true }
    } catch (err) {
      console.error(`[spotlight] delete failed for ${item.path}: ${String(err.message).split('\n')[0]}`)
    }
    if (done) {
      report.cleaned.push(item.path)
      console.log(`[spotlight] deleted ${item.path}`)
    } else if (existsSync(item.path)) {
      console.error(`[spotlight] could not delete ${item.path}`)
    }
  }
}

if (asJson) console.log(JSON.stringify(report, null, 2))
process.exit(0)
