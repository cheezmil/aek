#!/usr/bin/env node
/**
 * AEK data root — full copy between slots.
 *
 * AEK ships two equal instances (`AEK` → `~/.aek`, `AEK Next` → `~/.aek-next`).
 * A fresh Next install has no data root, so the web server would start with an
 * empty profile: no skills, no provider keys, no websearch key pool. This tool
 * copies one slot's data root into the other.
 *
 * Design rules (all of them deliberate):
 *   - The direction is ALWAYS chosen explicitly by the operator. The tool never
 *     syncs, never mirrors and never guesses which side is "newer".
 *   - The copy is COMPLETE. Categories are not trimmed: skills, provider
 *     credentials, the websearch key pool, prompt-manager state, quick-git
 *     centre config — all of it comes across. Only genuine runtime artifacts
 *     (single-instance locks, window state, caches) are left behind, because
 *     copying those produces phantom state in the destination.
 *   - Dry run by default. `copy` requires `--yes`.
 *   - The destination is built in a staging directory and verified BEFORE it
 *     replaces anything, so a failure never leaves a half-written data root.
 *   - If the destination already exists it is moved aside to
 *     `<root>.bak.<timestamp>-pre-copy` instead of being deleted.
 *
 * Usage:
 *   node scripts/aek/data-root.mjs                              # plan (read-only)
 *   node scripts/aek/data-root.mjs plan --from aek --to next    # plan, read-only
 *   node scripts/aek/data-root.mjs status                       # both roots, read-only
 *   node scripts/aek/data-root.mjs copy --from aek --to next --yes
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { SLOTS, slotHome, slotConfig } from '../../packages/aek/base/coraek/slots.mjs'

const USAGE = `AEK data root

  data-root.mjs                                  plan (read-only, no changes)
  data-root.mjs plan [--from aek] [--to next]    plan, read-only
  data-root.mjs status                           both data roots, read-only
  data-root.mjs copy --from aek --to next --yes  copy one root into the other

Slots: ${Object.keys(SLOTS).join(' | ')}`

// ── Runtime artifacts that must NOT travel ───────────────────────────────────
// Copying these would create phantom state in the destination: a lock file
// would block the new instance from starting, and caches would carry the other
// instance's window layout and temporary files.
//
// This is a list of NAMES (matched against any path segment), not a list of
// directories, because the same artifact names appear at several depths
// (Electron writes `Cache` / `Code Cache` / `GPUCache` in every profile dir).
const EXCLUDED_NAMES = new Set([
  // Single-instance locks (Electron / Chromium).
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
  // The runtime pid lock written by the desktop shell.
  '.aek-runtime.pid',
  // Window / devtools state.
  'DevToolsActivePort',
  'Session Storage',
  'Network Persistent State',
  'TransportSecurity',
  // Caches.
  'Cache',
  'Code Cache',
  'GPUCache',
  'GPUPersistentCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GraphiteDawnCache',
  'blob_storage',
  // Housekeeping that carries no user state.
  '.DS_Store',
])

// ── Argument parsing ─────────────────────────────────────────────────────────

/**
 * Parse `--key value` / `--flag` style arguments.
 * @param {string[]} argv - the raw arguments.
 * @returns {Record<string, string | boolean>} the parsed options.
 */
function parseArgs(argv) {
  const out = /** @type {Record<string, string | boolean>} */ ({})
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

/**
 * Validate a slot name.
 * @param {unknown} value - the candidate slot.
 * @param {string} label - the option label used in the error message.
 * @returns {'aek' | 'next'} the validated slot.
 */
function requireSlot(value, label) {
  if (typeof value !== 'string' || !SLOTS[value]) {
    throw new Error(`${label} must be one of ${Object.keys(SLOTS).join(' | ')} (got ${String(value)})`)
  }
  return /** @type {'aek' | 'next'} */ (value)
}

// ── Inspection ────────────────────────────────────────────────────────────────

/**
 * Count files, directories and bytes under a root, and report how many
 * runtime artifacts would be skipped.
 * @param {string} root - the root to scan.
 * @returns {{ files: number, dirs: number, bytes: number, skipped: number, links: number }} the scan result.
 */
function scanRoot(root) {
  const stats = { files: 0, dirs: 0, bytes: 0, skipped: 0, links: 0 }
  if (!existsSync(root)) return stats
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (EXCLUDED_NAMES.has(entry.name)) {
        stats.skipped++
        continue
      }
      if (entry.isSymbolicLink()) {
        stats.links++
        continue
      }
      if (entry.isDirectory()) {
        stats.dirs++
        walk(full)
        continue
      }
      if (entry.isFile()) {
        stats.files++
        try { stats.bytes += statSync(full).size } catch { /* unreadable */ }
      }
    }
  }
  walk(root)
  return stats
}

/**
 * Does the slot look like it is running right now?
 *
 * Only the slot's OWN processes count as "running": the pid lock written by the
 * desktop shell, and a live process whose command line names this slot's data
 * root or its web port. A foreign program squatting on the port is reported
 * separately — it does not make the slot busy, but it WILL make the slot fail
 * to bind later, so it is worth surfacing.
 * @param {'aek' | 'next'} slot - the slot to probe.
 * @returns {{ running: boolean, reasons: string[], warnings: string[] }} the detection result.
 */
function slotRunning(slot) {
  const cfg = slotConfig(slot)
  const root = slotHome(slot)
  const reasons = []
  const warnings = []

  const lock = join(root, '.aek-runtime.pid')
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8').trim())
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0)
        reasons.push(`pid lock ${lock} → pid ${pid} alive`)
      } catch { /* stale lock */ }
    }
  }

  // A live process that explicitly points at this slot's data root or port.
  for (const port of [cfg.webPort, cfg.cdpPort]) {
    let pids = ''
    try {
      pids = execFileSync('/usr/sbin/lsof', ['-ti', `:${port}`], { encoding: 'utf8' }).trim()
    } catch { /* no listener */ }
    for (const pid of pids.split(/\s+/).filter(Boolean)) {
      let cmd = ''
      try {
        cmd = execFileSync('/bin/ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' }).trim()
      } catch { /* gone */ }
      if (cmd.includes(root) || cmd.includes(`:${port}`)) {
        reasons.push(`pid ${pid} is serving ${slot} port ${port} (${cmd.slice(0, 80)})`)
      } else {
        warnings.push(`port ${port} is held by a foreign process ${pid} (${cmd.slice(0, 80)})`)
      }
    }
  }

  return { running: reasons.length > 0, reasons, warnings }
}

/**
 * Print a human-readable report of one slot's data root.
 * @param {'aek' | 'next'} slot - the slot to describe.
 * @returns {void}
 */
function describeSlot(slot) {
  const cfg = slotConfig(slot)
  const root = slotHome(slot)
  const exists = existsSync(root)
  console.log(`\n[${slot}] ${cfg.productName}`)
  console.log(`  data root   ${root}${exists ? '' : '  (does not exist)'}`)
  if (exists) {
    const s = scanRoot(root)
    console.log(`  contents    ${s.files} files, ${s.dirs} dirs, ${s.links} symlinks, ${fmtBytes(s.bytes)}`)
    console.log(`  skipped     ${s.skipped} runtime artifacts (locks / window state / caches)`)
  }
  const run = slotRunning(slot)
  console.log(`  running     ${run.running ? 'YES' : 'no'}${run.reasons.length ? ` — ${run.reasons.join('; ')}` : ''}`)
  for (const warning of run.warnings) console.log(`  warning     ${warning}`)
}

/**
 * Format a byte count.
 * @param {number} bytes - the raw size.
 * @returns {string} a human-readable size.
 */
function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

// ── Copy ──────────────────────────────────────────────────────────────────────

/**
 * Copy one entry, honouring the exclusion list and preserving symlinks.
 * @param {string} src - the source path.
 * @param {string} dest - the destination path.
 * @param {string} srcRoot - the source root (for symlink relocation).
 * @param {string} destRoot - the destination root (for symlink relocation).
 * @param {{ copied: number, skipped: number, broken: number }} counters - mutable counters.
 * @returns {void}
 */
function copyEntry(src, dest, srcRoot, destRoot, counters) {
  const st = lstatSync(src)
  if (st.isSymbolicLink()) {
    const raw = readlinkSync(src)
    // Resolve the link against the SOURCE root. If it lands inside the source
    // root, re-point it at the same relative place in the destination root.
    // Links that point outside (or nowhere) are copied verbatim so we never
    // silently rewire a link to something else.
    const resolved = resolve(dirname(src), raw)
    if (resolved.startsWith(srcRoot + sep)) {
      const rel = relative(srcRoot, resolved)
      symlinkSync(relative(dirname(dest), join(destRoot, rel)), dest)
    } else {
      symlinkSync(raw, dest)
    }
    counters.copied++
    return
  }
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true })
    for (const entry of readdirSync(src)) {
      if (EXCLUDED_NAMES.has(entry)) {
        counters.skipped++
        continue
      }
      copyEntry(join(src, entry), join(dest, entry), srcRoot, destRoot, counters)
    }
    counters.copied++
    return
  }
  cpSync(src, dest)
  counters.copied++
}

/**
 * Rewrite the hardcoded fallback ports in the copied profile patches.
 *
 * `profiles/<profile>/cordis.patch.yml` pins the web port as
 * `ctx.webStartup.port ?? <fallback>`. The runtime always passes `--port`, so
 * the fallback only matters when the server is started without one — but it
 * must still name the RIGHT slot's port, otherwise a fallback start of AEK
 * Next would try to bind AEK's port.
 * @param {string} destRoot - the destination data root.
 * @param {number} fromPort - the source slot's web port.
 * @param {number} toPort - the destination slot's web port.
 * @returns {number} how many files were rewritten.
 */
function rewritePorts(destRoot, fromPort, toPort) {
  let rewritten = 0
  const profilesDir = join(destRoot, 'profiles')
  if (!existsSync(profilesDir)) return 0
  for (const profile of readdirSync(profilesDir)) {
    const file = join(profilesDir, profile, 'cordis.patch.yml')
    if (!existsSync(file)) continue
    const original = readFileSync(file, 'utf8')
    const updated = original.replace(
      new RegExp(`(port:[^\\n]*\\?\\?\\s*)${fromPort}\\b`, 'g'),
      `$1${toPort}`,
    )
    if (updated !== original) {
      writeFileSync(file, updated, 'utf8')
      rewritten++
    }
  }
  return rewritten
}

/**
 * Verify the copied root before it replaces anything.
 * @param {string} destRoot - the staging root.
 * @param {string} srcRoot - the source root.
 * @returns {{ ok: boolean, problems: string[] }} the verification result.
 */
function verifyCopy(destRoot, srcRoot) {
  const problems = []
  const src = scanRoot(srcRoot)
  const dest = scanRoot(destRoot)
  if (dest.files !== src.files) {
    problems.push(`file count differs: source ${src.files}, copy ${dest.files}`)
  }
  if (dest.links !== src.links) {
    problems.push(`symlink count differs: source ${src.links}, copy ${dest.links}`)
  }
  // The critical config: both profile patch files must exist in the copy.
  for (const profile of ['web', 'desktop']) {
    const file = join(destRoot, 'profiles', profile, 'cordis.patch.yml')
    if (!existsSync(file)) problems.push(`missing profiles/${profile}/cordis.patch.yml in the copy`)
  }
  return { ok: problems.length === 0, problems }
}

/**
 * Perform the copy.
 * @param {'aek' | 'next'} from - the source slot.
 * @param {'aek' | 'next'} to - the destination slot.
 * @returns {void}
 */
function runCopy(from, to) {
  const srcRoot = slotHome(from)
  const destRoot = slotHome(to)
  const fromCfg = slotConfig(from)
  const toCfg = slotConfig(to)

  if (!existsSync(srcRoot)) {
    console.error(`[copy] source data root does not exist: ${srcRoot}`)
    process.exit(2)
  }
  if (from === to) {
    console.error('[copy] source and destination are the same slot')
    process.exit(2)
  }

  // Refuse to copy into a slot that is running: the destination files would be
  // read and rewritten underneath a live process.
  const destRunning = slotRunning(to)
  if (destRunning.running) {
    console.error(`[copy] destination slot "${to}" is running — stop it first:`)
    for (const reason of destRunning.reasons) console.error(`         - ${reason}`)
    process.exit(3)
  }
  const srcRunning = slotRunning(from)
  if (srcRunning.running) {
    console.error(`[copy] source slot "${from}" is running — stop it first (files would change mid-copy):`)
    for (const reason of srcRunning.reasons) console.error(`         - ${reason}`)
    process.exit(3)
  }

  const staging = `${destRoot}.staging-${Date.now()}`
  console.log(`[copy] ${fromCfg.productName} (${srcRoot})`)
  console.log(`[copy]   → ${toCfg.productName} (${destRoot})`)
  console.log(`[copy] staging at ${staging}`)

  const counters = { copied: 0, skipped: 0, broken: 0 }
  try {
    copyEntry(srcRoot, staging, srcRoot, staging, counters)
  } catch (error) {
    console.error(`[copy] failed during copy: ${error instanceof Error ? error.message : String(error)}`)
    try { rmSync(staging, { recursive: true, force: true }) } catch { /* ignore */ }
    process.exit(4)
  }

  console.log(`[copy] copied ${counters.copied} entries, skipped ${counters.skipped} runtime artifacts`)

  const rewritten = rewritePorts(staging, fromCfg.webPort, toCfg.webPort)
  console.log(`[copy] rewrote the port fallback in ${rewritten} profile patch file(s) (${fromCfg.webPort} → ${toCfg.webPort})`)

  const verification = verifyCopy(staging, srcRoot)
  if (!verification.ok) {
    console.error('[copy] verification failed — the destination was left untouched:')
    for (const problem of verification.problems) console.error(`         - ${problem}`)
    try { rmSync(staging, { recursive: true, force: true }) } catch { /* ignore */ }
    process.exit(5)
  }
  console.log('[copy] verification passed')

  // Swap in. An existing destination is moved aside, never deleted.
  let backup = null
  if (existsSync(destRoot)) {
    backup = `${destRoot}.bak.${new Date().toISOString().replace(/[:.]/g, '-')}-pre-copy`
    renameSync(destRoot, backup)
    console.log(`[copy] previous destination kept at ${backup}`)
  }
  renameSync(staging, destRoot)
  console.log(`[copy] done — ${destRoot} is ready`)

  const run = slotRunning(to)
  console.log(`[copy] destination running: ${run.running ? 'YES' : 'no'}`)
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const command = argv.find(a => !a.startsWith('--')) ?? 'plan'
const options = parseArgs(argv)

try {
  switch (command) {
    case 'status': {
      for (const slot of Object.keys(SLOTS)) describeSlot(/** @type {'aek' | 'next'} */ (slot))
      console.log('')
      break
    }
    case 'plan': {
      const from = requireSlot(options.from ?? 'aek', '--from')
      const to = requireSlot(options.to ?? 'next', '--to')
      describeSlot(from)
      describeSlot(to)
      const src = scanRoot(slotHome(from))
      console.log(`\n[plan] would copy ${src.files} files (${fmtBytes(src.bytes)}) from "${from}" to "${to}"`)
      console.log(`[plan] ${src.skipped} runtime artifacts would be skipped (locks / window state / caches)`)
      console.log(`[plan] the port fallback in the profile patches would be rewritten ${slotConfig(from).webPort} → ${slotConfig(to).webPort}`)
      console.log(`[plan] run with --yes to execute: node scripts/aek/data-root.mjs copy --from ${from} --to ${to} --yes`)
      console.log('')
      break
    }
    case 'copy': {
      const from = requireSlot(options.from ?? 'aek', '--from')
      const to = requireSlot(options.to ?? 'next', '--to')
      if (!options.yes) {
        console.error('[copy] refusing to write without --yes')
        console.error(USAGE)
        process.exit(2)
      }
      runCopy(from, to)
      break
    }
    default: {
      console.log(USAGE)
      console.log('')
    }
  }
} catch (error) {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`)
  console.error(USAGE)
  process.exit(2)
}
