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
import { useCallback, useEffect, useState } from 'react'
import { CanonicalHostRedirect, isLegacyLoopback } from './CanonicalHost.tsx'
import { I18nProvider } from './i18n.tsx'
import { InfoPanels } from './InfoPanels.tsx'
import { PromptsPanel, SkillsPanel } from './ConsolePanels.tsx'
import { oneOf, PREF_KEYS, PrefProvider, usePref, useSettings } from './preferences.tsx'
import { Sidebar } from './Sidebar.tsx'
import type { PanelId } from './nav-model.ts'
import { panelFamilyOf } from './nav-model.ts'
import { PluginSubNav } from './PluginSubNav.tsx'
import { RuntimeModePanel } from './RuntimeModePanel.tsx'
import { sidebarCssVars } from './settings-schema.ts'
import { css, cx } from './styles.ts'
import { useInventory } from './useInventory.ts'
import { useCurrentSlot } from './useRuntimeMode.ts'
import { useConsoleFacts } from './useConsoleFacts.ts'
import { WebSearchPanel } from './WebSearchPanel.tsx'
import { useWebsearchStatus } from './useWebsearchStatus.ts'

/** All valid panel ids, used to validate a persisted value. */
const PANEL_IDS: readonly PanelId[] = [
  'runtime', 'websearch', 'plugins', 'skills', 'prompts', 'websearchSettings', 'settings', 'about',
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
  // Host facts lifted to the root: the Web Search page needs them for the
  // path display-style setting, and this keeps one shared fetch for every
  // surface instead of one per panel mount.
  const facts = useConsoleFacts()
  // The status hook lives at the app root, so it does not remount when the user
  // leaves and re-enters the panel. Reading it again on entry is what makes a
  // plugin switched off *from the plugin page* show up here as a banner instead
  // of a stale provider list.
  const { refresh: refreshWebsearch } = state
  useEffect(() => {
    if (panel === 'websearch') refreshWebsearch()
  }, [panel, refreshWebsearch])

  // Q round: the sidebar row's refresh icon records ONE pending refresh for
  // the clicked page. If that page is open it fires immediately (each panel
  // consumes `refreshSignal` in an effect); if it is closed the tick is kept
  // here and consumed the next time the page opens — "refresh THAT page".
  const [refreshTicks, setRefreshTicks] = useState<Partial<Record<PanelId, number>>>({})
  const requestRefresh = useCallback((id: PanelId): void => {
    setRefreshTicks(previous => ({ ...previous, [id]: (previous[id] ?? 0) + 1 }))
  }, [])

  // Schema-driven CSS: every numeric sidebar setting lands here. The cast is
  // needed because React's CSSProperties type does not enumerate custom
  // properties, even though the DOM accepts them.
  const style = sidebarCssVars(prefs) as CSSProperties

  const signalFor = (id: PanelId): number => refreshTicks[id] ?? 0

  // Z round: a panel owned by a plugin that has internal routes (a family
  // root like `websearch`, or one of its routes like `websearchSettings`)
  // gets the plugin's OWN route rail next to its content; plain panels get
  // no rail. The class switches the main area from a column to a row.
  const family = panelFamilyOf(panel) as PanelId | undefined

  return (
    <div className={css.app} style={style}>
      <Sidebar
        active={panel}
        onSelect={setPanel}
        currentSlot={currentSlot}
        onRefresh={requestRefresh}
      />

      <div className={cx(css.main, family !== undefined && css.mainWithSubNav)}>
        {family !== undefined ? <PluginSubNav active={panel} onSelect={setPanel} /> : null}
        <div className={css.mainBody}>
          <main className={css.content}>
            {panel === 'runtime' ? <RuntimeModePanel refreshSignal={signalFor('runtime')} /> : null}
            {panel === 'websearch' ? <WebSearchPanel state={state} refreshSignal={signalFor('websearch')} facts={facts} /> : null}
            {panel === 'plugins' || panel === 'settings' || panel === 'websearchSettings' || panel === 'about'
              ? <InfoPanels panel={panel} inventory={inventory} refreshSignal={signalFor(panel)} />
              : null}
            {panel === 'skills' ? <SkillsPanel refreshSignal={signalFor('skills')} /> : null}
            {panel === 'prompts' ? <PromptsPanel refreshSignal={signalFor('prompts')} /> : null}
          </main>
        </div>
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
