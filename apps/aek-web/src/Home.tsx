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
import { useBaseTheme } from './base-theme.ts'
import { InfoPanels } from './InfoPanels.tsx'
import { PromptsPanel } from './ConsolePanels.tsx'
import { SkillsManagerPanel } from './SkillsManagerPanel.tsx'
import { oneOf, PREF_KEYS, PrefProvider, usePref, usePrefLanded, useSettings, parseBoolean } from './preferences.tsx'
import { Sidebar } from './Sidebar.tsx'
import type { PanelId } from './nav-model.ts'
import {
  NAV_IDS,
  panelAnchorOf,
  panelFamilyOf,
  panelRenderIdOf,
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
import { useCurrentSlot } from './useRuntimeMode.ts'
import { useConsoleFacts } from './useConsoleFacts.ts'
import { WebSearchPanel } from './WebSearchPanel.tsx'
import { IconManagerPanel } from './IconManagerPanel.tsx'
import { ArtGalleryPanel } from './webui-art-gallery/ArtGalleryPanel.tsx'
import { useWebsearchStatus } from './useWebsearchStatus.ts'
import { prefetchRanking } from './useWebsearchRanking.ts'
import type { FreeFilter } from './useWebsearchRanking.ts'

/**
 * All valid panel ids, used to validate a persisted value.
 *
 * R2 round: derived from the nav model (`NAV_IDS`) instead of a hand list, so a
 * new rail row (plugin settings page / built-in ANCHOR tab) is a valid deep
 * link + persisted pref the moment it lands in `nav-model.ts` — no second
 * place to remember. `plugins` is the retired bucket id the rail filters out
 * of display but the console still renders (InfoPanels), so it is appended.
 */
const PANEL_IDS: readonly PanelId[] = [...NAV_IDS, 'plugins'] as PanelId[]

/** BP round (m10318 item 3): the `.aek-content-main` padding (the base
    setting `aek-home.contentPad`, default 24px) is the DEFAULT for every
    panel — a panel that owns its own edge-to-edge layout declares
    `none` here and the padding is lifted for that panel only. The style
    gallery is full-bleed: its inner column scrolls on its own, so the
    outer padding would double the gutters and force the window to
    scroll alongside the panel (the user's 「父容器滚动」report). */
const PANEL_PAD_OVERRIDES: Partial<Record<PanelId, 'none'>> = { art: 'none' }

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
  const currentSlot = useCurrentSlot()

  // BL-13 round (m06737): a host rail row click that lands on the ACTIVE
  // panel is a same-value no-op for the pref above — the skills panel's
  // [panel] effect never fires, and its panel-local agent/project drill
  // survives, so the 首页 row looks dead while a drill is up. Bump this
  // counter on every first/second-rail row click; the skills panel clears
  // its drill on any bump. Extras-row drill clicks go through the panel's
  // own goNav and never bump this signal, so the BL-12 keep semantics hold.
  const [railNavSignal, setRailNavSignal] = useState(0)

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

  // R2 round: ANCHOR tabs position the active page — after the panel lands,
  // scroll the visible tree's `[data-nav-anchor]` target into view. One frame
  // delay so the target tree has been un-hidden first; hidden keep-alive
  // trees are filtered out (`offsetParent` is null while display:none).
  //
  // The scroll is INSTANT, mirroring the I-round lesson in InfoPanels'
  // dirty-row locator: `behavior: 'smooth'` scrollIntoView silently no-ops in
  // this shell whenever the compositor stalls (occluded / backgrounded dev
  // window), leaving the tab's target unpositioned — an instant jump is
  // reliable in every state.
  useEffect(() => {
    const anchor = panelAnchorOf(panel)
    if (anchor === undefined) return
    let cancelled = false
    const request = requestAnimationFrame(() => {
      if (cancelled) return
      const targets = Array.from(document.querySelectorAll(`[data-nav-anchor="${anchor}"]`))
      const visible = targets.find(element => element instanceof HTMLElement && element.offsetParent !== null)
      visible?.scrollIntoView({ behavior: 'instant', block: 'start' })
    })
    return () => { cancelled = true; cancelAnimationFrame(request) }
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

  // BL-13 round: every rail row click also bumps the rail nav signal, so a
  // click that lands on the already-active panel (a same-value no-op for the
  // pref) still reaches the skills panel and clears its panel-local drill.
  const handleRailSelect = useCallback((id: PanelId): void => {
    setPanel(id)
    setRailNavSignal(previous => previous + 1)
  }, [setPanel])

  // Schema-driven CSS: every numeric sidebar setting lands here. The cast is
  // needed because React's CSSProperties type does not enumerate custom
  // properties, even though the DOM accepts them.
  const style = sidebarCssVars(prefs) as CSSProperties

  // 2026-11-19: the MOTION kill switch (`aek-home.disableMotion`, the 基础设置
  // → 动态效果 section): when on, the console root carries `aek-no-motion`
  // and index.css crushes every transition / animation / delay in the app to
  // 0.01ms — AEK's own front-end motion, independent of the OS "reduce
  // motion" setting. The persisted value applies after the settings commit
  // (save-all / auto-save) re-fetches the map, exactly like every schema row.
  const noMotion = prefs['aek-home.disableMotion'] === true

  // BQ round (m10857 item 5): the base light/dark appearance — persisted
  // setting `aek-home.baseTheme` (settings page, default light) applied as
  // the `.dark` class on <html>; `auto` tracks the OS color scheme live.
  useBaseTheme()

  const signalFor = (id: PanelId): number => refreshTicks[id] ?? 0

  // Z round: a panel owned by a plugin that has internal routes (a family
  // root like `websearch`, or one of its routes like `websearchSettings`)
  // gets the plugin's OWN route rail next to its content; plain panels get
  // no rail. The class switches the main area from a column to a row.
  // A round: the rail can be HIDDEN by single-clicking the family row in the
  // main rail (host pref `aek-home.pluginRailHidden`), and its labels can be
  // collapsed to icons by double-clicking (host pref
  // `aek-home.pluginRailLabelsHidden`). Both live in `nav-model.ts`.
  // 2026-11-18: hidden is a zero-width ANIMATION on the mounted rail, not a
  // conditional render (see the `railHidden` note below).
  const family = panelFamilyOf(panel) as PanelId | undefined
  const [hiddenRails] = usePref<string>(RAIL_HIDDEN_KEY, '', parseCommaList)
  const [labelsHidden] = usePref<string>(RAIL_LABELS_HIDDEN_KEY, '', parseCommaList)
  // 2026-11-18 flicker fix: the rail stays MOUNTED for every family panel;
  // the per-family tucked-away state is passed down as `hidden` and renders
  // as a zero-width ANIMATED column (PluginSubNav), never an unmount. A
  // panel switch into a tucked-away rail was the old "sudden fold" (one
  // frame of full width, then the column vanishes and the content reflows)
  // — the user called it out; the fold now animates like the main rail's.
  const railHidden = family !== undefined && hiddenRails.split(',').filter(Boolean).includes(family)
  const labelsCollapsed = family !== undefined && labelsHidden.split(',').filter(Boolean).includes(family)

  /**
   * B round: the panel → content mapping lives in ONE function so the
   * held-previous tree (switching, no blank) and the live tree share it.
   *
   * R2 round: the switch runs on the panel's RENDER target, not the panel
   * itself — an ANCHOR route (a built-in page's section tab) renders the
   * FAMILY's page (`panelRenderIdOf`) and is positioned in-page by the
   * scroll effect below. The keep-alive mount set dedupes the same way, so
   * every anchor tab of one page shares ONE live tree.
   * @param id - the panel to render.
   * @returns that panel's content component (or nothing).
   */
  const renderPanelContent = (id: PanelId) => {
    const renderId = panelRenderIdOf(id)
    // M round: 运行实例管理 was renamed 插件与程序管理 and now hosts the
    // former 插件管理 page AND the former 关于 content — one combined page.
    // The 插件管理 entry is gone from the nav; 关于 stays but is empty.
    if (renderId === 'runtime') {
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
      const sectionTitleClass = 'relative mb-4 pl-3 text-base font-bold tracking-normal text-text before:absolute before:content-[""] before:left-0 before:top-0.75 before:h-4 before:w-1 before:rounded-3xs before:bg-primary'
      return (
        <div>
          {/* III round: section gap 32 (mt-8) → 24 (mt-6). The spacing ladder
              is now strictly descending: page 32 > section 24 > card body
              16 > row box 12 > rows 8 > micro 4 (Windmill 4px-grid +
              Vercel content-24/card-16 references, borrowed 2026-11-17). */}
          {/* R2 round: the 插件与程序管理 rail's ANCHOR tabs position this
              composed page to its three sections (the scroll effect reads
              `data-nav-anchor`). */}
          <section className="mt-8 first:mt-0" data-nav-anchor="runtimes">
            <h2 className={sectionTitleClass}>{t('panel.runtimeSection')}</h2>
            <RuntimeModePanel refreshSignal={signalFor('runtime')} />
          </section>
          {/* 2026-11-17: the 基础语言 / A1A2 stackHint line was removed on
              user demand ("去掉这个文字" — the title + roster speak for
              themselves; the hint duplicated the chip legend). */}
          <section className="mt-8 first:mt-0" data-nav-anchor="plugins">
            <h2 className={sectionTitleClass}>{t('panel.pluginsSection')}</h2>
            <PluginsPanel refreshSignal={signalFor('plugins')} />
          </section>
          <section className="mt-8 first:mt-0" data-nav-anchor="info">
            <h2 className={sectionTitleClass}>{t('panel.infoSection')}</h2>
            <AboutPanel refreshSignal={signalFor('about')} />
          </section>
        </div>
      )
    }
    if (renderId === 'websearch') return <WebSearchPanel state={state} refreshSignal={signalFor('websearch')} facts={facts} />
    // IV / V6.7 round: the icon manager. When id matches one of the set
    // sub-routes we hand it an `activeSet` prefix so it renders just that
    // library on its own page; the family root (`icons`) shows the full
    // compendium (same as before). No separate component is needed — the
    // same panel handles both views.
    // R2 round: EXACT ids only — the new `iconsSettings` page starts with
    // "icons" but is the plugin's SETTINGS page (InfoPanels), never a
    // library view.
    if (renderId === 'icons'
      || renderId === 'iconsLucide'
      || renderId === 'iconsTabler'
      || renderId === 'iconsPhosphor'
      || renderId === 'iconsHeroicons'
      || renderId === 'iconsBootstrap') {
      const activeSet = renderId === 'icons' ? undefined : renderId.slice('icons'.length) || undefined
      return <IconManagerPanel activeSet={activeSet} />
    }
    // BO round (m07690 item 7): the style gallery — its settings sub-route
    // (`artSettings`) stays in the InfoPanels chain below.
    if (renderId === 'art') {
      return <ArtGalleryPanel />
    }
    // R2 round: the three plugin SETTINGS pages (skills / prompts / icons)
    // and 基础设置 / Web Search 设置 / 关于 all live in InfoPanels.
    if (renderId === 'plugins'
      || renderId === 'settings'
      || renderId === 'websearchSettings'
      || renderId === 'skillsSettings'
      || renderId === 'promptsSettings'
      || renderId === 'iconsSettings'
      || renderId === 'artSettings'
      || renderId === 'about') {
      // R2: `renderId` is narrowed to the InfoPanelId union by the if-chain,
      // so no cast is needed (and an unnecessary one is a lint error).
      return <InfoPanels panel={renderId} refreshSignal={signalFor(renderId)} />
    }
    if (renderId === 'skills') {
      return <SkillsManagerPanel refreshSignal={signalFor('skills')} railNavSignal={railNavSignal} />
    }
    return <PromptsPanel refreshSignal={signalFor('prompts')} />
  }

  return (
    // .app: font 14px/1.6 + antialiased is now the global body rule, so only layout + color remain.
    // BP round: full-bleed panels (PANEL_PAD_OVERRIDES) pin the app shell to a
    // definite 100dvh height — `min-h-screen` alone is a MINIMUM, so the
    // flex-1 chain below it has no definite height and the panel's `h-full`
    // collapses into content height (the document itself scrolls behind the
    // gallery, the user's 「父容器滚动」report).
    <div className={cn('aek-root flex min-h-screen bg-background text-text', noMotion && 'aek-no-motion', PANEL_PAD_OVERRIDES[panel] === 'none' && 'aek-app-art')} style={style}>
      <Sidebar
        active={panel}
        onSelect={handleRailSelect}
        currentSlot={currentSlot}
        onRefresh={requestRefresh}
      />

      <div className={cn('flex flex-1 flex-col min-w-0', family !== undefined && 'flex-row')}>
        {family !== undefined
          ? (
            <PluginSubNav
              active={panel}
              onSelect={handleRailSelect}
              labelsHidden={labelsCollapsed}
              hidden={railHidden}
              onRefresh={requestRefresh}
            />
          )
          : null}
        <div className="flex flex-1 flex-col min-w-0">
          {/* BO round (m07690 item 5): the old 1320px cap (FF round,
              max-w-330) left wide windows as a centered column — the
              user read the capped content as 「干净显示一半」. Lifting
              the cap: the content column now spans the full width of
              the window and the page keeps a single ground color.
              @media (max-width: 860px) padding: 20px 16px → max-[860px]:px-4 max-[860px]:py-5. */}
          {/* III round +: 左右外边距 32 (p-8) → 24 (px-6) → px-20 / py-12，
              用户点破「左右padding呢」；BI round 起留白改走基础设置。 */}
          {/* BI round: the padding used to be hard-coded (py-12 px-20) and the
              user found it too wide — it now comes from the base setting
              `aek-home.contentPad` (index.css `.aek-content-main`, default 24px).
              Small screens keep a FIXED padding: the max-[860px] utilities on
              the same element beat the components-layer rule. */}
          <main className="aek-content-main mx-auto min-h-0 flex-1 w-full max-[860px]:px-8 max-[860px]:py-10" data-pad={PANEL_PAD_OVERRIDES[panel] ?? 'default'}>
            {/* EE round: keep-alive — every visited panel renders; only the
                active one is visible. Hidden trees keep their state, so a
                switch back never rebuilds the elements from nothing.
                R2 round: the mount set is keyed by RENDER target — every
                ANCHOR tab of one page dedupes into that page's single tree
                (the tabs only differ in scroll position, the anchor scroll
                effect above). */}
            {[...new Set(visitedPanels.map(panelRenderIdOf))].map(renderId => (
              <div key={renderId} className={renderId === 'art' ? 'h-full' : undefined} style={{ display: renderId === panelRenderIdOf(panel) ? 'block' : 'none' }}>
                {renderPanelContent(renderId as PanelId)}
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
