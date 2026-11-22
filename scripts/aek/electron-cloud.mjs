#!/usr/bin/env node
/**
 * X5 electron cloud-build prompter.
 *
 * The Electron shell is cloud-built on GitHub Actions
 * (`.github/workflows/electron.yml`, manual `workflow_dispatch` ONLY — it
 * never runs on push) and its artifacts land in the GITHUB release. A cloud
 * build is only worth running when the ELECTRON LAYER changed since the last
 * one: `apps/aek-desktop/v0/{src,lib}`, `electron-builder.config.mjs`,
 * `package.json` (electron version + build deps) and `entitlements.plist`
 * — i.e. exactly the inputs of `buildFingerprint()`. webui / host changes
 * need NO electron work at all (the shell just loads the web server URL).
 *
 * Usage:
 *   node scripts/aek/electron-cloud.mjs          # read-only: compare + advise
 *   node scripts/aek/electron-cloud.mjs --record # write the marker after a
 *                                                   successful cloud build
 *
 * The marker lives in the AEK home (`<AEK_HOME>/electron-cloud-fingerprint`),
 * not in the repository — a global clone (no local history) still gets a
 * coherent "dirty?" answer.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

async function main() {
  const record = process.argv.includes('--record')
  const { buildFingerprint } = await import('./shared-logic.mjs')
  const { aekHomePath } = await import('../../packages/aek/base/coraek/home.mjs')
  const fp = buildFingerprint()

  // The marker is machine-local state, not slot state: it lives in the AEK
  // home (resolved through the coraek home primitive — no derived paths).
  const markerPath = aekHomePath('electron-cloud-fingerprint')

  if (record) {
    writeFileSync(markerPath, `${fp}\n`, 'utf8')
    console.log(`[electron-cloud] marker recorded: ${fp} → ${markerPath}`)
    return
  }

  const previous = existsSync(markerPath) ? readFileSync(markerPath, 'utf8').trim() : null

  if (previous === null) {
    console.log(`[electron-cloud] no cloud build recorded yet (fingerprint ${fp})`)
    console.log('[electron-cloud] 建议：手动触发 GitHub Actions「electron-cloud-build」（输入 release tag，aek-desktop-v<major.minor.patch> 风格，取 apps/aek-desktop/v0/package.json 的版本），完成后跑 --record 落 marker。')
    return
  }
  if (previous === fp) {
    console.log(`[electron-cloud] electron 层自上次云编译以来无变化（fingerprint ${fp}）—— 无需云编译。`)
    return
  }
  console.log(`[electron-cloud] ⚠ electron 层代码已变化：fingerprint ${previous} → ${fp}`)
  console.log('[electron-cloud] 请手动触发 GitHub Actions「electron-cloud-build」（workflow_dispatch，输入 release tag，aek-desktop-v<major.minor.patch> 风格）—— 本工作流从不随 push 自动触发。')
  console.log('[electron-cloud] 云编译成功后跑：node scripts/aek/electron-cloud.mjs --record')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
