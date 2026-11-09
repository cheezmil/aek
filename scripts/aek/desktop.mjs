#!/usr/bin/env node
/**
 * AEK Desktop — per-slot CLI.
 *
 * AEK ships two equal apps built from one source tree: `AEK` and `AEK Next`.
 * They differ in bundle identity, data root and ports, so every action has to
 * name a slot. This is the single entry point for that.
 *
 * Default (no arguments) is a READ-ONLY status report — it never writes,
 * never starts and never stops anything. Actions require `--yes`.
 *
 * Usage:
 *   node scripts/aek/desktop.mjs                       # status (read-only)
 *   node scripts/aek/desktop.mjs status                # status (read-only)
 *   node scripts/aek/desktop.mjs build <aek|next> --yes
 *   node scripts/aek/desktop.mjs install <aek|next> --yes
 *   node scripts/aek/desktop.mjs dev <aek|next> --yes
 *   node scripts/aek/desktop.mjs rollback <aek|next> --yes
 *   node scripts/aek/desktop.mjs rollback <aek|next> --dev --yes
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SLOTS,
  slotConfig,
  slotHome,
  devAppDirForSlot,
  prodAppDirForSlot,
  isBuildFresh,
  buildFingerprint,
  rollbackDirForSlot,
  installApp,
  installDevBundle,
  pruneDistApp,
  distAppPath,
  killSlot,
  slotShellPids,
  slotShellKind,
  APP_ROOT,
} from './shared-logic.mjs'

const USAGE = `AEK Desktop CLI

  desktop.mjs                        status for both slots (read-only)
  desktop.mjs status                 same
  desktop.mjs build <slot> --yes     compile + package the slot
  desktop.mjs install <slot> --yes   install the packaged app into ~/Applications
  desktop.mjs dev <slot> --yes       brand the dev bundle and launch it
  desktop.mjs rollback <slot> --yes  restore the stashed previous prod bundle
  desktop.mjs rollback <slot> --dev --yes
                                     restore the stashed previous dev bundle
  desktop.mjs prune <slot|all> --yes delete leftover dist .app copies so
                                     Spotlight shows one app per slot

Slots: ${Object.keys(SLOTS).join(' | ')}`

/**
 * Read a plist key from a .app bundle.
 * @param {string} appPath - the bundle path.
 * @param {string} key - the plist key.
 * @returns {string|null} the value, or null when it cannot be read.
 */
function plistValue(appPath, key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(appPath, 'Contents', 'Info.plist')], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return null
  }
}

/**
 * Which certificate signed a bundle? An adhoc signature is a bug (the project
 * requires the Cheezmil Dev certificate), so it is worth surfacing.
 * @param {string} appPath - the bundle path.
 * @returns {{ authority: string|null, adhoc: boolean }} the signing identity.
 */
function signingIdentity(appPath) {
  try {
    // `codesign -dv` prints its report to stderr, so redirect it.
    const out = execSync(`codesign -dv --verbose=2 "${appPath}" 2>&1`, { encoding: 'utf8' })
    const authority = out.match(/^Authority=(.*)$/m)?.[1]?.trim() ?? null
    const adhoc = /^Signature=adhoc/m.test(out)
    return { authority, adhoc }
  } catch {
    return { authority: null, adhoc: false }
  }
}

/**
 * Is something listening on a port?
 * @param {number} port - the TCP port.
 * @returns {boolean} true when the port has a listener.
 */
function portListening(port) {
  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return out.trim().split('\n').length > 1
  } catch {
    return false
  }
}

/**
 * Is the slot's shell process alive?
 * @param {string} slot - the slot name.
 * @returns {{ alive: boolean, pid: number|null }} the shell state.
 */
/**
 * Report the slot's window from the PROCESS table, not from a pid file.
 *
 * `.aek-runtime.pid` only exists when one of these scripts launched the shell,
 * so a window opened from the Dock / Spotlight read as "not running" here while
 * it was plainly on screen. `slotShellPids` is the single detector the console
 * and the arbiter already use, and it also tells apart dev from packaged.
 * @param slot - 'aek' | 'next'.
 * @returns {{alive: boolean, pid: number|null, kind: 'dev'|'prod'|null}} window state.
 */
function shellState(slot) {
  const pids = slotShellPids(slot)
  return { alive: pids.length > 0, pid: pids[0] ?? null, kind: slotShellKind(slot) }
}

/**
 * Collect the status of every slot. Read-only.
 * @returns {Record<string, unknown>} the report.
 */
function status() {
  const slots = {}
  for (const name of Object.keys(SLOTS)) {
    const cfg = slotConfig(name)
    const devPath = devAppDirForSlot(name)
    const prodPath = prodAppDirForSlot(name)
    const distPath = join(APP_ROOT, 'dist', name, 'mac-arm64', `${cfg.productName}.app`)
    const shell = shellState(name)
    slots[name] = {
      identity: {
        productName: cfg.productName,
        appId: cfg.appId,
        bundleId: cfg.bundleId,
        webPort: cfg.webPort,
        cdpPort: cfg.cdpPort,
      },
      dataRoot: slotHome(name),
      devBundle: {
        path: devPath,
        installed: existsSync(devPath),
        bundleId: existsSync(devPath) ? plistValue(devPath, 'CFBundleIdentifier') : null,
        signature: existsSync(devPath) ? signingIdentity(devPath) : null,
      },
      prodBundle: {
        path: prodPath,
        installed: existsSync(prodPath),
        bundleId: existsSync(prodPath) ? plistValue(prodPath, 'CFBundleIdentifier') : null,
        signature: existsSync(prodPath) ? signingIdentity(prodPath) : null,
      },
      build: {
        path: distPath,
        exists: existsSync(distPath),
        fresh: isBuildFresh(name),
        fingerprint: buildFingerprint(),
      },
      running: {
        web: portListening(cfg.webPort),
        shell: shell,
      },
    }
  }
  return { slots }
}

/** Print the report in a compact human-readable form. */
function printStatus(report) {
  for (const [name, s] of Object.entries(report.slots)) {
    const id = s.identity
    console.log(`\n[${name}] ${id.productName}   (${id.bundleId})`)
    console.log(`  web ${id.webPort} / cdp ${id.cdpPort}   data root ${s.dataRoot}`)
    const dev = s.devBundle
    console.log(`  dev bundle   ${dev.installed ? 'present' : 'absent '}  ${dev.path}`)
    if (dev.installed) {
      console.log(`                id=${dev.bundleId}  signed=${dev.signature?.authority ?? 'unknown'}${dev.signature?.adhoc ? '  ← ADHOC!' : ''}`)
    }
    const prod = s.prodBundle
    console.log(`  prod bundle  ${prod.installed ? 'present' : 'absent '}  ${prod.path}`)
    if (prod.installed) {
      console.log(`                id=${prod.bundleId}  signed=${prod.signature?.authority ?? 'unknown'}${prod.signature?.adhoc ? '  ← ADHOC!' : ''}`)
    }
    const b = s.build
    console.log(`  build        ${b.exists ? (b.fresh ? 'present, up to date' : 'present, STALE') : 'absent '}  ${b.path}`)
    console.log(`                fingerprint ${b.fingerprint}`)
    const { shell } = s.running
    console.log(`  running      web=${s.running.web ? 'yes' : 'no'}  shell=${shell.alive ? `yes (pid ${shell.pid}, ${shell.kind ?? 'unknown'})` : 'no'}`)
  }
  console.log('')
}

const [command = 'status', ...rest] = process.argv.slice(2)
const args = rest.filter(a => a !== '--yes')
const confirmed = rest.includes('--yes')

if (command === 'status') {
  const report = status()
  printStatus(report)
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

if (command === 'prune') {
  // Spotlight shows every `<product>.app` on the volume, so a leftover dist
  // copy appears as a duplicate app next to the installed one. Print the plan
  // first; only `--yes` actually deletes (default stays read-only).
  const target = args[0] ?? 'all'
  const names = target === 'all' ? Object.keys(SLOTS) : [target]
  if (target !== 'all' && !SLOTS[target]) {
    console.error(`unknown slot: ${target} — expected one of ${Object.keys(SLOTS).join(', ')}, or "all"`)
    process.exit(2)
  }
  const leftover = names.map(name => ({ name, path: distAppPath(name) })).filter(e => existsSync(e.path))
  if (leftover.length === 0) {
    console.log('[prune] no leftover dist .app copies — nothing to do')
    process.exit(0)
  }
  for (const entry of leftover) console.log(`[prune] would delete ${entry.name}: ${entry.path}`)
  if (!confirmed) {
    console.error('[prune] pass --yes to delete these build artifacts')
    process.exit(2)
  }
  for (const entry of leftover) {
    if (pruneDistApp(entry.name)) console.log(`[prune] deleted ${entry.name}: ${entry.path}`)
  }
  process.exit(0)
}

if (!['build', 'install', 'dev', 'rollback'].includes(command)) {
  console.error(USAGE)
  process.exit(2)
}

const slot = args[0]
if (!SLOTS[slot]) {
  console.error(`unknown slot: ${slot ?? '(none)'} — expected one of ${Object.keys(SLOTS).join(', ')}`)
  process.exit(2)
}
if (!confirmed) {
  console.error(`"${command}" changes the machine. Re-run with --yes to confirm.`)
  process.exit(2)
}

if (command === 'rollback') {
  // T7: restore the stashed previous bundle. Terminate THIS slot's instance
  // first — a foreign process holding a port is never touched.
  void (async () => {
    const cleared = await killSlot(slot)
    if (cleared.foreign.length > 0) {
      console.error(`[rollback] port conflict: ${cleared.foreign.map(f => `${f.kind} :${f.port} held by pid ${f.pid}`).join(', ')}`)
      console.error('[rollback] refusing to run — the holding process is not ours')
      process.exit(3)
    }
    if (cleared.stuck.length > 0) {
      console.error(`[rollback] previous instance did not exit: ${cleared.stuck.join(' ')}`)
      process.exit(3)
    }
    const cfg = slotConfig(slot)
    const useDev = args.includes('--dev')
    const ok = useDev
      ? installDevBundle(slot)
      : installApp(slot, join(rollbackDirForSlot(slot), `${cfg.productName}.app.old`))
    process.exit(ok ? 0 : 1)
  })()
} else {
  // APP_ROOT is <repo>/apps/aek-desktop/v0 — three levels up to reach <repo>.
  // Using only two resolved to <repo>/apps/scripts/aek/... (which does not
  // exist) and made `dev` / `start-release` fail with MODULE_NOT_FOUND.
  const script = command === 'dev'
    ? join(APP_ROOT, '..', '..', '..', 'scripts', 'aek', 'start-dev.mjs')
    : join(APP_ROOT, '..', '..', '..', 'scripts', 'aek', 'start-release.mjs')
  execFileSync(process.execPath, [script, slot], { stdio: 'inherit' })
}
