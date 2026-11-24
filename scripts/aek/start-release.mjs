#!/usr/bin/env node
/**
 * AEK Desktop v0 — RELEASE (prod) mode launcher.
 *
 * Builds TypeScript, packages with electron-builder, signs, installs to
 * ~/Applications/<product>.app, then launches alongside the web server.
 *
 * The build is rebuilt whenever the sources changed — a fingerprint of the
 * bundled inputs is compared against the one stored next to the artifact, so
 * "the dist folder exists" never means "the app is up to date".
 *
 * Usage: node scripts/aek/start-release.mjs [aek|next]
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  killSlot,
  spawnWebServerForSlot,
  waitForWebReady,
  buildTs,
  packageApp,
  installApp,
  pruneDistApp,
  distAppPath,
  prodAppDirForSlot,
  isBuildFresh,
  attachCleanup,
  electronBin,
  bundleExecutable,
  electronEnv,
  slotHome,
  SLOTS,
  slotConfig,
} from './shared-logic.mjs'

/**
 * BQ11 round: terminate EVERY shell main that belongs to this slot BEFORE we
 * launch a new one — the "launching a new instance must terminate the old one"
 * rule, enforced mechanically. This is ps-based (process table), not lock-
 * based: a clobbered duplicate that the slot lock no longer names is still
 * found and killed, and the affected slots' pid locks are cleared. A shell
 * that refuses to die aborts the launch instead of leaving two instances.
 * @param {string} slot
 */
function stopSlotShells(slot) {
  const here = dirname(fileURLToPath(import.meta.url))
  const r = spawnSync(process.execPath, [join(here, 'shell-instances.mjs'), '--stop', '--slot', slot], {
    encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (r.status !== 0) {
    console.error(`[start] previous shell instance(s) for slot ${slot} could not be terminated — aborting (single-instance rule)`)
    process.exit(3)
  }
}

const slot = process.argv[2] ?? 'aek'
// BF-4 lane round: accept built-in slots AND registered lanes (coraek/slots).
let cfg
try {
  cfg = slotConfig(slot)
} catch {
  cfg = undefined
}
if (!cfg) {
  console.error(`[start] unknown slot: ${slot} (expected one of ${Object.keys(SLOTS).join(', ')} or a registered lane)`)
  process.exit(2)
}

console.log(`[start] AEK Desktop v0  mode=prod  slot=${slot}`)

// Terminate THIS slot's previous instance only. Killing by the shared default
// ports here would take down the other slot as well. A FOREIGN process holding
// one of our ports is never killed — we abort and let the user decide.
const cleared = await killSlot(slot)
if (cleared.foreign.length > 0) {
  console.error(`[start] port conflict: ${cleared.foreign.map(f => `${f.kind} :${f.port} held by pid ${f.pid}`).join(', ')}`)
  console.error('[start] refusing to start — the holding process is not ours')
  process.exit(3)
}
if (cleared.stuck.length > 0) {
  console.error(`[start] previous instance did not exit: ${cleared.stuck.join(' ')}`)
  process.exit(3)
}

// Single-instance rule (BQ11 round): killSlot only reaches pids named in the
// slot lock or holding our ports. A clobbered duplicate shell that the lock
// no longer names would still be alive and would coexist with the new shell.
// Sweep the whole process table for this slot's shell mains and clear the
// locks before we build/launch, so exactly one instance ever runs.
stopSlotShells(slot)

if (isBuildFresh(slot)) {
  console.log('[start] build is up to date, skipping packaging')
} else {
  console.log('[start] build is stale or missing — rebuilding')
  buildTs()
  packageApp(slot)
}

// Install only when we actually have a bundle to install. A fresh build may
// also mean "already installed" (the dist copy is pruned after install, see
// pruneDistApp below), in which case re-installing has no source and would
// abort.
if (existsSync(distAppPath(slot))) {
  if (!installApp(slot)) {
    console.error('[start] install failed, aborting')
    process.exit(1)
  }
} else {
  console.log('[start] 没有新的打包产物，沿用 ~/Applications 里已安装的版本')
}

// Remove EVERY dist .app copy (all arch halves), not just the canonical one:
// a leftover x64 half in `dist/<slot>/mac/` was the duplicate app Spotlight
// listed next to the installed one (复盘 §200 坑 131 — the old prune only
// removed `mac-arm64`, so `mac/` survived every build; user principle m02053).
if (pruneDistApp(slot)) {
  console.log('[start] dist 里的 .app 副本已清理（全 arch）— Spotlight 只保留 ~/Applications 里的一个')
}

const web = spawnWebServerForSlot(slot)
attachCleanup(web)

// Wait for web server, then launch prod AEK
;(async () => {
  const ready = await waitForWebReady(2000, cfg.webPort)
  if (!ready) console.warn('[start] web server not ready in time, launching anyway')
  else console.log('[start] web app ready')

  const appPath = prodAppDirForSlot(slot)
  // Launch the bundle's main executable DIRECTLY with a sanitized env, not via
  // `open -a` (LaunchServices). On this host the DSH harness exports
  // ELECTRON_RUN_AS_NODE=1 + NODE_OPTIONS into the launchd session, and a
  // LaunchServices-launched AEK.app inherits both: the Electron binary then
  // boots headless as a node CLI and silently exits (rc 0) — the "prod shell
  // dies in 1s" symptom. electronEnv() strips both vars; the app's slot/port
  // identity is passed explicitly so it locks the right slot's pid file.
  const exe = bundleExecutable(appPath) ?? cfg.productName
  const bin = electronBin(appPath, exe)
  const env = electronEnv({
    DSH_HOME: slotHome(slot),
    AEK_HOME: slotHome(slot),
    AEK_SLOT: slot,
    AEK_WEB_PORT: String(cfg.webPort),
    AEK_CDP_PORT: String(cfg.cdpPort),
  })
  console.log(`[start] launching prod ${cfg.productName} from ${bin} (direct spawn, sanitized env)`)
  const app = spawn(bin, [], { env, stdio: 'inherit' })

  app.on('close', code => { web.kill(); process.exit(code ?? 0) })
})()
