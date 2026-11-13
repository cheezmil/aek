import { app, BrowserWindow, Menu, shell, systemPreferences } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolveAekHome } from '@cheezmil/coraek/home'
import { bindHost, isSlot, resolveSlot, slotConfig, slotHome } from '@cheezmil/coraek/slots'
import { readSlotLock, writeSlotLock, clearSlotLock, isPidAlive } from '@cheezmil/coraek/slot-lock'
import log from 'electron-log/main'

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
 * 3. The data root — `<container>/next` (or a legacy `…-next` root) means the
 *    Next slot; `<container>/current` is the default one.
 */
function currentSlot(): 'aek' | 'next' {
  const explicit = (process.env.AEK_SLOT ?? '').trim()
  if (isSlot(explicit)) return explicit
  if (packaged?.slot && isSlot(packaged.slot)) return packaged.slot
  return resolveSlot()
}

const SLOT = currentSlot()
const SLOT_CFG = slotConfig(SLOT)

// T round: desktop log rotation constants (see the electron-log block below).
const DESKTOP_LOG_MAX_BYTES = 2 * 1024 * 1024
const DESKTOP_LOG_KEEP_GENERATIONS = 5

/**
 * T round: the shell's built-in log file, via electron-log (the maintained
 * Electron logging SDK: cross-platform file transport, rotation, renderer IPC
 * capture). The file lives in THIS slot's data root — never the default
 * per-app location — so `aek logs` reads exactly the slot it is told to.
 * Plain-text lines (`ISO LEVEL [desktop] message k=v`): an incident (white
 * screen, crash, boot failure) is diagnosable from text alone, on any
 * platform, with no GUI tooling and no screenshots.
 */
log.transports.file.fileName = 'desktop.log'
log.transports.file.resolvePath = () => join(slotHome(SLOT), 'logs', 'desktop.log')
log.transports.file.maxSize = DESKTOP_LOG_MAX_BYTES
log.transports.file.level = 'info'
log.transports.file.format = (params) => {
  const data: unknown[] = params.data ?? []
  const message = String(data.shift() ?? '')
  const timestamp = new Date(params.message.date).toISOString()
  const extra = data
    .map(value => value instanceof Error
      ? `error=${value.message}\n  ${String(value.stack ?? '').split('\n').slice(0, 4).join('\n  ')}`
      : typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value))
    .join(' ')
  return [`${timestamp} ${String(params.level).toUpperCase()} ${message}${extra ? ` ${extra}` : ''}`]
}
// electron-log's native archive keeps a single `.old` file; shift a
// generation chain instead so 5 files (current + 4 rolled) survive and the
// oldest one is dropped on each roll.
log.transports.file.archiveLogFn = (oldLogFile) => {
  const current = oldLogFile.path
  for (let generation = DESKTOP_LOG_KEEP_GENERATIONS; generation >= 2; generation--) {
    const from = `${current}.${generation - 1}`
    if (existsSync(from)) renameSync(from, `${current}.${generation}`)
  }
  if (existsSync(current)) renameSync(current, `${current}.1`)
}

/** Main-process faults were previously invisible in a packaged app. */
process.on('uncaughtException', (err: unknown) => {
  log.error('uncaught exception in main', err instanceof Error ? err : new Error(String(err)))
})
process.on('unhandledRejection', (reason: unknown) => {
  log.error('unhandled rejection in main', reason instanceof Error ? reason : new Error(String(reason)))
})

// Ports come from the environment when the launcher started us (dev flow), then
// from the slot baked into the packaged app, and finally from the slot table.
const WEB_PORT = Number(process.env.AEK_WEB_PORT ?? packaged?.webPort ?? SLOT_CFG.webPort)

// ── Which URL the window loads ────────────────────────────────────────────────
// The console answers on the loopback literal, but the window loads the slot's
// ALIAS host (`aek.localhost`). Chromium keeps site zoom per HOST with the port
// dropped, so every `127.0.0.1:<port>` web UI in one profile shares a single
// zoom level — zooming AEK also resized the DeepSeek Harness web UI (verified in
// Chrome's `partition.per_host_zoom_levels`). A distinct name is the only thing
// that separates them; a distinct port is not.
//
// `*.localhost` resolves to loopback in the OS resolver and inside Chromium
// (RFC 6761) and still counts as a secure origin, so nothing else changes.
// `AEK_WEB_HOST` is an escape hatch for diagnostics.
const WEB_HOST = (process.env.AEK_WEB_HOST ?? '').trim() || SLOT_CFG.webHost

/** What the browser/Dock-facing console URL looks like. */
const CANONICAL_URL = `http://${WEB_HOST}:${String(WEB_PORT)}`
/** The literal the socket actually binds; probes and fallbacks use this. */
const LOOPBACK_URL = `http://${bindHost()}:${String(WEB_PORT)}`
/**
 * URL the window currently uses. Starts as the alias; a system whose resolver
 * cannot answer `*.localhost` falls back to the literal so the app is never
 * stranded on a blank page, and the backend watcher then keeps reloading the
 * same one.
 */
let shellUrl = CANONICAL_URL
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
// key the lock by the data root instead: each slot (`~/.aek/current` /
// `~/.aek/next`)
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
  // `~/.aek/next`). resolveAekHome() only resolves a path, it does not create
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
  log.warn('another instance of this slot is already running; quitting', { slot: SLOT })
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
  log.error('backend port mismatch — refusing to load', { configuredPort: SLOT_CFG.webPort, effectivePort: WEB_PORT })
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
      const response = await fetch(`${LOOPBACK_URL}/`, {
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
    `<p style="color:#666;margin:0">The ${SLOT_CFG.productName} backend on port ${WEB_PORT} is not responding.`,
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
/**
 * V round (2026-11-13): renderer silent-failure window. The client's own
 * stall watchdog reports `[aek-boot] boot stalled` 5 s after the module
 * system failed to create; the shell gives the app a little extra grace
 * before forcing a full reload, and bounds consecutive forced reloads so a
 * permanently broken build cannot turn the window into a reload loop.
 */
const BOOT_GRACE_MS = 15_000
const MAX_CONSECUTIVE_FORCED_RELOADS = 3

function watchBackend(win: BrowserWindow): () => void {
  let showingReconnect = false
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  /** Last time the renderer reported a healthy boot (ms). */
  let lastBootOkAt = 0
  /** When the most recent app-URL load started (ms). */
  let lastAppLoadAt = 0
  /** Consecutive forced reloads since the last healthy boot. */
  let forcedReloads = 0
  /** The one-shot boot deadline for the current load. */
  let bootTimer: NodeJS.Timeout | undefined

  const disarmBootWatch = (): void => {
    if (bootTimer !== undefined) clearTimeout(bootTimer)
    bootTimer = undefined
  }

  /**
   * Arm the "did the renderer actually boot?" deadline for one load. After
   * {@link BOOT_GRACE_MS} with no fresh `[aek-boot] module system created`
   * line the renderer is declared silent-failed and hard-reloaded — this is
   * the U-round follow-up: two white screens (2026-11-13 02:28 / 02:51)
   * both needed a manual app restart because the renderer could die or stall
   * while the backend stayed up, which the reconnect watcher never sees.
   */
  const armBootWatch = (): void => {
    disarmBootWatch()
    lastAppLoadAt = Date.now()
    bootTimer = setTimeout(() => {
      bootTimer = undefined
      if (stopped || win.isDestroyed()) return
      // A healthy boot since THIS load means nothing to do.
      if (lastBootOkAt >= lastAppLoadAt) {
        forcedReloads = 0
        return
      }
      if (forcedReloads >= MAX_CONSECUTIVE_FORCED_RELOADS) {
        log.error('renderer silent-failure: giving up after consecutive forced reloads — manual restart needed', {
          attempts: forcedReloads,
        })
        return
      }
      forcedReloads += 1
      log.warn('renderer silent-failure: no [aek-boot] after app load — forcing reload', {
        attempt: forcedReloads,
        shellUrl,
      })
      console.log(`[main] renderer silent-failure — forcing reload (attempt ${String(forcedReloads)})`)
      // Reload bypasses the HTTP cache so a poisoned bundle cannot survive.
      void win.webContents.reloadIgnoringCache().catch(() => { /* the window may be gone */ })
    }, BOOT_GRACE_MS)
  }

  const showReconnect = (): void => {
    if (showingReconnect) return
    showingReconnect = true
    log.warn('backend down — showing reconnecting page', { shellUrl })
    disarmBootWatch()
    void win.loadURL(reconnectingPage()).catch(() => { /* the window may be gone */ })
  }

  const showApp = (): void => {
    if (!showingReconnect) return
    showingReconnect = false
    log.info('backend up — loading shell', { shellUrl })
    void win.loadURL(shellUrl).catch(() => { /* the window may be gone */ })
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

  // Renderer console capture: the web client's `[aek-boot]` telemetry (module
  // system created / boot stalled / script failed) plus any page error lands
  // in desktop.log as `renderer console` events. In a plain browser the same
  // lines stay in the devtools console; here they become durable text.
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const source = sourceId ? sourceId.split('/').pop() ?? sourceId : 'renderer'
    // V round: a healthy module-system line is the renderer's "I booted"
    // signal; the boot watcher trusts only this one marker.
    if (message.includes('[aek-boot] module system created')) {
      lastBootOkAt = Date.now()
    }
    if (level === 3) log.error(`renderer console: ${message}`, { line, source })
    else if (level === 2) log.warn(`renderer console: ${message}`, { line, source })
    else if (level === 0) log.debug(`renderer console: ${message}`, { line, source })
    else log.info(`renderer console: ${message}`, { line, source })
  })

  win.webContents.on('did-finish-load', () => {
    // Electron 44's typed listener for this event takes no arguments; the URL
    // comes from the webContents itself.
    const url = win.webContents.getURL()
    log.info('did-finish-load', { url })
    // The reconnecting page and the port-mismatch page are data: URLs — they
    // never emit boot telemetry, so only arm the deadline for the real app.
    if (url.startsWith('data:')) return
    if (url.startsWith(CANONICAL_URL) || url.startsWith(LOOPBACK_URL)) {
      armBootWatch()
    }
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 is ERR_ABORTED, which fires for every normal navigation-away.
    if (errorCode === -3) return
    log.error('did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame })
    console.log(`[main] load failed (${String(errorCode)} ${errorDescription}) ${validatedURL}`)
    showReconnect()
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    // A dead renderer reports no boot line ever; remember the failure so the
    // next app load (after the backend transition) forces a fresh one.
    log.error('render-process-gone', { reason: details.reason, exitCode: details.exitCode })
    console.log(`[main] renderer gone: ${details.reason}`)
    lastBootOkAt = 0
    showReconnect()
  })

  win.on('unresponsive', () => {
    log.warn('window unresponsive')
  })
  win.on('responsive', () => {
    log.info('window responsive')
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
    // Both names are this same console: the alias (what we load) and the
    // loopback literal (scripts, old bookmarks, the fallback path).
    if (url.startsWith(CANONICAL_URL) || url.startsWith(LOOPBACK_URL)) return
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
  // A failed load is usually just "backend not up yet" and the watcher turns it
  // into the reconnecting page. The one case the watcher cannot fix is a
  // resolver that does not know `*.localhost`, so retry once on the literal and
  // remember that choice for every later reload.
  win.loadURL(shellUrl).catch(() => {
    if (win.isDestroyed() || shellUrl === LOOPBACK_URL) return
    shellUrl = LOOPBACK_URL
    log.warn('host did not resolve, falling back to the loopback literal', { webHost: WEB_HOST, fallback: LOOPBACK_URL })
    console.log(`[main] ${WEB_HOST} did not resolve, falling back to ${LOOPBACK_URL}`)
    void win.loadURL(LOOPBACK_URL).catch(() => { /* the watcher retries */ })
  })
}

app.whenReady().then(() => {
  // T round: the first log line of every boot — what this shell is, where it
  // points, and which channel built it. A white screen is read from here
  // forward: boot → backend probes → load events → renderer console.
  log.info('boot', {
    pid: process.pid,
    slot: SLOT,
    channel: isDev ? 'dev' : 'prod',
    electron: process.versions.electron,
    node: process.versions.node,
    webHost: WEB_HOST,
    webPort: WEB_PORT,
    shellUrl,
    headless: HEADLESS,
    packaged: packaged?.slot ?? 'source-tree',
  })
  // The menu (and its dev-tools accelerators) is independent of windows, so
  // it is installed in headless mode too — harmless, keeps one code path.
  registerApplicationMenu()
  // Each bundle registers itself in the macOS Accessibility list on launch.
  registerAccessibility()
  // Headless mode: the slot's web server runs, but no window is created, so
  // macOS never shows a second Dock icon for an "inactive" slot that is only
  // being kept warm (or verified). The app stays alive until it is stopped.
  if (HEADLESS) {
    log.info('headless mode: no window', { slot: SLOT, webPort: WEB_PORT })
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
