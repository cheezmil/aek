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
 * @module @cheezmil/aek-web/src/Home
 */
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CanonicalHostRedirect, isLegacyLoopback } from './CanonicalHost.tsx'
import { I18nProvider, useI18n } from './i18n.tsx'
import { InfoPanels } from './InfoPanels.tsx'
import { PromptsPanel, SkillsPanel } from './ConsolePanels.tsx'
import { oneOf, PREF_KEYS, PrefProvider, usePref, usePrefLanded, useSettings, parseBoolean } from './preferences.tsx'
import { Sidebar } from './Sidebar.tsx'
import type { PanelId } from './nav-model.ts'
import {
  panelFamilyOf,
  parseCommaList,
  RAIL_HIDDEN_KEY,
  RAIL_LABELS_HIDDEN_KEY,
} from './nav-model.ts'
import { PluginSubNav } from './PluginSubNav.tsx'
import { RuntimeModePanel } from './RuntimeModePanel.tsx'
import { AboutPanel, PluginsPanel } from './InfoPanels.tsx'
import { SetupWizard } from './Setup.tsx'
import { sidebarCssVars } from './settings-schema.ts'
import { cn } from '@/lib/utils'
import { useInventory } from './useInventory.ts'
import { useCurrentSlot } from './useRuntimeMode.ts'
import { useConsoleFacts } from './useConsoleFacts.ts'
import { WebSearchPanel } from './WebSearchPanel.tsx'
import { useWebsearchStatus } from './useWebsearchStatus.ts'
import { prefetchRanking } from './useWebsearchRanking.ts'
import type { FreeFilter } from './useWebsearchRanking.ts'

/** All valid panel ids, used to validate a persisted value. */
const PANEL_IDS: readonly PanelId[] = [
  'runtime', 'websearch', 'plugins', 'skills', 'prompts', 'websearchSettings', 'settings', 'about',
]

/**
 * B round: parse the pre-warmed Web Search settings at the console root
 * (the panel's own parsers are module-local; these mirror them).
 * @param raw - the raw host value. @returns a valid free-tier literal or undefined.
 */
function parseFreeTierHome(raw: unknown): FreeFilter | undefined {
  return raw === 'yes' || raw === 'no' ? raw : undefined
}

/** @param raw - the raw host value. @returns a positive TTL in hours, or undefined. */
function parseTtlHoursHome(raw: unknown): number | undefined {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * B round: parse the panel out of the URL PATHNAME (`/websearch` — clean
 * path routing, no `#`). The host web server answers every unknown clean
 * path with the app document (frontend-static SPA fallback), so a pasted
 * or typed URL deep-links straight to the panel.
 * @param pathname - `window.location.pathname`.
 * @returns the panel id when the path names one, else `undefined`
 * (`'/'` = no panel named; the persisted pref decides).
 */
function panelFromPath(pathname: string): PanelId | undefined {
  const id = pathname.replace(/^\/+/, '').replace(/\/+$/, '')
  return (PANEL_IDS as readonly string[]).includes(id) ? (id as PanelId) : undefined
}

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

  // B round: URL routing — the active panel mirrors into the address bar as
  // `/<panelId>` (clean path routing, no `#`) so the console behaves like a
  // routed app: the URL is copyable (deep links) and browser back/forward
  // walk the panel history. The host answers unknown clean paths with the
  // app document, so refresh and pasted URLs both deep-link.
  //
  // OWNERSHIP RULE: before the host pref lands, the URL is authoritative
  // (a typed/pasted deep link must not be clobbered by the fallback panel
  // value); AFTER it lands, in-app panel changes own the URL, while URL
  // navigation (back/forward, the deep-link claim itself) must not push a
  // duplicate entry. `urlDrivenRef` is the hand-off flag between the two.
  const panelRef = useRef(panel)
  panelRef.current = panel
  const urlDrivenRef = useRef(false)
  const landed = usePrefLanded()
  // Runs ONLY on the landed transition — never again. Re-running on
  // `setPanel` identity (which changes with the panel value) is what made
  // the claim fight every in-app switch: each click would be re-asserted
  // back to the URL's panel (the "twitching" the user saw).
  // `landed` alone is the trigger; `setPanel` is a stable-enough closure.
  useEffect(() => {
    if (!landed) return
    const parsed = panelFromPath(window.location.pathname)
    if (parsed !== undefined && parsed !== panelRef.current) {
      urlDrivenRef.current = true
      setPanel(parsed)
    }
  }, [landed])
  // Mirror panel → URL only for IN-APP changes (push one entry; never echo
  // a URL-driven panel back into the history stack).
  useEffect(() => {
    if (!landed) return
    if (urlDrivenRef.current) {
      urlDrivenRef.current = false
      return
    }
    const target = `/${panel}`
    if (window.location.pathname !== target) {
      window.history.pushState(null, '', target)
    }
  }, [panel, landed])
  // URL → panel (browser back/forward / a typed or pasted path).
  useEffect(() => {
    const onPopState = (): void => {
      const parsed = panelFromPath(window.location.pathname)
      if (parsed !== undefined && parsed !== panelRef.current) {
        urlDrivenRef.current = true
        setPanel(parsed)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () =>{  window.removeEventListener('popstate', onPopState) }
  }, [setPanel])

  // B round: pre-warm the Web Search ranking board (its module cache) so the
  // panel's FIRST visit renders the grouped board in ONE frame — no
  // skeleton → board two-stage pop. Same host-persisted settings the panel
  // itself reads; the "不进行任何排行分类" switch disables every read.
  const [prefFreeTier] = usePref<FreeFilter>(PREF_KEYS.websearchFreeTier, 'yes', parseFreeTierHome)
  const [prefPhone] = usePref(PREF_KEYS.websearchPhone, false, parseBoolean)
  const [prefCard] = usePref(PREF_KEYS.websearchCard, false, parseBoolean)
  const [prefTtlHours] = usePref(PREF_KEYS.websearchRankingTtlHours, 24, parseTtlHoursHome)
  const [prefNoRanking] = usePref(PREF_KEYS.websearchNoRanking, false, parseBoolean)
  useEffect(() => {
    prefetchRanking({ free: prefFreeTier, phone: prefPhone, card: prefCard }, { ttlHours: prefTtlHours, enabled: !prefNoRanking })
  }, [prefFreeTier, prefPhone, prefCard, prefTtlHours, prefNoRanking])

  // EE round: keep-alive panel switching — every panel the user has VISITED
  // stays mounted (hidden) instead of B round's 18-frame hold, which
  // unmounted the old tree ~300 ms after a switch. Re-entering a visited
  // panel re-shows the LIVE tree in place: no element is ever rebuilt "from
  // nothing", no data is refetched on entry, no scroll / input / selection
  // position is lost — a switch reads as a tab flip, not a page reload.
  // Cost: hidden panels' effects keep running (their pollers keep ticking);
  // the console's panels are few and each polls a cheap local host API, so
  // the trade is worth it (the user explicitly called the remount "wrong").
  const [visitedPanels, setVisitedPanels] = useState<PanelId[]>(() => [panel])
  useEffect(() => {
    setVisitedPanels(previous => (previous.includes(panel) ? previous : [...previous, panel]))
  }, [panel])
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
  // A round: the rail can be HIDDEN by single-clicking the family row in the
  // main rail (host pref `aek-home.pluginRailHidden`), and its labels can be
  // collapsed to icons by double-clicking (host pref
  // `aek-home.pluginRailLabelsHidden`). Both live in `nav-model.ts`.
  const family = panelFamilyOf(panel) as PanelId | undefined
  const [hiddenRails] = usePref<string>(RAIL_HIDDEN_KEY, '', parseCommaList)
  const [labelsHidden] = usePref<string>(RAIL_LABELS_HIDDEN_KEY, '', parseCommaList)
  const railVisible = family !== undefined && !hiddenRails.split(',').filter(Boolean).includes(family)
  const labelsCollapsed = family !== undefined && labelsHidden.split(',').filter(Boolean).includes(family)

  /**
   * B round: the panel → content mapping lives in ONE function so the
   * held-previous tree (switching, no blank) and the live tree share it.
   * @param id - the panel to render.
   * @returns that panel's content component (or nothing).
   */
  const renderPanelContent = (id: PanelId) => {
    // M round: 运行实例管理 was renamed 插件与程序管理 and now hosts the
    // former 插件管理 page AND the former 关于 content — one combined page.
    // The 插件管理 entry is gone from the nav; 关于 stays but is empty.
    if (id === 'runtime') {
      // N round: the three stacked cards read as "排版混乱，分类混乱" — no
      // section titles, and the plugin list duplicated across two cards.
      // T round: the 运行时与内存 section was folded INTO the 插件与程序 card
      // (RuntimesBlock inside PluginsPanel) — the numbered rows live next to
      // the roster they meter, so the page scans as two titled sections.
      const { t } = useI18n()
      // accent bar (top 3px, radius 2px) maps to top-0.75 / rounded-xs pending 0.25-step decimals.
      // .programsSectionHint had margin: -2px 0 var(--aek-space-4) → -mt-0.5 mb-4.
      // III round: pl-3 (12) → pl-4 (16) — the title text now aligns exactly
      // with the card body inset (p-4 = 16px, the single-card-scale step);
      // the accent bar (before:left-0) stays on the card edge.
      const sectionTitleClass = 'relative mb-6 pl-6 text-base font-bold tracking-normal text-text before:absolute before:content-[""] before:left-0 before:top-0.75 before:h-4 before:w-1 before:rounded-3xs before:bg-primary'
      return (
        <div>
          {/* III round: section gap 32 (mt-8) → 24 (mt-6). The spacing ladder
              is now strictly descending: page 32 > section 24 > card body
              16 > row box 12 > rows 8 > micro 4 (Windmill 4px-grid +
              Vercel content-24/card-16 references, borrowed 2026-11-17). */}
          <section className="mt-8 first:mt-0">
            <h2 className={sectionTitleClass}>{t('panel.runtimeSection')}</h2>
            <RuntimeModePanel refreshSignal={signalFor('runtime')} />
          </section>
          {/* 2026-11-17: the 基础语言 / A1A2 stackHint line was removed on
              user demand ("去掉这个文字" — the title + roster speak for
              themselves; the hint duplicated the chip legend). */}
          <section className="mt-8 first:mt-0">
            <h2 className={sectionTitleClass}>{t('panel.pluginsSection')}</h2>
            <PluginsPanel refreshSignal={signalFor('plugins')} />
          </section>
          <section className="mt-8 first:mt-0">
            <h2 className={sectionTitleClass}>{t('panel.infoSection')}</h2>
            <AboutPanel inventory={inventory} refreshSignal={signalFor('about')} compactPlugins />
          </section>
        </div>
      )
    }
    if (id === 'websearch') return <WebSearchPanel state={state} refreshSignal={signalFor('websearch')} facts={facts} />
    if (id === 'plugins' || id === 'settings' || id === 'websearchSettings' || id === 'about') {
      return <InfoPanels panel={id} inventory={inventory} refreshSignal={signalFor(id)} />
    }
    if (id === 'skills') return <SkillsPanel refreshSignal={signalFor('skills')} />
    return <PromptsPanel refreshSignal={signalFor('prompts')} />
  }

  return (
    // .app: font 14px/1.6 + antialiased is now the global body rule, so only layout + color remain.
    <div className="flex min-h-screen bg-background text-text" style={style}>
      <Sidebar
        active={panel}
        onSelect={setPanel}
        currentSlot={currentSlot}
        onRefresh={requestRefresh}
      />

      <div className={cn('flex flex-1 flex-col min-w-0', railVisible && 'flex-row')}>
        {railVisible ? <PluginSubNav active={panel} onSelect={setPanel} labelsHidden={labelsCollapsed} /> : null}
        <div className="flex flex-1 flex-col min-w-0">
          {/* FF-NOTE: .content had max-width: 1320px → max-w-330 (v4 dynamic spacing: 330 × 4px);
              @media (max-width: 860px) padding: 20px 16px → max-[860px]:px-4 max-[860px]:py-5. */}
          {/* III round +: 左右外边距 32 (p-8) → 24 (px-6, Vercel/Linear content-24 口径),
              上下保持 32 — 用户点破「左右padding呢」：宽窗口下两侧 32px 留白太大。 */}
          <main className="mx-auto flex-1 w-full max-w-330 p-12 max-[860px]:px-6 max-[860px]:py-8">
            {/* EE round: keep-alive — every visited panel renders; only the
                active one is visible. Hidden trees keep their state, so a
                switch back never rebuilds the elements from nothing. */}
            {visitedPanels.map(id => (
              <div key={id} style={{ display: id === panel ? 'block' : 'none' }}>
                {renderPanelContent(id)}
              </div>
            ))}
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
/**
 * X5b: the app-level route split. The /setup first-run wizard (macOS
 * setup-assistant style) replaces the whole console; every other path
 * renders the console as before. The split lives ABOVE both providers'
 * consumers so the wizard keeps i18n + prefs. Back/forward (and the
 * notice's pushState + manual popstate) move between the two.
 */
function normalizePath(pathname: string): string {
  return pathname.replace(/^\/+/, '').replace(/\/+$/, '')
}

export function AekHome(_props: AekHomeProps) {
  const [route, setRoute] = useState(() => normalizePath(window.location.pathname))
  useEffect(() => {
    const onPop = (): void => {
      setRoute(normalizePath(window.location.pathname))
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
    }
  }, [])
  const isSetup = route === 'setup'
  return (
    <PrefProvider>
      <I18nProvider>
        {/* A page opened on `127.0.0.1:<port>` hops to the slot's own host, so
            Chromium does not key its zoom (and storage) together with every
            other local web UI. Only mounted on the legacy origin, so the
            canonical path pays no extra request. */}
        {isLegacyLoopback(window.location.hostname) ? <CanonicalHostRedirect /> : null}
        {isSetup
          ? (
            <SetupWizard
              onDone={() => {
                window.history.pushState(null, '', '/')
                setRoute('')
              }}
            />
          )
          : <Console />}
      </I18nProvider>
    </PrefProvider>
  )
}
