#!/usr/bin/env node
/**
 * shell-instances.mjs — enumerate every running AEK desktop shell and flag
 * duplicate instances per slot (W round, 2026-11-15).
 *
 * Incident: `open -a AEK` is ambiguous on this machine — LaunchServices has
 * MULTIPLE registered `AEK.app` bundles (the production install plus the
 * slot's dev-variant bundle under the slot data root), so it can launch a
 * dev-variant shell instead of the production one, leaving two shells for
 * the same slot's backend running side by side. This is the mechanical
 * check half of the "only one AEK.app instance" rule: run it BEFORE any
 * shell launch, and it is wired into `dev-cycle verify`.
 *
 * Usage (no flags = read-only report, zero side effects, always exit 0):
 *   node scripts/aek/shell-instances.mjs            # report
 *   node scripts/aek/shell-instances.mjs --check   # exit 1 when a slot has >1 shell main
 *   node scripts/aek/shell-instances.mjs --json    # machine-readable
 *
 * Safety conventions:
 *   - Read-only; it never signals or kills anything.
 *   - No hardcoded data-root paths: the slot dev-variant location comes from
 *     the slot manifest (`@cheezmil/coraek/slots`), the production install
 *     lives in the user's Applications dir. No machine-specific values in
 *     source.
 *   - ps-based, POSIX only; Windows is reported as skipped, not failed.
 */
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { SLOTS, slotConfig, slotHome } from '../../packages/aek/base/coraek/slots.mjs'

const argv = process.argv.slice(2)
const CHECK = argv.includes('--check')
const JSON_OUT = argv.includes('--json')
const INSTALL_DIR = join(homedir(), 'Applications')

/**
 * Known AEK shell bundle locations per slot: the production install counts
 * as the same slot as its dev-variant bundle, so two mains of one slot are
 * a violation.
 * @returns {Array<{bundle:string, family:string, slot:string}>}
 */
function bundleMap() {
  const map = []
  for (const slot of Object.keys(SLOTS)) {
    const cfg = slotConfig(slot)
    map.push({
      bundle: join(INSTALL_DIR, `${cfg.productName}.app`),
      family: 'production',
      slot,
    })
    map.push({
      bundle: join(slotHome(slot), 'dev', `${cfg.devAppName}.app`),
      family: 'dev-variant',
      slot,
    })
  }
  return map
}

/** The main executable name of a bundle is its bundle base name. */
function mainNameOf(entry) {
  return entry.bundle.split('/').slice(-1)[0].replace(/\.app$/, '')
}

/**
 * @returns {Array<{pid:number, exe:string, family:string, slot:string}>|null}
 *  null when the platform cannot be scanned (Windows / no ps).
 */
function scan() {
  if (process.platform === 'win32') return null
  let out
  try {
    out = execFileSync('ps', ['-Ao', 'pid=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
  const map = bundleMap()
  const found = []
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (!m) continue
    const pid = Number(m[1])
    const command = m[2]
    // Helper processes never count: they are named "... Helper" on macOS
    // and carry --type= flags on Windows.
    if (process.platform === 'darwin') {
      if (command.includes('Helper')) continue
      // The main executable path of a known bundle is deterministic; match
      // it whole so names with spaces ("AEK Next") stay intact.
      const known = map.find((entry) => {
        const mainExe = `${entry.bundle}/Contents/MacOS/${mainNameOf(entry)}`
        return command === mainExe || command.startsWith(`${mainExe} `)
      })
      if (!known) {
        // Unknown AEK-family bundle: still report it (as external), but only
        // when it looks like a shell main, not a helper or a plugin node.
        if (!/AEK( Next)?\.app\/Contents\/MacOS\/AEK( Next)?(\s|$)/.test(command)) continue
      }
      found.push({
        pid,
        exe: known ? `${known.bundle}/Contents/MacOS/${mainNameOf(known)}` : command.trim(),
        family: known?.family ?? 'external',
        slot: known?.slot ?? 'unknown',
      })
    } else {
      if (command.includes('--type=')) continue
      if (!/AEK( Next)?\.exe(\s|$)/.test(command)) continue
      const known = map.find((entry) => command.includes(entry.bundle))
      found.push({
        pid,
        exe: command.trim().split(' ')[0],
        family: known?.family ?? 'external',
        slot: known?.slot ?? 'unknown',
      })
    }
  }
  return found
}

function main() {
  const instances = scan()
  if (instances === null) {
    console.log('shell-instances: this platform cannot be scanned (ps-based, POSIX); skipped.')
    return 0
  }
  const bySlot = new Map()
  for (const inst of instances) {
    bySlot.set(inst.slot, [...(bySlot.get(inst.slot) ?? []), inst])
  }
  const duplicates = [...bySlot.values()].filter((list) => list.length > 1)

  if (JSON_OUT) {
    console.log(JSON.stringify({ instances, duplicates: duplicates.map((d) => d.map((i) => i.pid)) }, null, 2))
  } else {
    console.log(`AEK shell instances: ${instances.length}`)
    for (const inst of instances) {
      console.log(`  pid=${inst.pid} ${inst.family} (${inst.slot} slot) ${inst.exe}`)
    }
    if (instances.length === 0) console.log('  (none running)')
  }

  if (CHECK) {
    if (duplicates.length > 0) {
      for (const dup of duplicates) {
        console.error(
          `  DUPLICATE: slot "${dup[0].slot}" has ${String(dup.length)} shell mains (${dup.map((i) => i.pid).join(', ')}) — kill all but one`,
        )
      }
      return 1
    }
    console.log('check: at most one shell main per slot — OK')
  }
  return 0
}

process.exitCode = main()
