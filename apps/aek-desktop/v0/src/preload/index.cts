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
  /** Whether the slot's web backend answered on its canonical port. */
  backendUp: boolean
  checkedAt: number
}

export interface ShellInstallResult {
  ok: boolean
  tool: string
  output: string
}

contextBridge.exposeInMainWorld('aekShell', {
  getInstallStatus: (): Promise<ShellInstallStatus> => ipcRenderer.invoke('aek-shell:install-status'),
  /** Installs only packages the MAIN process keeps in its allow-list. */
  installSelected: (packages: string[]): Promise<ShellInstallResult> =>
    ipcRenderer.invoke('aek-shell:install-selected', packages),
})
