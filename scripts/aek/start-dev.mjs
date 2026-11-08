#!/usr/bin/env node
/**
 * AEK Desktop v0 — DEV mode launcher.
 *
 * Brands Electron.app → ~/Applications/AEK DEV.app (or AEK DEV Next.app),
 * starts the web server and Electron in parallel, waits briefly for web ready.
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
  attachCleanup,
  APP_ROOT,
  CDP_PORT,
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
// ports here would take down the other slot as well.
await killSlot(slot)

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

  console.log(`[start] launching dev ${cfg.productName} (CDP → port ${CDP_PORT})`)
  const app = spawn(electronBin(devAppDirForSlot(slot), cfg.devAppName), [
    mainJs,
    `--remote-debugging-port=${CDP_PORT}`,
  ], { cwd: APP_ROOT, stdio: 'inherit' })

  app.on('close', code => { web.kill(); process.exit(code ?? 0) })
})()
