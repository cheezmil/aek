#!/usr/bin/env node
/**
 * Re-cast the DEV `AEK.app` / `AEK Next.app` bundles WITHOUT launching them.
 *
 * R10 / R20 (2026-11-09): the freshly emitted Electron main process and the
 * `NSAccessibilityUsageDescription` Info.plist key only reach the installed
 * app when `brandDevBundle()` rebuilds it. `desktop.mjs dev aek --yes` already
 * does that for the AEK slot and then launches the single instance; this script
 * covers the OTHER slot (and can do both) without creating a second window.
 *
 * SAFETY: with NO arguments this is a **read-only dry run**. `--yes` performs
 * the (reversible — the previous bundle is kept as the rollback base) swap.
 * `--only=aek|next` limits the slots.
 *
 * Usage:
 *   node scripts/aek/brand-dev-bundles.mjs                 # dry run
 *   node scripts/aek/brand-dev-bundles.mjs --only=next --yes
 *   node scripts/aek/brand-dev-bundles.mjs --yes           # both slots
 *
 * @module scripts/aek/brand-dev-bundles
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { brandDevBundle, devAppDirForSlot } from './shared-logic.mjs'

/**
 * `codesign -dv` prints to stderr, so read the merged output. Kept local:
 * `desktop.mjs` has the same helper but does not export it.
 * @param {string} appPath - bundle path.
 * @returns {{ authority: string|null, adhoc: boolean }} signing identity.
 */
function signingIdentity(appPath) {
  try {
    const out = execSync(`codesign -dv --verbose=2 "${appPath}" 2>&1`, { encoding: 'utf8' })
    return {
      authority: out.match(/^Authority=(.*)$/mu)?.[1]?.trim() ?? null,
      adhoc: /^Signature=adhoc/mu.test(out),
    }
  } catch {
    return { authority: null, adhoc: false }
  }
}

const args = process.argv.slice(2)
const yes = args.includes('--yes')
const onlyArg = args.find(arg => arg.startsWith('--only='))
const only = onlyArg?.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean)
for (const arg of args) {
  if (arg !== '--yes' && !arg.startsWith('--only=')) throw new Error(`unknown argument: ${arg}`)
}
const slots = ['aek', 'next'].filter(slot => only === undefined || only.includes(slot))
if (slots.length === 0) throw new Error('no slot selected')

const execute = yes
process.stdout.write(`[brand-bundles] mode = ${execute ? 'EXECUTE' : 'DRY RUN (read-only)'}\n`)
for (const slot of slots) {
  const dir = devAppDirForSlot(slot)
  const plist = join(dir, 'Contents', 'Info.plist')
  const hasDescription = existsSync(plist)
    && readFileSync(plist, 'utf8').includes('NSAccessibilityUsageDescription')
  const sign = existsSync(dir) ? signingIdentity(dir) : undefined
  process.stdout.write(
    `[brand-bundles] ${slot}: ${dir} | installed=${String(existsSync(dir))}`
      + ` | NSAccessibilityUsageDescription=${String(hasDescription)}`
      + ` | signed=${sign?.authority ?? 'unknown'} | adhoc=${String(sign?.adhoc ?? false)}\n`,
  )
}
if (!execute) {
  process.stdout.write('[brand-bundles] dry run complete; pass --yes to re-cast.\n')
  process.exit(0)
}

let failed = 0
for (const slot of slots) {
  process.stdout.write(`\n[brand-bundles] === re-casting ${slot} ===\n`)
  if (!brandDevBundle(slot)) {
    process.stderr.write(`[brand-bundles] FAILED ${slot}\n`)
    failed++
    continue
  }
  const plist = join(devAppDirForSlot(slot), 'Contents', 'Info.plist')
  const ok = existsSync(plist) && readFileSync(plist, 'utf8').includes('NSAccessibilityUsageDescription')
  const sign = signingIdentity(devAppDirForSlot(slot))
  if (!ok || sign?.adhoc === true) {
    process.stderr.write(`[brand-bundles] verification FAILED ${slot}\n`)
    failed++
  } else {
    process.stdout.write(`[brand-bundles] OK ${slot} (${sign?.authority ?? 'signed'})\n`)
  }
}
process.exit(failed === 0 ? 0 : 1)
