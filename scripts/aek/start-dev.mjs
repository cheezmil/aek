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
import { execFileSync, spawn } from 'node:child_process'
import { openSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  slotConfig,
} from './shared-logic.mjs'
import { writeSlotLock } from '../../packages/aek/base/coraek/slot-lock.mjs'

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

// BF-4 shell-exclusive mode: a lane's LaunchAgent already serves the web, so
// --shell-only skips the web half entirely (no killSlot, no web spawn) and
// --detach (requires --shell-only) puts the shell in its own process group
// with log-file stdio, so the launcher exits while the shell keeps running.
const shellOnly = process.argv.includes('--shell-only')
const detach = shellOnly && process.argv.includes('--detach')

/**
 * Y round (B-round lesson, machine half): the dev shell boots
 * `lib/main/index.js` — the LAST tsc output. If any `src/` input is newer
 * than that artifact, the shell would run stale main/preload JS and the whole
 * round is lost to a mid-flight rebuild. Warn only, never block: the
 * operator decides. `--no-warn-stale` silences the check.
 * @returns {void}
 */
function warnIfMainStale() {
  if (process.argv.includes('--no-warn-stale')) return
  /** @param {string} dir @returns {number} newest file mtimeMs under dir (0 when absent). */
  const newest = (dir) => {
    let max = 0
    const walk = (d) => {
      let entries
      try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        const p = join(d, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (entry.isFile()) {
          const t = statSync(p).mtimeMs
          if (t > max) max = t
        }
      }
    }
    walk(dir)
    return max
  }
  const srcNewest = newest(join(APP_ROOT, 'src'))
  const libNewest = newest(join(APP_ROOT, 'lib'))
  if (srcNewest > libNewest) {
    console.warn(`[start] ⚠️ src/ 比 lib/ 新——dev 壳将跑上次的 main/preload 旧 JS（B 轮浪费过一轮）。`)
    console.warn(`         先 build 再启壳：cd ${APP_ROOT} && pnpm exec tsc -p tsconfig.json（或 node scripts/aek/desktop.mjs build ${slot} --yes 连带打包）；--no-warn-stale 可静音本提示`)
  }
}

console.log(`[start] AEK Desktop v0  mode=dev  slot=${slot}`)

// Terminate THIS slot's previous instance only. Killing by the shared default
// ports here would take down the other slot as well. A FOREIGN process holding
// one of our ports is never killed — we abort and let the user decide.
// BF-4: skipped in shell-only mode — the slot's LaunchAgent owns the web
// (KeepAlive would respawn whatever killSlot took out), and the caller
// (scripts/aek/lanes.mjs shell) already terminated the stale shell.
if (!shellOnly) {
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
}

if (!brandDevBundle(slot)) {
  console.error('[start] branding failed, aborting')
  process.exit(1)
}

// A hand-edited `aek.yaml` that moved a slot leaves every consumer link
// (`~/.claude/skills/x` → `../../.aek/current/skill-manager/skills/x`) pointing
// at a path that no longer exists. The app then starts with zero skills and
// nothing explains why. Advisory and read-only: `--stale-only` walks only the
// agent runtime dirs, never the thousands of links inside a slot.
try {
  execFileSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'link-report.mjs'), '--stale-only'], {
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  const raw = /** @type {any} */ (error)
  // Exit code 1 means "stale links found" and carries the explanation on
  // stdout; anything else (timeout, missing script) must not block a launch.
  const message = String(raw.stdout ?? '').trim()
  if (message) console.warn(`[start] ${message.split('\n').join('\n[start] ')}`)
}

/** The shell's slot identity env (shared by the normal and shell-only paths). */
function shellEnv() {
  // The shell must know which slot it is: without AEK_SLOT / AEK_HOME it would
  // fall back to the default data root and lock the wrong slot's pid file.
  return electronEnv({
    DSH_HOME: slotHome(slot),
    AEK_HOME: slotHome(slot),
    AEK_SLOT: slot,
    AEK_WEB_PORT: String(cfg.webPort),
    AEK_CDP_PORT: String(cfg.cdpPort),
    // B round: the shell must know it is the DEV instance — that is what keeps
    // its Electron profile (userData) and window-bounds file in the slot's
    // `desktop-dev` dir instead of the prod `desktop` dir / default appData
    // (see `apps/aek-desktop/v0/src/main/index.ts`, isDev branch).
    // start-dev spawned shells directly and had drifted from
    // shared-logic's startShellDev, which already passes this.
    AEK_MODE: 'dev',
  })
}

if (shellOnly) {
  // The slot's LaunchAgent (serve-slot) already owns the web; this path only
  // spawns the Electron shell on top of it. Closing the shell therefore never
  // takes the slot's web down.
  warnIfMainStale()
  const env = shellEnv()
  const bin = electronBin(devAppDirForSlot(slot), cfg.devAppName)
  if (detach) {
    // Own process group + log-file stdio: the shell outlives this launcher.
    // (The 复盘 §169/§170 detached-pipe lesson — never leave the child's
    // stdout/stderr on pipes the parent will close.)
    const log = join(slotHome(slot), 'logs', 'shell.log')
    const fd = openSync(log, 'a')
    const app = spawn(bin, [mainJs, `--remote-debugging-port=${cfg.cdpPort}`], {
      cwd: APP_ROOT, env, stdio: ['ignore', fd, fd], detached: true,
    })
    app.unref()
    writeSlotLock(slot, { shellPid: app.pid })
    console.log(`[start] ${cfg.productName} shell detached (pid ${app.pid}, CDP http://127.0.0.1:${cfg.cdpPort}, log ${log})`)
    process.exit(0)
  }
  const app = spawn(bin, [mainJs, `--remote-debugging-port=${cfg.cdpPort}`], { cwd: APP_ROOT, env, stdio: 'inherit' })
  app.on('close', code => process.exit(code ?? 0))
}

if (!shellOnly) {
  const web = spawnWebServerForSlot(slot)
  attachCleanup(web)

  // Wait for web server, then launch Electron
  ;(async () => {
    const ready = await waitForWebReady(2000, cfg.webPort)
    if (!ready) console.warn('[start] web server not ready in time, launching anyway')
    else console.log('[start] web app ready')

    console.log(`[start] launching dev ${cfg.productName} (CDP → port ${cfg.cdpPort})`)
    warnIfMainStale()
    const env = shellEnv()
    const app = spawn(electronBin(devAppDirForSlot(slot), cfg.devAppName), [
      mainJs,
      `--remote-debugging-port=${cfg.cdpPort}`,
    ], { cwd: APP_ROOT, env, stdio: 'inherit' })

    app.on('close', code => { web.kill(); process.exit(code ?? 0) })
  })()
}
