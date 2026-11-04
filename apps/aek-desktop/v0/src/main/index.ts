import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const APP_ROOT = join(fileURLToPath(import.meta.url), '../..')
const WEB_PORT = 1680
const CDP_PORT = 1682
const APP_NAME = process.env.AEK_MODE === 'dev' ? 'AEK DEV' : 'AEK'

// ── Dev vs Prod: separate userData so they never conflict ─────────────────────
const isDev = process.env.AEK_MODE === 'dev'

if (isDev) {
  const devDataDir = join(homedir(), '.aek', 'desktop-dev')
  app.setPath('appData', devDataDir)
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
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
