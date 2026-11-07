/**
 * The AEK console application root. The dsh shell is not mounted in the AEK
 * web profile, so this surface owns the whole `#root`: a left navigation rail
 * and a content column. There is no top bar any more — the "local instance"
 * badge lives in the sidebar header instead.
 *
 * All host facts flow through two hooks so the sidebar badge, the overview
 * stats, the provider table and the About page never disagree. UI preferences
 * (last panel, sidebar lock, hover-to-expand, language) are persisted in
 * localStorage so a refresh never throws the user back to the default page.
 *
 * @module @cheezmil/aek-home/src/client/Home
 */
import { useCallback } from 'react'
import { I18nProvider, useI18n } from './i18n.tsx'
import { InfoPanels } from './InfoPanels.tsx'
import { OverviewPanel } from './OverviewPanel.tsx'
import { oneOf, parseBoolean, PREF_KEYS, useStoredState } from './preferences.ts'
import { Sidebar } from './Sidebar.tsx'
import type { PanelId } from './Sidebar.tsx'
import { css } from './styles.ts'
import { useInventory } from './useInventory.ts'
import { WebSearchPanel } from './WebSearchPanel.tsx'
import { useWebsearchStatus } from './useWebsearchStatus.ts'

/** All valid panel ids, used to validate a persisted value. */
const PANEL_IDS: readonly PanelId[] = ['overview', 'websearch', 'plugins', 'settings', 'about']

/**
 * Props kept for API compatibility with earlier aek-home releases; the
 * console navigates internally and needs no external callback.
 */
export interface AekHomeProps {
  /** Optional advance callback (unused by the console). */
  onContinue?: (() => void) | undefined
}

/** The console body; separated so it can consume the i18n context. */
function Console() {
  const { t } = useI18n()
  const [panel, setPanel] = useStoredState<PanelId>(PREF_KEYS.panel, 'overview', oneOf(PANEL_IDS))
  const [collapsed, setCollapsed] = useStoredState<boolean>(PREF_KEYS.collapsed, false, parseBoolean)
  const [hoverExpand, setHoverExpand] = useStoredState<boolean>(PREF_KEYS.hoverExpand, true, parseBoolean)
  const state = useWebsearchStatus()
  const inventory = useInventory()

  const toggleHoverExpand = useCallback((next: boolean) => setHoverExpand(next), [setHoverExpand])

  return (
    <div className={css.app}>
      <Sidebar
        active={panel}
        onSelect={setPanel}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(value => !value)}
        hoverExpandEnabled={hoverExpand}
        providerCount={state.status?.providers.length}
      />

      <div className={css.main}>
        <main className={css.content}>
          <div className={css.pageHeader}>
            <p className={css.pageEyebrow}>{t(`page.eyebrow.${panel}`)}</p>
            <h1 className={css.pageTitle}>{t(`panel.${panel}`)}</h1>
            <p className={css.pageSubtitle}>{t(`page.subtitle.${panel}`)}</p>
          </div>

          {panel === 'overview'
            ? <OverviewPanel state={state} onOpen={setPanel} />
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
    <I18nProvider>
      <Console />
    </I18nProvider>
  )
}
