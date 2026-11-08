import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolveAekHome } from '@cheezmil/coraek/home'
import { isSlot, resolveSlot, slotConfig } from '@cheezmil/coraek/slots'

const APP_ROOT = join(fileURLToPath(import.meta.url), '../..')

/**
 * Slot metadata baked into the packaged app by electron-builder
 * (`extraMetadata.aek`). It is absent when the shell runs straight from the
 * source tree, which is fine: the environment or the slot table then decides.
 */
interface PackagedMeta {
  slot?: string
  webPort?: number
  cdpPort?: number
  bundleId?: string
}

/** @returns the packaged app's own package.json contents, or null. */
function readOwnPackage(): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

const ownPackage = readOwnPackage()
const packaged = (ownPackage?.aek ?? null) as PackagedMeta | null

/**
 * Which slot this process is.
 *
 * 1. `AEK_SLOT` — an explicit operator override.
 * 2. The slot baked into the packaged app (the user double-clicked
 *    "AEK Next.app", so it is Next by definition).
 * 3. The data root — a `…-next` root means the Next slot.
 */
function currentSlot(): 'aek' | 'next' {
  const explicit = (process.env.AEK_SLOT ?? '').trim()
  if (isSlot(explicit)) return explicit
  if (packaged?.slot && isSlot(packaged.slot)) return packaged.slot
  return resolveSlot()
}

const SLOT = currentSlot()
const SLOT_CFG = slotConfig(SLOT)

// Ports come from the environment when the launcher started us (dev flow), then
// from the slot baked into the packaged app, and finally from the slot table.
const WEB_PORT = Number(process.env.AEK_WEB_PORT ?? packaged?.webPort ?? SLOT_CFG.webPort)
const CDP_PORT = Number(process.env.AEK_CDP_PORT ?? packaged?.cdpPort ?? SLOT_CFG.cdpPort)
const APP_NAME = process.env.AEK_MODE === 'dev' ? SLOT_CFG.devAppName : SLOT_CFG.productName

// ── Dev vs Prod: separate userData so they never conflict ─────────────────────
const isDev = process.env.AEK_MODE === 'dev'

if (isDev) {
  const devDataDir = join(resolveAekHome(), 'desktop-dev')
  app.setPath('appData', devDataDir)
}

// ── Per-slot userData ─────────────────────────────────────────────────────────
// Electron derives `userData` from the package name. The packaged app name is
// slot-specific (`aek-desktop` / `aek-desktop-next`), so the two apps never
// share a Chromium profile — sharing one would make the second app die on
// Chromium's singleton lock. Pinning the path explicitly also makes the
// location independent of when Electron first resolves it.
const packageName = typeof ownPackage?.name === 'string' ? ownPackage.name : 'aek-desktop'
app.setPath('userData', join(app.getPath('appData'), packageName))
// Show the real product name in the menu bar ("AEK" / "AEK Next"). Set after
// userData is pinned, so it cannot move the profile directory.
app.setName(SLOT_CFG.productName)

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

/**
 * The window must talk to THIS slot's backend. If the effective port does not
 * belong to this slot, loading it anyway would silently show the other slot's
 * data root — so refuse and explain instead.
 * @returns an error page URL, or null when the port is correct.
 */
function portMismatchPage(): string | null {
  if (WEB_PORT === SLOT_CFG.webPort) return null
  const message = [
    `AEK ${SLOT_CFG.productName} is configured for port ${SLOT_CFG.webPort},`,
    `but was told to connect to port ${WEB_PORT}.`,
    '',
    'Connecting anyway would show the other app\'s data root.',
    'Start this app through its own launcher, or unset the port override.',
  ].join('\n')
  console.error(`[main] ${message}`)
  const html = '<!doctype html><meta charset="utf-8"><title>AEK</title>' +
    '<body style="font:14px -apple-system,sans-serif;padding:2rem;color:#222">' +
    `<h2 style="font-size:1.1rem">Wrong backend port</h2><pre>${message}</pre></body>`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

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
  const mismatch = portMismatchPage()
  if (mismatch) {
    win.loadURL(mismatch)
    return
  }
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
