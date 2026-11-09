/**
 * The AEK console application root.
 *
 * 2026-11-09 round: the panel set grew (instance manager, web search, plugin
 * management, skill manager, prompt manager, settings, permissions, about).
 * All user-adjustable rail metrics are injected here as CSS custom properties
 * derived from the schema-driven settings — no dimension is hardcoded in a
 * component. The desktop shell is back to its NATIVE title bar (R10), so the
 * old `trafficInset` workaround is gone.
 *
 * UI preferences live on the HOST (`<AEK_HOME>/preferences/`), never in
 * localStorage, so every window and machine sees the same settings.
 *
 * @module @cheezmil/aek-home/src/client/Home
 */
import type { CSSProperties } from 'react'
import { useEffect } from 'react'
import { CanonicalHostRedirect, isLegacyLoopback } from './CanonicalHost.tsx'
import { I18nProvider } from './i18n.tsx'
import { InfoPanels } from './InfoPanels.tsx'
import { PromptsPanel, SkillsPanel } from './ConsolePanels.tsx'
import { oneOf, PREF_KEYS, PrefProvider, usePref, useSettings } from './preferences.tsx'
import { Sidebar } from './Sidebar.tsx'
import type { PanelId } from './Sidebar.tsx'
import { RuntimeModePanel } from './RuntimeModePanel.tsx'
import { sidebarCssVars } from './settings-schema.ts'
import { css } from './styles.ts'
import { useInventory } from './useInventory.ts'
import { useCurrentSlot } from './useRuntimeMode.ts'
import { WebSearchPanel } from './WebSearchPanel.tsx'
import { useWebsearchStatus } from './useWebsearchStatus.ts'

/** All valid panel ids, used to validate a persisted value. */
const PANEL_IDS: readonly PanelId[] = [
  'runtime', 'websearch', 'plugins', 'skills', 'prompts', 'settings', 'about',
]

/** Props kept for API compatibility with earlier aek-home releases. */
export interface AekHomeProps {
  /** Optional advance callback (unused by the console). */
  onContinue?: (() => void) | undefined
}

/** The console body; separated so it can consume the i18n + prefs contexts. */
function Console() {
  const [panel, setPanel] = usePref<PanelId>(PREF_KEYS.panel, 'runtime', oneOf(PANEL_IDS))
  const { prefs } = useSettings()
  const state = useWebsearchStatus()
  const inventory = useInventory()
  const currentSlot = useCurrentSlot()
  // The status hook lives at the app root, so it does not remount when the user
  // leaves and re-enters the panel. Reading it again on entry is what makes a
  // plugin switched off *from the plugin page* show up here as a banner instead
  // of a stale provider list.
  const { refresh: refreshWebsearch } = state
  useEffect(() => {
    if (panel === 'websearch') refreshWebsearch()
  }, [panel, refreshWebsearch])

  // Schema-driven CSS: every numeric sidebar setting lands here. The cast is
  // needed because React's CSSProperties type does not enumerate custom
  // properties, even though the DOM accepts them.
  const style = sidebarCssVars(prefs) as CSSProperties

  return (
    <div className={css.app} style={style}>
      <Sidebar
        active={panel}
        onSelect={setPanel}
        providerCount={state.status?.providers.length}
        currentSlot={currentSlot}
      />

      <div className={css.main}>
        <main className={css.content}>
          {panel === 'runtime' ? <RuntimeModePanel /> : null}
          {panel === 'websearch' ? <WebSearchPanel state={state} /> : null}
          {panel === 'plugins' || panel === 'settings' || panel === 'about'
            ? <InfoPanels panel={panel} inventory={inventory} />
            : null}
          {panel === 'skills' ? <SkillsPanel /> : null}
          {panel === 'prompts' ? <PromptsPanel /> : null}
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
        {/* A page opened on `127.0.0.1:<port>` hops to the slot's own host, so
            Chromium does not key its zoom (and storage) together with every
            other local web UI. Only mounted on the legacy origin, so the
            canonical path pays no extra request. */}
        {isLegacyLoopback(window.location.hostname) ? <CanonicalHostRedirect /> : null}
        <Console />
      </I18nProvider>
    </PrefProvider>
  )
}
