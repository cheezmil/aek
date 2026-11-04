#!/usr/bin/env node
/**
 * AEK Desktop v0 — DEV mode launcher.
 *
 * Brands Electron.app → ~/Applications/AEK DEV.app,
 * starts the web server and Electron in parallel, waits briefly for web ready.
 *
 * Usage: node scripts/aek/start-dev.mjs
 */
import { spawn } from 'node:child_process'
import {
  killThisMode,
  spawnWebServer,
  waitForWebReady,
  brandDevBundle,
  electronBin,
  mainJs,
  devAppDir,
  attachCleanup,
  APP_ROOT,
  CDP_PORT,
} from './shared-logic.mjs'

console.log('[start] AEK Desktop v0  mode=dev')

await killThisMode()

if (!brandDevBundle()) {
  console.error('[start] branding failed, aborting')
  process.exit(1)
}

const web = spawnWebServer()
attachCleanup(web)

// Wait for web server, then launch Electron
;(async () => {
  const ready = await waitForWebReady(2000)
  if (!ready) console.warn('[start] web server not ready in time, launching anyway')
  else console.log('[start] web app ready')

  console.log(`[start] launching dev AEK (CDP → port ${CDP_PORT})`)
  const app = spawn(electronBin(devAppDir), [
    mainJs,
    `--remote-debugging-port=${CDP_PORT}`,
  ], { cwd: APP_ROOT, stdio: 'inherit' })

  app.on('close', code => { web.kill(); process.exit(code ?? 0) })
})()
