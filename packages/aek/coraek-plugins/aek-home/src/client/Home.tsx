/**
 * The AEK console application root. The dsh shell is not mounted in the AEK
 * web profile, so this surface owns the whole `#root`: a left navigation rail
 * and a content column. There is no top bar, no header badge and no per-page
 * title block any more (C11: the `pageHeader` strip was removed — panels own
 * their own headings).
 *
 * All host facts flow through hooks so the runtime panel, the provider table
 * and the About page never disagree. UI preferences (last panel, sidebar
 * lock, hover-to-expand, logo toggle, language) are persisted on the HOST
 * under `<AEK_HOME>/preferences/` (C11: never localStorage) so a refresh —
 * in any browser, on any machine — never throws the user back to defaults.
 *
 * Inside the Electron shell (C2) the root gets a `trafficInset` class so the
 * macOS traffic lights do not cover the sidebar header.
 *
 * @module @cheezmil/aek-home/src/client/Home
 */
import { useCallback } from 'react'
import { I18nProvider } from './i18n.tsx'
import { InfoPanels } from './InfoPanels.tsx'
import { oneOf, parseBoolean, PREF_KEYS, PrefProvider, usePref } from './preferences.tsx'
import { Sidebar } from './Sidebar.tsx'
import type { PanelId } from './Sidebar.tsx'
import { RuntimeModePanel } from './RuntimeModePanel.tsx'
import { css, cx } from './styles.ts'
import { useInventory } from './useInventory.ts'
import { useCurrentSlot } from './useRuntimeMode.ts'
import { WebSearchPanel } from './WebSearchPanel.tsx'
import { useWebsearchStatus } from './useWebsearchStatus.ts'

/** All valid panel ids, used to validate a persisted value. */
const PANEL_IDS: readonly PanelId[] = ['runtime', 'websearch', 'plugins', 'settings', 'about']

/**
 * Props kept for API compatibility with earlier aek-home releases; the
 * console navigates internally and needs no external callback.
 */
export interface AekHomeProps {
  /** Optional advance callback (unused by the console). */
  onContinue?: (() => void) | undefined
}

/** The console body; separated so it can consume the i18n + prefs contexts. */
function Console() {
  const [panel, setPanel] = usePref<PanelId>(PREF_KEYS.panel, 'runtime', oneOf(PANEL_IDS))
  const [collapsed, setCollapsed] = usePref<boolean>(PREF_KEYS.collapsed, false, parseBoolean)
  const [hoverExpand, setHoverExpand] = usePref<boolean>(PREF_KEYS.hoverExpand, true, parseBoolean)
  const [logoToggle, setLogoToggle] = usePref<boolean>(PREF_KEYS.logoToggle, true, parseBoolean)
  const state = useWebsearchStatus()
  const inventory = useInventory()
  const currentSlot = useCurrentSlot()

  const toggleHoverExpand = useCallback((next: boolean) => setHoverExpand(next), [setHoverExpand])
  const toggleLogoToggle = useCallback((next: boolean) => setLogoToggle(next), [setLogoToggle])

  // C2: inside the Electron shell the macOS traffic lights float over the
  // top-left corner, so the sidebar header gets an extra top inset.
  const isElectron = /Electron\//u.test(navigator.userAgent)

  return (
    <div className={cx(css.app, isElectron && css.trafficInset)}>
      <Sidebar
        active={panel}
        onSelect={setPanel}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(value => !value)}
        hoverExpandEnabled={hoverExpand}
        providerCount={state.status?.providers.length}
        currentSlot={currentSlot}
        logoToggleEnabled={logoToggle}
      />

      <div className={css.main}>
        <main className={css.content}>
          {panel === 'runtime'
            ? <RuntimeModePanel />
            : null}
          {panel === 'websearch'
            ? <WebSearchPanel state={state} />
            : null}
          {panel === 'plugins' || panel === 'settings' || panel === 'about'
            ? (
              <InfoPanels
                panel={panel}
                inventory={inventory}
                hoverExpand={hoverExpand}
                onToggleHoverExpand={toggleHoverExpand}
                logoToggle={logoToggle}
                onToggleLogoToggle={toggleLogoToggle}
              />
            )
            : null}
        </main>
      </div>
    </div>
  )
}

/**
 * Render the AEK console.
 * @param _props - retained for API compatibility.
 * @returns the application root.
 */
export function AekHome(_props: AekHomeProps) {
  return (
    <PrefProvider>
      <I18nProvider>
        <Console />
      </I18nProvider>
    </PrefProvider>
  )
}
