import { app, BrowserWindow, Menu, shell, systemPreferences } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolveAekHome } from '@cheezmil/coraek/home'
import { isSlot, resolveSlot, slotConfig } from '@cheezmil/coraek/slots'
import { readSlotLock, writeSlotLock, clearSlotLock, isPidAlive } from '@cheezmil/coraek/slot-lock'

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
// Title bar: keep the ORIGINAL native frame (R10) but WITHOUT any text in it
// (2026-11-09 follow-up). `title: ''` plus blocking `page-title-updated` keeps
// the macOS traffic lights and the standard bar while leaving the centre empty;
// this is not the old `hiddenInset` scheme, the frame is still the native one.

// Headless mode: run the shell WITHOUT a window. Used when a slot is kept
// warm (or verified) without wanting a second Dock icon.
const HEADLESS = (process.env.AEK_HEADLESS ?? '').trim() === '1'

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
//
// The lock format is shared with the arbiter through
// `@cheezmil/coraek/slot-lock` — the two used to disagree (this wrote a bare
// pid, the arbiter wrote JSON), so a second shell could start and the arbiter
// forgot the shell it had launched.
const SLOT_HOME = resolveAekHome()
const LOCK_PATH = join(SLOT_HOME, '.aek-runtime.pid')

/** @returns true when another shell for this slot is already alive. */
function slotLockHeld(): boolean {
  const lock = readSlotLock(SLOT)
  if (!lock) return false
  const shellPid = lock.shellPid
  if (isPidAlive(shellPid) && shellPid !== process.pid) return true
  // A stale shell pid (the process died without releasing) does not hold the
  // slot, but the web server's pid may still be valid — that does not block a
  // new shell either.
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
  writeSlotLock(SLOT, { shellPid: process.pid })
  return true
}

/** Remove this slot's pid lock. */
function releaseSlotLock(): void {
  const lock = readSlotLock(SLOT)
  // Only clear the file when WE are the shell it names; the arbiter may have
  // written the web pid into the same file.
  if (lock && (lock.shellPid === process.pid || lock.shellPid === undefined || lock.shellPid === null)) {
    clearSlotLock(SLOT)
  }
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

// ── Backend liveness + reconnect ─────────────────────────────────────────────
// The shell talks to a local web server. That server can die (the user stopped
// the slot, the runtime switched modes, the host crashed). Without a watcher
// the window would sit on a dead "ERR_CONNECTION_REFUSED" page forever, and the
// only fix would be to relaunch the app.
//
// Instead: watch the backend, show a reconnecting page while it is down, and
// reload the window as soon as it answers again. This is the ONE place where a
// real shell restart would otherwise be needed.

/** How often the backend is probed, in milliseconds. */
const PROBE_INTERVAL_MS = 1000

/** @returns true when the slot's web server answers. */
async function backendAlive(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, 1500)
    try {
      const response = await fetch(`http://127.0.0.1:${WEB_PORT}/`, {
        signal: controller.signal,
        headers: { accept: 'text/html' },
      })
      return response.status < 500
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return false
  }
}

/**
 * The page shown while the backend is unreachable.
 * @returns a data: URL carrying the reconnecting notice.
 */
function reconnectingPage(): string {
  const html = [
    '<!doctype html><meta charset="utf-8"><title>AEK</title>',
    '<body style="font:14px -apple-system,sans-serif;padding:3rem;color:#222;',
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif">',
    '<h2 style="font-size:1.1rem;margin-bottom:.4rem">Reconnecting…</h2>',
    `<p style="color:#666;margin:0">The AEK ${SLOT_CFG.productName} backend on port ${WEB_PORT} is not responding.`,
    'This window will reload automatically once it is back.</p>',
    '<div id="dot" style="margin-top:1.5rem;width:10px;height:10px;border-radius:50%;',
    'background:#888;animation:p 1s infinite"></div>',
    '<style>@keyframes p{0%,100%{opacity:.25}50%{opacity:1}}</style>',
    '</body>',
  ].join('')
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

/**
 * Watch the backend and keep the window in sync with it.
 *
 * - When the window fails to load (or the page reports a network error), the
 *   reconnecting page is shown.
 * - While the backend is down, the window is reloaded periodically; the reload
 *   only succeeds once the backend answers, so the user never sees a stale
 *   error page for long.
 * - When the backend comes back, the real URL is loaded.
 * @param win - the window to keep alive.
 * @returns a function that stops the watcher.
 */
function watchBackend(win: BrowserWindow): () => void {
  const webUrl = `http://127.0.0.1:${WEB_PORT}`
  let showingReconnect = false
  let stopped = false
  let timer: NodeJS.Timeout | undefined

  const showReconnect = (): void => {
    if (showingReconnect) return
    showingReconnect = true
    void win.loadURL(reconnectingPage()).catch(() => { /* the window may be gone */ })
  }

  const showApp = (): void => {
    if (!showingReconnect) return
    showingReconnect = false
    void win.loadURL(webUrl).catch(() => { /* the window may be gone */ })
  }

  const probe = async (): Promise<void> => {
    if (stopped || win.isDestroyed()) return
    const alive = await backendAlive()
    if (alive) {
      showApp()
      return
    }
    showReconnect()
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    // -3 is ERR_ABORTED, which fires for every normal navigation-away.
    if (errorCode === -3) return
    console.log(`[main] load failed (${String(errorCode)} ${errorDescription}) ${validatedURL}`)
    showReconnect()
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.log(`[main] renderer gone: ${details.reason}`)
    showReconnect()
  })

  timer = setInterval(() => { void probe() }, PROBE_INTERVAL_MS)

  // The first load may already be failing (backend not up yet).
  void probe()

  return () => {
    stopped = true
    if (timer) clearInterval(timer)
  }
}

/**
 * Register the application menu (C8: Chrome-style developer-tool shortcuts).
 *
 * Without an application menu the app has NO registered accelerators at all,
 * so pressing Cmd-Option-I / F12 does nothing. A second, historical cause is
 * that the role-based dev-tools accelerator silently failed on macOS
 * (electron/electron#45925, opened and closed on 2025-03-08, labelled 34-x-y;
 * the issue is CLOSED, not an outstanding Electron bug). An explicit `click`
 * plus `accelerator` avoids both layers. Chrome opens
 * DevTools with Cmd-Option-I (plus Cmd-Shift-I and Fn-F12) on macOS and
 * F12 / Ctrl-Shift-I elsewhere — we mirror that set here explicitly.
 *
 * The menu also carries the standard edit roles: without them, copy/paste
 * shortcuts in the console's text inputs would have no native binding.
 */
function registerApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  // The click callback's second argument is the window the menu belongs to;
  // for the application menu that is the focused window.
  // The menu callback passes the owning window typed as `BaseWindow`; only a
  // BrowserWindow carries `webContents`. Fall back to the focused window so
  // the accelerator also works when the menu arg is stale.
  const toggleDevTools = (_item: Electron.MenuItem, win: Electron.BaseWindow | undefined): void => {
    const target = (win !== undefined && 'webContents' in win ? win as BrowserWindow : undefined)
      ?? BrowserWindow.getFocusedWindow()
    target?.webContents.toggleDevTools()
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Developer Tools', accelerator: isMac ? 'Alt+Cmd+I' : 'F12', click: toggleDevTools },
        // Accelerators on hidden items still fire (Electron keyboard-shortcuts
        // docs), so the Chrome-combo equivalents stay one keypress away.
        { label: '', visible: false, accelerator: 'CmdOrCtrl+Shift+I', click: toggleDevTools },
        ...(isMac ? [{ label: '', visible: false, accelerator: 'F12', click: toggleDevTools }] : []),
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Register this app with macOS TCC's Accessibility list (R20, 2026-11-09).
 *
 * Verified with aekws + the Electron docs: macOS has NO API that can GRANT
 * Accessibility; `systemPreferences.isTrustedAccessibilityClient(true)` is the
 * supported way to (a) check the state and (b) make the system show the prompt
 * and ADD THIS BUNDLE to System Settings → Privacy & Security → Accessibility.
 * Because AEK and AEK Next are separate bundles, each launch registers its own
 * identity — which is exactly what makes both names visible in that list.
 * The result is persisted for the host's `/api/aek/permissions` route.
 *
 * A second call does not re-prompt (electron/electron#20787, CLOSED 2019-12-05),
 * so the Permissions panel offers a deep link to the pane instead.
 */
function registerAccessibility(): void {
  if (process.platform !== 'darwin') return
  let trusted = false
  try {
    trusted = systemPreferences.isTrustedAccessibilityClient(true)
  } catch {
    // An older Electron without this API must still start the console.
  }
  const file = join(SLOT_HOME, 'permissions.json')
  let previous: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (typeof parsed === 'object' && parsed !== null) previous = parsed as Record<string, unknown>
  } catch { /* first launch */ }
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({
      ...previous,
      accessibility: trusted ? 'granted' : 'denied',
      checkedAt: new Date().toISOString(),
      bundleId: SLOT_CFG.bundleId,
      productName: SLOT_CFG.productName,
    }, null, 2) + '\n', 'utf8')
  } catch { /* a disk failure must not stop the app */ }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    // Native frame kept; the caption text itself is intentionally empty.
    title: '',
    icon: join(APP_ROOT, 'resources', 'icon.icns'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  // The HTML document also carries a <title>; without this the renderer would
  // push it into the native caption and the text would come back.
  win.on('page-title-updated', (event) => { event.preventDefault() })
  // The star icon links to GitHub. Electron's default is a new BrowserWindow,
  // which is not a browser the user wants. Send http(s) to the SYSTEM browser
  // and refuse every other scheme (security: no file://, no custom protocols).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//u.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`http://127.0.0.1:${String(WEB_PORT)}`)) return
    event.preventDefault()
    if (/^https?:\/\//u.test(url)) void shell.openExternal(url)
  })
  const mismatch = portMismatchPage()
  if (mismatch) {
    win.loadURL(mismatch)
    return
  }
  const stopWatching = watchBackend(win)
  win.on('closed', stopWatching)
  const webUrl = `http://127.0.0.1:${WEB_PORT}`
  win.loadURL(webUrl)
}

app.whenReady().then(() => {
  // The menu (and its dev-tools accelerators) is independent of windows, so
  // it is installed in headless mode too — harmless, keeps one code path.
  registerApplicationMenu()
  // Each bundle registers itself in the macOS Accessibility list on launch.
  registerAccessibility()
  // Headless mode: the slot's web server runs, but no window is created, so
  // macOS never shows a second Dock icon for an "inactive" slot that is only
  // being kept warm (or verified). The app stays alive until it is stopped.
  if (HEADLESS) {
    console.log(`[main] headless mode: no window (slot ${SLOT}, web port ${WEB_PORT})`)
    return
  }
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
