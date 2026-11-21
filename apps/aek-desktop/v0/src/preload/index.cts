/**
 * X5: the shell-side bridge for the install self-check card. Emitted as
 * CommonJS (`.cts`): the package is `"type": "module"` (Electron 44 ESM
 * main), but a sandboxed preload script cannot load ESM.
 *
 * The web console is a remote document (http://aek.localhost:1685), so the
 * renderer cannot probe the user's environment itself — only the shell's
 * main process can (PATH lookups, global installs). `window.aekShell` is
 * the ONLY surface this preload exposes: two fixed channels, no raw IPC,
 * no node integration (contextIsolation stays on).
 */
import { contextBridge, ipcRenderer } from 'electron'

export interface ShellInstallStatus {
  /** `node --version`, when Node.js is on PATH. */
  node?: string
  pnpm?: string
  npm?: string
  /** `aek --version` — the host CLI (coraek). */
  aek?: string
  aekpm?: string
  aekws?: string
  aeksm?: string
  /**
   * X5b: the absolute path of the AEK system skill (`aek-usage`, the general
   * install/deploy/use/develop manual seeded into every slot's hub). The
   * setup wizard's agent section references this path instead of inlining
   * the procedure; `undefined` when the hub has no copy yet.
   */
  skillPath?: string
  /** Whether the slot's web backend answered on its canonical port. */
  backendUp: boolean
  checkedAt: number
}

export interface ShellInstallResult {
  ok: boolean
  tool: string
  output: string
}

/** BZ round: static shell facts the custom title bar reads once at mount. */
export interface ShellMeta {
  /** `process.platform` of the shell's main process. */
  platform: 'darwin' | 'win32' | 'linux'
  /** The slot this bundle runs (`aek` / `next`). */
  slot: string
  /** The shell app's version (`app.getVersion()`). */
  version: string
}

/** BZ round: the window state the title bar's glyph mirrors. */
export interface ShellWindowState {
  maximized: boolean
  fullScreen: boolean
}

/** BZ round: the three control actions the bar's buttons drive. */
export type ShellWindowControl = 'minimize' | 'maximize' | 'close'

contextBridge.exposeInMainWorld('aekShell', {
  getInstallStatus: (): Promise<ShellInstallStatus> => ipcRenderer.invoke('aek-shell:install-status'),
  /** Installs only packages the MAIN process keeps in its allow-list. */
  installSelected: (packages: string[]): Promise<ShellInstallResult> =>
    ipcRenderer.invoke('aek-shell:install-selected', packages),
  // BZ round: the custom title bar. The renderer is a remote document and
  // cannot drive its own OS window — these three are the only window
  // surface: static facts, a control action (returns the NEW state), and a
  // push channel so the maximize/restore glyph stays in sync.
  getShellMeta: (): Promise<ShellMeta> => ipcRenderer.invoke('aek-shell:shell-meta'),
  windowControl: (action: ShellWindowControl): Promise<ShellWindowState> =>
    ipcRenderer.invoke('aek-shell:window-control', action),
  /** Subscribes to maximize/unmaximize/full-screen transitions. Returns the unsubscribe. */
  onWindowState: (callback: (state: ShellWindowState) => void): (() => void) => {
    const listener = (_event: unknown, state: ShellWindowState): void => {
      callback(state)
    }
    ipcRenderer.on('aek-shell:window-state', listener)
    return () => {
      ipcRenderer.removeListener('aek-shell:window-state', listener)
    }
  },
})
