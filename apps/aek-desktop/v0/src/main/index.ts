import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolveAekHome } from '@cheezmil/coraek/home'

const APP_ROOT = join(fileURLToPath(import.meta.url), '../..')
// Ports are injected per slot by scripts/aek/launch.mjs (AEK 1680/1682, Next
// 1702/1704). When the env is unset the launcher did not run (e.g. the packaged
// app opened directly) so we fall back to the AEK defaults. The window always
// connects to the SAME port the web server was started on, which prevents the
// Next window from accidentally rendering AEK's data root during coexistence.
const WEB_PORT = Number(process.env.AEK_WEB_PORT ?? 1680)
const CDP_PORT = Number(process.env.AEK_CDP_PORT ?? 1682)
const APP_NAME = process.env.AEK_MODE === 'dev' ? 'AEK DEV' : 'AEK'

// ── Dev vs Prod: separate userData so they never conflict ─────────────────────
const isDev = process.env.AEK_MODE === 'dev'

if (isDev) {
  const devDataDir = join(resolveAekHome(), 'desktop-dev')
  app.setPath('appData', devDataDir)
}

// ── Per-slot single instance (T4 / T11) ──────────────────────────────────────
// AEK and AEK Next are two equal instances that share one bundle but must each
// stay single-instance. Electron's app-id lock would forbid running both, so we
// key the lock by the data root instead: each slot (`~/.aek` / `~/.aek-next`)
// may have at most one shell, while the two slots coexist. The runtime arbiter
// stops a slot by freeing its web port; this guard stops a second shell for the
// same slot from ever opening.
const SLOT_HOME = resolveAekHome()
const LOCK_PATH = join(SLOT_HOME, '.aek-runtime.pid')

/** @returns true when another shell for this slot is already alive. */
function slotLockHeld(): boolean {
  try {
    const pid = Number(readFileSync(LOCK_PATH, 'utf8').trim())
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); return true } catch { /* dead → stale lock */ }
    }
  } catch { /* no lock file */ }
  return false
}

/** @returns true on success; false when the slot is already taken. */
function acquireSlotLock(): boolean {
  if (slotLockHeld()) return false
  // The data root may not exist yet on a fresh install (e.g. a brand new
  // `~/.aek-next`). resolveAekHome() only resolves a path, it does not create
  // it — without this the lock write would throw ENOENT and the app would
  // quit on first launch.
  try { mkdirSync(SLOT_HOME, { recursive: true }) } catch { /* handled below */ }
  try { writeFileSync(LOCK_PATH, String(process.pid), 'utf8') } catch { return false }
  return true
}

/** Remove this slot's pid lock. */
function releaseSlotLock(): void {
  try { rmSync(LOCK_PATH) } catch { /* absent */ }
}

if (!acquireSlotLock()) {
  console.log('[main] another instance of this slot is already running; quitting')
  app.quit()
  process.exit(0)
}
app.on('before-quit', releaseSlotLock)

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    icon: join(APP_ROOT, 'resources', 'icon.icns'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  const webUrl = `http://127.0.0.1:${WEB_PORT}`
  win.loadURL(webUrl)
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
