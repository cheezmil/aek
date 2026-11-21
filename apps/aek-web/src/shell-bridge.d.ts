/**
 * X5: ambient typing for the desktop shell's install self-check bridge.
 * BZ: extended with the custom title bar's window-control surface
 * (`getShellMeta` / `windowControl` / `onWindowState`).
 * `window.aekShell` only exists when the console runs INSIDE the AEK shell
 * (the shell's preload injects it, `apps/aek-desktop/v0/src/preload/index.ts`).
 * In a plain system browser the property is simply absent — the UI hides the
 * checklist card instead of probing.
 */
export {}

declare global {
  interface Window {
    aekShell?: {
      getInstallStatus: () => Promise<{
        node?: string
        pnpm?: string
        npm?: string
        aek?: string
        aekpm?: string
        aekws?: string
        aeksm?: string
        /** X5b: absolute path of the AEK system skill (aek-usage manual), when seeded. */
        skillPath?: string
        backendUp: boolean
        checkedAt: number
      }>
      installSelected: (
        packages: string[],
      ) => Promise<{ ok: boolean; tool: string; output: string }>
      /** BZ: static shell facts — `platform` gates the title bar's control buttons. */
      getShellMeta: () => Promise<{
        platform: 'darwin' | 'win32' | 'linux'
        slot: string
        version: string
      }>
      /** BZ: drive the OS window from the title bar's HTML buttons. */
      windowControl: (
        action: 'minimize' | 'maximize' | 'close',
      ) => Promise<{ maximized: boolean; fullScreen: boolean }>
      /** BZ: push channel; returns the unsubscribe. */
      onWindowState: (
        callback: (state: { maximized: boolean; fullScreen: boolean }) => void,
      ) => () => void
    }
  }
}
