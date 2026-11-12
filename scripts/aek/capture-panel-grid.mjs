#!/usr/bin/env node
/**
 * capture-panel-grid — the UI-round screenshot grid for one slot.
 *
 * For every console panel it drives `capture-ui.mjs` three times:
 *   1. `--scroll-top` (default flow): expanded-rail top shot + the
 *      collapsed-rail shot the default flow takes while restoring the rail.
 *   2. `--scroll-bottom --no-collapse`: bottom shot with the restored rail.
 * A wedged CDP session cannot hang the grid: `capture-ui` exits 1 under its
 * own 90s watchdog, so each attempt is bounded; after the 2nd failed attempt
 * for a panel the shell half is restarted (arbiter stop-half/start-half +
 * CDP wait — with the observed "stuck shell needs a second SIGTERM" handling)
 * before the final attempt.
 *
 * SAFETY: no `--yes` = read-only plan (panel list, out dir, CDP reachability
 * per slot). Nothing is written or killed.
 *
 * Usage:
 *   node scripts/aek/capture-panel-grid.mjs                     # plan (aek slot)
 *   node scripts/aek/capture-panel-grid.mjs --slot next --yes   # shoot the grid
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS, slotHome } from './shared-logic.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const yes = argv.includes('--yes')
const slotIndex = argv.indexOf('--slot')
const slotName = slotIndex >= 0 ? argv[slotIndex + 1] : 'aek'
const slotCfg = SLOTS[slotName]
if (slotCfg === undefined) {
  process.stderr.write(`unknown --slot ${String(slotName)} — expected ${Object.keys(SLOTS).join(' | ')}\n`)
  process.exit(2)
}

// Row labels as the console renders them in zh-CN (packages/aek/coraek-plugins/
// aek-home/src/client/i18n.tsx `panel.*`). The matcher is substring-based, so
// each entry must be unique among the row labels.
const PANELS = ['运行实例管理', 'Web Search', '插件管理', 'Skill Manager', 'Prompt Manager', '设置', '关于']

const outRoot = join(slotHome(slotCfg.slot), 'shots', 'panel-grid')

/** Probe the slot's CDP endpoint (bounded; the packaged shell has none). */
function cdpUp() {
  try {
    const res = fetch(`http://127.0.0.1:${String(slotCfg.cdpPort)}/json/list`, { signal: AbortSignal.timeout(4000) })
    return res.then(r => r.ok).catch(() => false)
  } catch { return false }
}

/** One bounded capture-ui attempt for a panel. @returns true when both shots are done. */
function attempt(label, outDir) {
  const top = spawnSync('node', [join(HERE, 'capture-ui.mjs'), '--slot', slotCfg.slot, '--yes', '--panel', label, '--scroll-top', '--motion', '--out', outDir], { stdio: ['ignore', 'pipe', 'pipe'] })
  if (top.status !== 0) {
    process.stdout.write(`  [grid] ${label}: top+collapse attempt failed (exit ${String(top.status)})\n`)
    return false
  }
  const bottom = spawnSync('node', [join(HERE, 'capture-ui.mjs'), '--slot', slotCfg.slot, '--yes', '--panel', label, '--scroll-bottom', '--no-collapse', '--motion', '--out', outDir], { stdio: ['ignore', 'pipe', 'pipe'] })
  if (bottom.status !== 0) {
    process.stdout.write(`  [grid] ${label}: bottom attempt failed (exit ${String(bottom.status)})\n`)
    return false
  }
  process.stdout.write(`  [grid] ${label}: ok\n`)
  return true
}

/**
 * Restart the slot's shell half: SIGTERM (the observed wedged shell needed a
 * SECOND SIGTERM, so wait-and-retry instead of assuming one is enough), then
 * start a fresh shell and wait until CDP answers.
 */
async function restartShell() {
  process.stdout.write('  [grid] restarting shell half…\n')
  const stop = spawnSync('node', [join(HERE, 'arbiter.mjs'), 'stop-half', slotCfg.slot, 'shell'], { stdio: 'pipe' })
  process.stdout.write(`  [grid] stop-half: ${String(stop.stdout).trim()}\n`)
  // Up to 20s for the exit; re-SEND SIGTERM to a still-alive pid (never KILL
  // from here — the arbiter owns kill semantics). `slots.mjs --check` reports
  // `shell running (pid N)` per slot; only this slot's section is inspected.
  for (let i = 0; i < 20; i++) {
    const probe = spawnSync('node', [join(HERE, 'slots.mjs'), '--check'], { stdio: 'pipe' })
    const section = String(probe.stdout).split(/\n(?=\[(aek|next)\])/).find(s => s.startsWith(`[${slotCfg.slot}]`)) ?? ''
    if (!section.includes('running (pid')) break
    const m = section.match(/running \(pid (\d+)\)/)
    if (m !== null) spawnSync('kill', ['-TERM', m[1]], { stdio: 'ignore' })
    await new Promise(r => setTimeout(r, 1000))
  }
  const start = spawnSync('node', [join(HERE, 'arbiter.mjs'), 'start-half', slotCfg.slot, 'shell'], { stdio: 'pipe' })
  process.stdout.write(`  [grid] start-half: ${String(start.stdout).trim()}\n`)
  for (let i = 0; i < 20; i++) {
    if (await cdpUp()) { process.stdout.write('  [grid] CDP back\n'); return }
    await new Promise(r => setTimeout(r, 1000))
  }
  process.stdout.write('  [grid] CDP still down after shell restart\n')
}

async function main() {
  if (!yes) {
    const up = await cdpUp()
    process.stdout.write(`[grid] plan (slot ${slotCfg.slot}, CDP ${slotCfg.cdpPort} ${up ? 'up' : 'DOWN'}):\n`)
    for (const label of PANELS) process.stdout.write(`  - ${label}: top+collapse, bottom → ${join(outRoot, label)}\n`)
    process.stdout.write('[grid] dry run: pass --yes to shoot\n')
    return
  }
  for (const label of PANELS) {
    const outDir = join(outRoot, label)
    for (let attemptNo = 1; attemptNo <= 3; attemptNo++) {
      process.stdout.write(`[grid] ${label} (attempt ${String(attemptNo)}/3)\n`)
      if (attempt(label, outDir)) break
      if (attemptNo === 2) await restartShell()
    }
  }
  process.stdout.write(`[grid] done → ${outRoot}\n`)
}

await main()
