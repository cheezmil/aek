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
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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
  APP_ROOT,
  SLOTS,
} from './shared-logic.mjs'

const slot = process.argv[2] ?? 'aek'
if (!SLOTS[slot]) {
  console.error(`[start] unknown slot: ${slot} (expected one of ${Object.keys(SLOTS).join(', ')})`)
  process.exit(2)
}
const cfg = SLOTS[slot]

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

if (isBuildFresh(slot)) {
  console.log('[start] build is up to date, skipping packaging')
} else {
  console.log('[start] build is stale or missing — rebuilding')
  buildTs()
  packageApp(slot)
}

// Install only when we actually produced a bundle in this run. A fresh build
// may also mean "already installed" (the dist copy is pruned after install, see
// pruneDistApp), in which case re-installing has no source and would abort.
if (existsSync(distAppPath(slot))) {
  if (!installApp(slot)) {
    console.error('[start] install failed, aborting')
    process.exit(1)
  }
  if (pruneDistApp(slot)) {
    console.log('[start] dist 里的 .app 副本已清理 — Spotlight 只保留 ~/Applications 里的一个')
  }
} else {
  console.log('[start] 没有新的打包产物，沿用 ~/Applications 里已安装的版本')
}

const web = spawnWebServerForSlot(slot)
attachCleanup(web)

// Wait for web server, then launch prod AEK
;(async () => {
  const ready = await waitForWebReady(2000, cfg.webPort)
  if (!ready) console.warn('[start] web server not ready in time, launching anyway')
  else console.log('[start] web app ready')

  const appPath = prodAppDirForSlot(slot)
  console.log(`[start] launching prod ${cfg.productName} from ${appPath}`)
  const app = spawn('open', ['-a', appPath], { stdio: 'inherit' })

  app.on('close', code => { web.kill(); process.exit(code ?? 0) })
})()
