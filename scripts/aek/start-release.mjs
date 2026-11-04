#!/usr/bin/env node
/**
 * AEK Desktop v0 — RELEASE (prod) mode launcher.
 *
 * Builds TypeScript, packages with electron-builder, codesigns,
 * installs to ~/Applications/AEK.app, then launches alongside the web server.
 *
 * Usage: AEK_MODE=prod node scripts/aek/start-release.mjs
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import {
  killThisMode,
  spawnWebServer,
  waitForWebReady,
  buildTs,
  packageApp,
  signApp,
  installApp,
  prodAppDir,
  attachCleanup,
  APP_ROOT,
} from './shared-logic.mjs'

console.log('[start] AEK Desktop v0  mode=prod')

await killThisMode()

const DIST_APP = join(APP_ROOT, 'dist', 'mac-arm64', 'AEK.app')

if (!existsSync(DIST_APP)) {
  buildTs()
  packageApp()
} else {
  console.log('[start] build exists, skipping packaging')
}

signApp(DIST_APP)
installApp()

const web = spawnWebServer()
attachCleanup(web)

// Wait for web server, then launch prod AEK
;(async () => {
  const ready = await waitForWebReady(2000)
  if (!ready) console.warn('[start] web server not ready in time, launching anyway')
  else console.log('[start] web app ready')

  console.log(`[start] launching prod AEK from ${prodAppDir}`)
  const app = spawn('open', ['-a', prodAppDir], { stdio: 'inherit' })

  app.on('close', code => { web.kill(); process.exit(code ?? 0) })
})()
