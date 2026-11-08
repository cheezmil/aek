#!/usr/bin/env node
/**
 * AEK Desktop v0 — DEV mode launcher.
 *
 * Brands Electron.app → ~/Applications/AEK.app (or AEK Next.app — C1: the Dock
 * and Finder never show a "DEV" suffix), starts the web server and Electron in
 * parallel, waits briefly for web ready.
 *
 * Usage: node scripts/aek/start-dev.mjs [aek|next]
 */
import { spawn } from 'node:child_process'
import {
  killSlot,
  spawnWebServerForSlot,
  waitForWebReady,
  brandDevBundle,
  electronBin,
  mainJs,
  devAppDirForSlot,
  slotHome,
  electronEnv,
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

console.log(`[start] AEK Desktop v0  mode=dev  slot=${slot}`)

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

if (!brandDevBundle(slot)) {
  console.error('[start] branding failed, aborting')
  process.exit(1)
}

const web = spawnWebServerForSlot(slot)
attachCleanup(web)

// Wait for web server, then launch Electron
;(async () => {
  const ready = await waitForWebReady(2000, cfg.webPort)
  if (!ready) console.warn('[start] web server not ready in time, launching anyway')
  else console.log('[start] web app ready')

  console.log(`[start] launching dev ${cfg.productName} (CDP → port ${cfg.cdpPort})`)
  // The shell must know which slot it is: without AEK_SLOT / AEK_HOME it would
  // fall back to the default data root and lock the wrong slot's pid file.
  const env = electronEnv({
    DSH_HOME: slotHome(slot),
    AEK_HOME: slotHome(slot),
    AEK_SLOT: slot,
    AEK_WEB_PORT: String(cfg.webPort),
    AEK_CDP_PORT: String(cfg.cdpPort),
  })
  const app = spawn(electronBin(devAppDirForSlot(slot), cfg.devAppName), [
    mainJs,
    `--remote-debugging-port=${cfg.cdpPort}`,
  ], { cwd: APP_ROOT, env, stdio: 'inherit' })

  app.on('close', code => { web.kill(); process.exit(code ?? 0) })
})()
