/**
 * BZ round: the custom desktop title bar — the shell-side replacement for
 * the native caption (main process: `titleBarStyle: 'hidden'`, AGENTS §5).
 *
 * Rendered only inside the AEK shell: `window.aekShell` is injected by the
 * shell's preload (`apps/aek-desktop/v0/src/preload/index.cts`). In a plain
 * browser the bridge is absent and this component renders nothing, exactly
 * like the install-checklist card (`useShellInstall`).
 *
 * The bar is a pure window-move grip: `app-region: drag` (index.css), with
 * the HTML control buttons opting out via `no-drag`. Platform policy:
 *   darwin — the native traffic lights stay in the top-left; the bar is a
 *            pure empty grip: no text, no icon, no brand (BC round, m13881),
 *            and NO custom close/min/max buttons are drawn (the lights
 *            already do that).
 *   win32 / linux — the native control strip is gone entirely, so the bar
 *            draws its own minimize / maximize-restore / close buttons,
 *            driven through `aekShell.windowControl`; the maximize glyph
 *            flips to "restore" from the main-process push channel
 *            (`aekShell.onWindowState`), no polling.
 *
 * @module @cheezmil/aek-web/src/ShellTitleBar
 */
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from './i18n.tsx'

/** The static shell facts the bar reads once at mount. */
interface ShellMeta {
  platform: 'darwin' | 'win32' | 'linux'
  slot: string
  version: string
}

type ShellControl = 'minimize' | 'maximize' | 'close'

/**
 * The desktop shell's custom title bar. Returns `null` outside the shell.
 */
export function ShellTitleBar() {
  const { t } = useI18n()
  const [meta, setMeta] = useState<ShellMeta | undefined>(undefined)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const shell = window.aekShell
    if (shell === undefined) return
    // The bar occupies 36px of the page column, so every `min-h-screen`
    // page below it must shrink by that height (index.css `.aek-in-shell`).
    document.documentElement.classList.add('aek-in-shell')
    let disposed = false
    void shell.getShellMeta().then((m) => {
      if (!disposed) setMeta(m)
    }).catch(() => undefined)
    const off = shell.onWindowState((state) => {
      setMaximized(state.maximized)
    })
    return () => {
      disposed = true
      off()
    }
  }, [])

  if (meta === undefined) return null

  const darwin = meta.platform === 'darwin'
  const shell = window.aekShell

  /** Drive one window control; fold the returned state into the glyph. */
  const control = (action: ShellControl): void => {
    if (shell === undefined) return
    void shell.windowControl(action).then((state) => {
      setMaximized(state.maximized)
    }).catch(() => undefined)
  }

  return (
    <header
      className={cn(
        // The whole bar is a drag grip; the button cluster below opts out.
        'aek-titlebar flex shrink-0 items-center justify-between border-b border-border bg-background text-foreground',
      )}
      data-platform={meta.platform}
      // Double-click the grip to maximize/restore — the classic Windows
      // caption behavior. Ignored on macOS (the native lights own it) and
      // on the button cluster (a double-click there is just two clicks).
      onDoubleClick={(e) => {
        if (darwin) return
        if (e.target instanceof Element && e.target.closest('.aek-titlebar-ctrl') !== null) return
        control('maximize')
      }}
    >
      {/* BC round (m13881): brand block removed — the bar must show no text
          and no icon; on darwin it is a pure window-MOVE grip above the
          native traffic lights. */}

      {darwin ? null : (
        <div className="aek-titlebar-ctrls flex h-full items-stretch">
          <button
            type="button"
            className="aek-titlebar-ctrl aek-titlebar-btn"
            title={t('titlebar.minimize')}
            aria-label={t('titlebar.minimize')}
            onClick={() => {
              control('minimize')
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <line x1="0" y1="9.5" x2="10" y2="9.5" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            type="button"
            className="aek-titlebar-ctrl aek-titlebar-btn"
            title={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
            aria-label={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
            onClick={() => {
              control('maximize')
            }}
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <rect x="1" y="0" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
                <path d="M3 10 H10 V3" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="aek-titlebar-ctrl aek-titlebar-btn aek-titlebar-close"
            title={t('titlebar.close')}
            aria-label={t('titlebar.close')}
            onClick={() => {
              control('close')
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      )}
    </header>
  )
}
