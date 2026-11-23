/**
 * The left navigation rail of the AEK console.
 *
 * 2026-11-09 round:
 * - One flat menu no longer scales, so entries live in collapsible DRAWER
 *   groups. The plugin family is grouped under 插件, everything else under 其他.
 *   The default expanded state is a host-persisted setting.
 * - EVERY entry has a pin affordance; pinned entries float into their own group.
 * - The logo (visibility / shape / the text beside it) and all rail metrics
 *   come from the schema-driven settings; CSS custom properties carry the
 *   numbers, so no dimension is hardcoded in JSX.
 * - EVERY list is an unordered `<ul>/<li>`. No `<ol>` anywhere.
 * - The top search box filters the rail; panel-level search boxes live in the
 *   panels themselves.
 *
 * Z round: the rail is at most TWO levels (group → row). The third-level
 * boards (a plugin's own routes, e.g. its settings page) left the rail — a
 * plugin manages them in its OWN side rail (`PluginSubNav`). Clicking a
 * family row still re-opens the remembered route (Y round `lastSub` memory);
 * the X-round show/hide toggle of the third-level rows is gone with them.
 * The shared model (NAV / family routes / last-sub memory) lives in
 * `nav-model.ts` so the rail and the plugin side rails read one source.
 *
 * A round: a FAMILY row (one that owns plugin routes) gains click semantics:
 * SINGLE click on the lit row = select the remembered route AND toggle the
 * plugin's own route rail (show/hide the `PluginSubNav` column); clicking a
 * DIFFERENT family row just navigates (BO round, m07690 item 1). Every
 * lit-row click toggles immediately — the BK-round 400 ms rolling window
 * that kept fast clicks from re-toggling is retired (BO round 2026-11-23,
 * m00001 ②). Collapsing a rail's LABELS (icon-only rows) is the dedicated
  * `type` icon in the row's hover action box (BI round); family rows always
  * carry a plain-styled `columns` icon that toggles the sub-rail (expand when
  * stowed, collapse when visible) with a state-dependent tooltip (BQ6 round, m03240).
 * Both states persist on the host (`aek-home.pluginRailHidden` /
 * `aek-home.pluginRailLabelsHidden`, comma lists in `nav-model.ts`).
 *
 * @module @cheezmil/aek-web/src/Sidebar
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { BrandMark, Icon } from './Icons.tsx'
import type { BrandVariant } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import type { Locale } from './i18n.tsx'
import { NAV, NAV_TOP, RAIL_HIDDEN_KEY, RAIL_LABELS_HIDDEN_KEY, parseCommaList, subEntriesOf, toggleInCommaList, useLastSubMemory } from './nav-model.ts'
import type { NavEntry, PanelId } from './nav-model.ts'
import { parseBoolean, PREF_KEYS, usePrefLanded, usePref, useSettings } from './preferences.tsx'
import { ROW_ACTIONS_HIDE_GRACE_MS, RowActionsFloat } from './RowActionsFloat.tsx'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { parseBaseTheme } from './base-theme.ts'
import type { BaseTheme } from './base-theme.ts'
import { cn } from '@/lib/utils'
import { RAIL_SEARCH_INPUT as NAV_SEARCH_INPUT, RAIL_SEARCH_ICON as NAV_SEARCH_ICON, RAIL_SEARCH_WRAP as NAV_SEARCH_WRAP } from './rail-searchbox.ts'

export type { PanelId } from './nav-model.ts'

/* FF round: the old rail module classes, now literal Tailwind utilities (1:1
   from Home.module.css L103-436 / L1860-2008). Mixed-time-scale transitions
   and pseudo-element choreography live in index.css component helpers
   (.aek-label-fade*, .aek-rail-item, .aek-drawer-group-compact, ...).
   STATE overrides (compact) are applied as MUTUALLY EXCLUSIVE class sets —
   never stacked, so utility-layer order can never pick a winner. */
const RAIL_ITEM = 'aek-rail-item relative flex items-center h-10 w-full font-medium text-left whitespace-nowrap cursor-pointer text-text-secondary hover:text-text hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'
const RAIL_ITEM_GEOM_EXPANDED = 'rounded-(--aek-sidebar-radius) pl-(--aek-sidebar-pad-x) pr-(--aek-sidebar-pad-x) gap-(--aek-sidebar-icon-gap)'
const RAIL_ITEM_GEOM_COMPACT = 'rounded-(--aek-sidebar-radius) gap-0 p-0 justify-center'
const RAIL_ITEM_ACTIVE = 'text-accent-ink bg-accent-soft hover:text-accent-ink hover:bg-accent-soft before:content-[""] before:absolute before:left-0 before:top-2.25 before:bottom-2.25 before:w-0.75 before:rounded-r-aek-bar before:bg-primary'
const NAV_ROW = 'group relative flex items-center gap-0.5 cursor-grab active:cursor-grabbing'
const NAV_ROW_DROP_BEFORE = 'before:content-[""] before:absolute before:left-1 before:right-1 before:-top-0.75 before:h-0.5 before:rounded-3xs before:bg-primary before:shadow-aek-ring'
const NAV_ROW_DROP_AFTER = 'after:content-[""] after:absolute after:left-1 after:right-1 after:-bottom-0.75 after:h-0.5 after:rounded-3xs after:bg-primary after:shadow-aek-ring'
/* BR round: the hover action card is a viewport-fixed float anchored to the
   row's RIGHT edge (+ 8px) by <RowActionsFloat> (it must never cover the
   option — the old in-row `right-0.5` card sat on top of the row, and
   anything past the rail edge was clipped by `overflow-hidden`). BG round
   (m03469): show / hide timing is the JS hover-intent grace in
   RowActionsFloat.tsx (the fade itself is CSS; its duration + the grace
   window are the `aek-home.animHoverFade` / `aek-home.animHoverGrace`
   settings, 基础设置 → 动画, BJ round). BK round (m05103): the card is
   portaled to <body> so the rail can never clip or z-trap it. */
const ROW_ICON_BUTTON = 'inline-flex items-center justify-center size-6 p-0 border-0 rounded-xs bg-transparent text-text-muted cursor-pointer transition-[color,background-color,transform] duration-140 ease-aek hover:text-primary hover:bg-accent-soft'
const LABEL_FADE = 'aek-label-fade'
const LABEL_FADE_HIDDEN = 'aek-label-fade-hidden'
/* BS round: the rail search box is one shared spec (rail-searchbox.ts) — the
   first and second level rails render identical boxes. */
const NAV_NO_MATCH = 'p-3 text-text-muted text-xs text-center transition-opacity duration-150 ease-aek'
const LOCALE_MENU_ITEM = 'flex items-center justify-between gap-2 w-full p-2 px-2.5 text-text-secondary bg-transparent border-0 rounded-sm text-xs-plus text-left cursor-pointer hover:text-text hover:bg-surface-hover'
const LOCALE_MENU_ACTIVE = 'text-accent-ink bg-accent-soft font-semibold'
const FOOTER_ICON_BUTTON = 'inline-flex items-center justify-center size-8.5 p-0 text-text-secondary bg-transparent border border-border rounded-sm cursor-pointer transition-[color,border-color,background-color] duration-150 ease-aek hover:text-primary hover:border-accent-border hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'
const DRAWER_GROUP = 'relative mt-3 before:content-[""] before:absolute before:top-0 before:left-1/2 before:-ml-3 before:w-6 before:h-px before:rounded-full before:bg-input before:opacity-0 before:pointer-events-none before:transition-opacity before:duration-140 before:ease-aek'
const DRAWER_GROUP_COMPACT = 'mt-2 pt-2 aek-drawer-group-compact'
const DRAWER_HEAD = 'flex items-center gap-1.5 w-full py-1 px-1.5 border-0 bg-transparent text-text-muted text-2xs font-bold tracking-aek-label uppercase cursor-pointer hover:text-text-secondary'
const DRAWER_CARET = 'transition-transform duration-180 ease-aek'
const DRAWER_LABEL = 'grow shrink text-left'

/** Delay before a pointer hover starts the peek (hover intent). */

/**
 * D round: the family-row click disambiguation no longer waits on a timer.
 * Chromium's INTENSIVE TIMER THROTTLING clamps every `setTimeout` to ≥1 s
 * (up to 1 min) in long-lived / occluded sessions, so a 250 ms wait made
 * both the panel switch and the rail toggle feel a second late. The toggle
 * is therefore driven directly from the click, with a per-row rolling 400 ms
 * window (BK round m04772) collapsing fast bursts into one toggle:
 * - cross-page click: SELECT immediately + toggle the rail show/hide;
 * - fast burst on the same row: only the first click toggles (no cancel);
 * - collapsing the rail's labels is the dedicated icon in the hover box
 *   (BI round), timer-free.
 */

/** W round: the rail width the user can drag between (the CSS default is 248). */
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 480
const SIDEBAR_DEFAULT_WIDTH = 248

/** @param raw - the parsed width. @returns a clamped number, or undefined. */
function parseSidebarWidth(raw: unknown): number | undefined {
  const value = Number(raw)
  if (!Number.isFinite(value)) return undefined
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value))
}

/** BJ round: clamp the hover-card grace-window setting to its schema range (0–1000ms). */
function parseAnimHoverGrace(raw: unknown): number | undefined {
  const value = Number(raw)
  if (!Number.isFinite(value)) return undefined
  return Math.min(1000, Math.max(0, value))
}

/** The project's public repository (verified with `gh repo view`). */
const GITHUB_REPO_URL = 'https://github.com/cheezmil/agent-enhance-kit'

/** Host preference holding comma-separated pinned panel ids. */
const PINNED_KEY = 'aek-home.pinned'
/** Host preference holding the default drawer expanded state. */
const DRAWER_KEY = 'aek-home.drawerExpanded'
/**
 * Host preference holding the user's manual row order (comma-separated panel
 * ids). Rows can be dragged inside their drawer; the order is global so a row
 * keeps its slot when it is pinned / unpinned.
 */
const ORDER_KEY = 'aek-home.order'
/**
 * X round: restore the rail's bottom horizontal scrollbar (default: hidden).
 * (The Z round removed the third level and with it the `aek-home.subClosed`
 * pref — a stored value is simply ignored now.)
 */
const H_SCROLL_KEY = 'aek-home.sidebarHScroll'
/** The base setting that fades the floating action box in / out (default on). */
const NAV_ACTIONS_FADE_KEY = PREF_KEYS.navActionsFade

/**
 * A pending insertion: the new row order of one drawer plus the row the
 * indicator line is drawn against (`before` for "above this row", `after` for
 * "below the last row").
 */
interface DropMark {
  /** Row order after the move. */
  ids: PanelId[]
  /** Row the insertion line sits above. */
  before?: PanelId | undefined
  /** Row the insertion line sits below (insert at the very end). */
  after?: PanelId | undefined
}

/** Props for {@link Sidebar}. */
export interface SidebarProps {
  /** Currently selected panel. */
  active: PanelId
  /** Select a panel. */
  onSelect: (id: PanelId) => void
  /** Which slot serves this console (C9). */
  currentSlot: 'aek' | 'next' | undefined
  /**
   * Q round: fire a refresh of ONE panel's data. Each nav row carries a small
   * refresh icon (left of the pin) meaning "refresh THAT page"; the target
   * panel re-reads its data when it is activated, or immediately when it is
   * already the active one.
   */
  onRefresh: (id: PanelId) => void
}

/** @param raw - untrusted pref value. @returns a valid logo variant. */
function logoVariantOf(raw: unknown): BrandVariant {
  return raw === 'round' || raw === 'square' || raw === 'text' ? raw : 'mark'
}

/**
 * One drawer group: a collapsible heading plus an UNORDERED list of rows.
 * @param props - label, open state, toggle and rows.
 * @returns the group.
 */
function DrawerGroup({ label, open, onToggle, compact, children }: {
  label: string
  open: boolean
  onToggle: () => void
  compact: boolean
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className={cn(DRAWER_GROUP, compact && DRAWER_GROUP_COMPACT)}>
      {/* `.sidebarCompact .drawerHead { display: none }` — the thin centred
          rule (aek-drawer-group-compact) replaces the caption in the rail. */}
      <button
        type="button"
        className={cn(DRAWER_HEAD, compact && 'hidden')}
        onClick={onToggle}
        aria-expanded={open}
        title={open ? t('nav.collapse') : t('nav.expand')}
      >
        <Icon name="chevronDown" size={14} className={cn(DRAWER_CARET, open && 'rotate-180')} />
        <span className={DRAWER_LABEL}>{label}</span>
      </button>
      {open ? <ul className='flex flex-col gap-(--aek-sidebar-gap) list-none m-0 p-0'>{children}</ul> : null}
    </div>
  )
}

/**
 * Render the navigation rail.
 * @param props - selection only; everything else comes from host settings.
 * @returns the sidebar.
 */
export function Sidebar({ active, onSelect, currentSlot, onRefresh }: SidebarProps) {
  const { t, locale, setLocale } = useI18n()
  const { prefs, set } = useSettings()
  const [collapsed, setCollapsed] = usePref<boolean>(PREF_KEYS.collapsed, false, parseBoolean)
  const [hoverExpand] = usePref<boolean>(PREF_KEYS.hoverExpand, true, parseBoolean)
  const [logoToggle] = usePref<boolean>(PREF_KEYS.logoToggle, true, parseBoolean)
  // BN round (m06297 ④): the footer's base-appearance quick-toggle. It owns the
  // SAME `aek-home.baseTheme` pref the settings page renders (settings-schema
  // group 'general'); Home's useBaseTheme() applies it to <html> on change, so
  // writing the value here re-themes the whole webui live. The button cycles
  // light → dark → auto → light.
  const [baseTheme, setBaseTheme] = usePref<BaseTheme>('aek-home.baseTheme', 'light', parseBaseTheme)
  const NEXT_BASE_THEME: Record<BaseTheme, BaseTheme> = { light: 'dark', dark: 'auto', auto: 'light' }
  /** @returns cycles the base appearance to its next state. */
  const cycleBaseTheme = (): void => { setBaseTheme(current => NEXT_BASE_THEME[current]) }
  // BP round ⑧: the footer tooltip names ONLY what the click triggers —
  // the next state in the cycle, never an enumeration of all options.
  const themeNextKey = baseTheme === 'light'
    ? 'footer.theme.toDark'
    : baseTheme === 'dark'
      ? 'footer.theme.toAuto'
      : 'footer.theme.toLight'
  // W round: the user-dragged rail width (persisted like every other rail
  // setting; the CSS variable only animates the DEFAULT width).
  const [sidebarWidth, setSidebarWidth] = usePref<number>('aek-home.sidebarWidth', SIDEBAR_DEFAULT_WIDTH, parseSidebarWidth)
  // BJ round: the hover-card grace window (基础设置 → 动画); 0 = hide on leave.
  const [animHoverGrace] = usePref<number>('aek-home.animHoverGrace', ROW_ACTIONS_HIDE_GRACE_MS, parseAnimHoverGrace)
  const [resized, setResized] = useState<number | undefined>(undefined)
  const railWidth = resized ?? sidebarWidth

  /** @param event - the pointerdown on the rail's right-edge handle. */
  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = railWidth
    setResized(startWidth)
    const onMove = (move: globalThis.PointerEvent): void => {
      setResized(parseSidebarWidth(startWidth + move.clientX - startX))
    }
    const onUp = (up: globalThis.PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const finalWidth = parseSidebarWidth(startWidth + up.clientX - startX)
      setResized(undefined)
      if (finalWidth !== undefined) setSidebarWidth(finalWidth)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const [query, setQuery] = useState('')
  const [hovered, setHovered] = useState(false)
  const [suppressPeek, setSuppressPeek] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({})
  const [dragId, setDragId] = useState<PanelId | undefined>(undefined)
  /**
   * The dragged id ALSO lives in a ref: pointer events within one frame are
   * handled by closures from the SAME render, so state alone leaves `dragId`
   * stale in `dragover` / `drop` (observed with synthesised events, and a real
   * fast drag can hit the same window).
   */
  const dragIdRef = useRef<PanelId | undefined>(undefined)
  /**
   * The pending insertion, expressed as "the row this line sits above". It is
   * resolved from GEOMETRY on the whole rail (`navRef`), not from per-row
   * `drop` handlers: rows are separated by `--aek-sidebar-gap`, so a pointer
   * released in the 4px gutter — or on a drawer heading, or on the empty tail
   * of a short list — used to land on no row at all and the drag was silently
   * discarded. That is exactly the "拖了但没保存" the user reported.
   */
  const dropAtRef = useRef<DropMark | undefined>(undefined)
  const [dropMark, setDropMark] = useState<DropMark | undefined>(undefined)
  const navRef = useRef<HTMLElement>(null)
  const localeWrap = useRef<HTMLDivElement>(null)
  // BN round (m06297 ③): the row ids whose EXPANDED-rail label is truncated to
  // an ellipsis, tracked live (see the effect below). The hover card shows
  // the option's NAME whenever the rail is compact OR this set has the row —
  // a fully visible label never needs the card to repeat it.
  const [labelTrunc, setLabelTrunc] = useState<Set<string>>(() => new Set())
  /**
   * D round: the hover-peek delays are rAF FRAME counts, not `setTimeout`
   * ms — in long-lived / occluded sessions Chromium's intensive timer
   * throttling clamps timers to ≥1 s (up to 1 min) while rAF keeps ticking
   * in the visible document. 7 frames ≈ 120 ms, 12 frames ≈ 200 ms at
   * 60 fps; when frames pause (occluded) the peek simply waits — which is
   * exactly when nobody is looking anyway.
   */
  const HOVER_ENTER_FRAMES = 7
  const HOVER_LEAVE_FRAMES = 12
  const pendingFrames = useRef<Partial<Record<'enter' | 'leave', number>>>({})
  const cancelFrames = (which: 'enter' | 'leave'): void => {
    const id = pendingFrames.current[which]
    if (id !== undefined) {
      cancelAnimationFrame(id)
      pendingFrames.current[which] = undefined
    }
  }
  const armFrames = (which: 'enter' | 'leave', frames: number, action: () => void): void => {
    cancelFrames(which)
    let count = 0
    let id = 0
    const tick = (): void => {
      pendingFrames.current[which] = undefined
      count++
      if (count >= frames) action()
      else id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    pendingFrames.current[which] = id
  }

  const defaultOpen = prefs[DRAWER_KEY] !== false
  const pinned = useMemo(() => (typeof prefs[PINNED_KEY] === 'string'
    ? prefs[PINNED_KEY].split(',').filter(Boolean)
    : []), [prefs])
  /**
   * The complete row order. Stored ids that still exist come first in the
   * user's sequence; anything added since the order was saved is appended in
   * the default order, so a new panel never disappears.
   */
  const orderIds = useMemo<PanelId[]>(() => {
    const stored = typeof prefs[ORDER_KEY] === 'string' ? prefs[ORDER_KEY].split(',').filter(Boolean) : []
    const all = NAV.map(entry => entry.id)
    const ordered = stored.filter((id): id is PanelId => (all as string[]).includes(id))
    for (const id of all) if (!ordered.includes(id)) ordered.push(id)
    return ordered
  }, [prefs])
  /** @param id - panel. @returns its position in the manual order. */
  const rankOf = (id: PanelId): number => orderIds.indexOf(id)
  /** Sort helper: applies the manual order to any row slice. */
  const byOrder = (a: NavEntry, b: NavEntry): number => rankOf(a.id) - rankOf(b.id)
  /**
   * Z round: the per-plugin last-visited route memory (shared model,
   * `nav-model`). A family-row click in THIS rail re-opens the remembered
   * route; the plugin's own side rail records visits.
   */
  const { lastSub } = useLastSubMemory()
  /**
   * H round: whether the host settings map has landed. The row order is a
   * persisted setting that arrives AFTER the first paint — until then the
   * rail must stay on the DEFAULT order without showing it, so a saved
   * custom order never "teleports" into place mid-load (visibility keeps
   * the rail's size stable; the main column never shifts).
   */
  const prefLanded = usePrefLanded()
  /**
   * A round: the per-family plugin route rail states (comma lists, shared
   * keys in `nav-model.ts`). BJ round: a single click on the family row
   * TOGGLES the rail show/hide from ANY page (the D-round on-family gate is
   * retired — "click a row to collapse the rail" is the user's expectation).
   * BI round: the old double-click "collapse labels" shortcut is retired
   * (it now lives in the row's hover action box as a dedicated icon).
   */
  const [railHidden, setRailHidden] = usePref<string>(RAIL_HIDDEN_KEY, '', parseCommaList)
  const [railLabelsHidden, setRailLabelsHidden] = usePref<string>(RAIL_LABELS_HIDDEN_KEY, '', parseCommaList)

  /**
   * One click on a row. BO round (m07690 item 1): the plugin rail toggles
   * ONLY when the clicked family row is the row that is lit right now —
   * "the sidebar's own selected item" hiding / showing the sub-rail.
   * Clicking a DIFFERENT family row just navigates (its remembered route),
   * never toggling the rail, so "A → B" clicks no longer collapse B's rail.
   * BO round 2026-11-23 (m00001 ②): the BK-round 400 ms rolling window is
   * RETIRED — it kept rapid successive clicks from re-toggling the rail, but
   * the user wants fast clicks to flip show / hide freely, so every lit-row
   * click now toggles immediately. Plain rows select immediately.
   * The label collapse is the dedicated icon in the hover box (BI round).
   * @param entry - the row clicked.
   * @param subIds - the row's plugin routes (empty = plain row).
   * @param active - the panel currently lit (this sidebar's `active` prop).
   */
  const handleRowClick = (entry: NavEntry, subIds: readonly string[], active: PanelId): void => {
    if (subIds.length === 0) {
      onSelect(entry.id)
      return
    }
    const remembered = lastSub.get(entry.id)
    onSelect(remembered ?? entry.id)
    const rowActive = active === entry.id || subIds.includes(active)
    if (!rowActive) return
    setRailHidden(current => toggleInCommaList(current, entry.id))
  }
  /** X round: the base setting that restores the bottom horizontal scrollbar (default off). */
  const hScroll = prefs[H_SCROLL_KEY] === true
  /** Y round: fade the floating refresh/pin box in and out (default on; off = instant). */
  const navActionsFade = prefs[NAV_ACTIONS_FADE_KEY] !== false
  const logoVisible = prefs['aek-home.logoVisible'] !== false
  const brandText = typeof prefs['aek-home.brandText'] === 'string' ? prefs['aek-home.brandText'] : 'AEK'
  const logoVariant = logoVariantOf(prefs['aek-home.logoVariant'])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent): void => {
      if (!localeWrap.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () =>{  document.removeEventListener('pointerdown', close) }
  }, [menuOpen])

  useEffect(() => () => {
    cancelFrames('enter')
    cancelFrames('leave')
  }, [])

  /** Pointer entered the rail: start the (delayed) peek unless suppressed. */
  const handlePointerEnter = (): void => {
    cancelFrames('leave')
    // Dragging a row must never expand / collapse the rail under the pointer.
    if (dragId !== undefined) return
    if (suppressPeek || pendingFrames.current.enter !== undefined) return
    armFrames('enter', HOVER_ENTER_FRAMES, () =>{  setHovered(true) })
  }

  /** Pointer left the rail: end the peek, re-arm hover for the next visit. */
  const handlePointerLeave = (): void => {
    cancelFrames('enter')
    cancelFrames('leave')
    setSuppressPeek(false)
    armFrames('leave', HOVER_LEAVE_FRAMES, () =>{  setHovered(false) })
  }

  /** Logo click changes the LOCK, but only when the toggle is enabled. */
  const handleToggle = (): void => {
    if (!logoToggle) return
    if (collapsed) {
      setSuppressPeek(false)
    } else {
      setSuppressPeek(true)
      setHovered(false)
      cancelFrames('enter')
    }
    setCollapsed(value => !value)
  }

  const peek = hoverExpand && hovered && !suppressPeek
  const compact = collapsed && !peek
  const brandLabel = !logoToggle ? brandText : (compact ? t('brand.expand') : (collapsed ? t('brand.pinOpen') : t('brand.collapse')))

  /**
   * BN round (m06297 ③): track which rows' labels are ellipsized so the hover
   * card knows when to show the option's NAME. Measured live — a fresh
   * ResizeObserver on the rail re-measures every row's label
   * (`scrollWidth > clientWidth`) on rail resizes / group folds; the dep
   * list re-binds it whenever the visible row set, width, locale or compact
   * state changes (search, pin, i18n, stow). Compact rows are never measured
   * (their labels are `max-w-0`), the call site ORs in `compact` itself.
   */
  useEffect(() => {
    const nav = navRef.current
    if (nav === null) return
    const measure = (): void => {
      const next = new Set<string>()
      for (const el of Array.from(nav.querySelectorAll<HTMLElement>('li[data-panel] .aek-label-fade'))) {
        if (el.clientWidth <= 0) continue
        if (el.scrollWidth - el.clientWidth <= 1) continue
        const row = el.closest('li[data-panel]') as HTMLElement | null
        const id = row?.dataset.panel
        if (id !== undefined) next.add(id)
      }
      setLabelTrunc(prev => (
        prev.size === next.size && [...prev].every(pid => next.has(pid)) ? prev : next
      ))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    return () => { ro.disconnect() }
  }, [compact, railWidth, locale, query, prefLanded, orderIds, pinned])

  const needle = query.trim().toLowerCase()
  // Z round: the search box surfaces top-level rows only — a plugin's own
  // routes are found in the plugin's side rail, not in the main nav.
  const filtered = needle.length === 0
    ? NAV_TOP
    : NAV_TOP.filter((entry) => {
      const haystack = [t(entry.labelKey), entry.id, ...entry.keywords].join(' ').toLowerCase()
      return haystack.includes(needle)
    })

  /** @param id - panel to pin/unpin. */
  const togglePin = (id: PanelId): void => {
    const next = pinned.includes(id) ? pinned.filter(item => item !== id) : [...pinned, id]
    set(PINNED_KEY, next.join(','))
  }

  /** @param group - drawer id. @returns whether it is expanded. */
  const isOpen = (group: string): boolean => manualOpen[group] ?? defaultOpen

  /** @param group - drawer id. */
  const toggleGroup = (group: string): void => {
    setManualOpen(current => ({ ...current, [group]: !isOpen(group) }))
  }

  /** @param id - the row being dragged. */
  const handleDragStart = (event: ReactDragEvent<HTMLLIElement>, id: PanelId): void => {
    dragIdRef.current = id
    setDragId(id)
    setDropMark(undefined)
    event.dataTransfer.effectAllowed = 'move'
    // Some Chromium builds refuse to start a drag without payload data.
    event.dataTransfer.setData('text/plain', id)
  }

  /**
   * Resolve the drop into the row order of the DRAGGED row's own drawer.
   *
   * The rail is grouped (pinned / plugins / other) and each group renders its
   * rows sorted by the global order, so an insertion is only meaningful inside
   * one group. Cross-group drops are clamped to that group's first/last slot
   * instead of being thrown away — the user dragged, so something must move.
   *
   * @param clientY - pointer height in viewport coordinates.
   * @param movingId - the row being dragged.
   * @returns the resulting group order plus the row the indicator belongs to.
   */
  const resolveDrop = (clientY: number, movingId: PanelId): DropMark | undefined => {
    const nav = navRef.current
    if (nav === null) return undefined
    // E round: match rows by the STABLE `data-panel` attribute only. The old
    // selector also demanded the `.navRow` class name — a CSS-MODULES source
    // class that ships HASHED (e.g. `_5ZXMiG_navRow`), so the query matched
    // nothing, resolveDrop bailed, and no drop ever committed an order
    // ("按住拖动有反应，但顺序没实现").
    const source = [...nav.querySelectorAll<HTMLLIElement>('li[data-panel]')]
      .find(item => item.dataset.panel === movingId)
    const list = source?.parentElement
    if (list === null || list === undefined) return undefined
    const rows = [...list.children] as HTMLLIElement[]
    if (rows.length === 0) return undefined
    const order = rows.map(row => row.dataset.panel as PanelId)
    // Index of the row whose upper half holds the pointer; `rows.length` means
    // "below every row", which is a valid drop too.
    let index = rows.length
    for (const [at, row] of rows.entries()) {
      const rect = row.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) { index = at; break }
    }
    const removedBefore = order.indexOf(movingId) < index ? 1 : 0
    const next = order.filter(id => id !== movingId)
    const at = Math.max(0, Math.min(next.length, index - removedBefore))
    next.splice(at, 0, movingId)
    const before = at < next.length ? next[at] : undefined
    const after = at >= next.length ? next[next.length - 1] : undefined
    return { ids: next, before, after }
  }

  /**
   * Track the pointer across the WHOLE rail. Listening on the rail (instead of
   * on every row) is what makes the gutters, the drawer headings and the empty
   * space under a short list valid drop targets.
   * @param event - the drag event.
   */
  const handleRailDragOver = (event: ReactDragEvent<HTMLElement>): void => {
    const moving = dragIdRef.current
    if (moving === undefined) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const resolved = resolveDrop(event.clientY, moving)
    if (resolved === undefined) return
    dropAtRef.current = resolved
    setDropMark(current => (current?.before === resolved.before && current?.after === resolved.after
      ? current
      : resolved))
  }

  /**
   * Commit the pending move. The group order is written back into the GLOBAL
   * order by slot, so rows of the other drawer keep their positions and a row
   * also keeps its slot when it is later pinned / unpinned.
   * @param event - the drop event.
   */
  const handleRailDrop = (event: ReactDragEvent<HTMLElement>): void => {
    event.preventDefault()
    const moving = dragIdRef.current
    const resolved = dropAtRef.current ?? (moving === undefined ? undefined : resolveDrop(event.clientY, moving))
    dragIdRef.current = undefined
    dropAtRef.current = undefined
    setDragId(undefined)
    setDropMark(undefined)
    if (moving === undefined || resolved === undefined) return
    const next = [...orderIds]
    const slots = orderIds
      .map((id, at) => (resolved.ids.includes(id) ? at : -1))
      .filter(at => at >= 0)
    for (const [offset, slot] of slots.entries()) {
      // The index can run past the end at runtime; keep the guard meaningful
      // for both type systems (the array type omits `undefined`).
      const id = resolved.ids[offset] as PanelId | undefined
      if (id !== undefined) next[slot] = id
    }
    if (next.join(',') === orderIds.join(',')) return
    set(ORDER_KEY, next.join(','))
  }

  /** @param entry - one row. @param pinnedNow - whether it is pinned. @returns the row. */
  const renderRow = (entry: NavEntry, pinnedNow: boolean): ReactNode => {
    // Z round: the rail is at most two levels. A row that owns plugin routes
    // is a FOLDER — it lights up for the whole family (itself OR any of its
    // routes), while plain rows keep the usual self-highlight.
    const subIds = subEntriesOf(entry.id).map(item => item.id)
    const rowActive = active === entry.id || subIds.includes(active)
    const railNowHidden = railHidden.split(',').includes(entry.id)
    return (
      <li
        key={entry.id}
        data-panel={entry.id}
        className={cn(
          NAV_ROW,
          dragId === entry.id && 'opacity-45',
          dropMark?.before === entry.id && dragId !== undefined && NAV_ROW_DROP_BEFORE,
          dropMark?.after === entry.id && dragId !== undefined && NAV_ROW_DROP_AFTER,
        )}
        draggable
        onDragStart={(event) =>{  handleDragStart(event, entry.id) }}
        onDragEnd={() => { dragIdRef.current = undefined; dropAtRef.current = undefined; setDragId(undefined); setDropMark(undefined) }}
      >
        {/* Z round: family rows light up for the whole family; the plugin's
            own routes live in its side rail (PluginSubNav), not in this one.
            A round: a FAMILY row's click is single / double-click sensitive
            (single = select the remembered route + toggle the plugin's route
            rail; double = toggle that rail's labels); plain rows select. */}
        <button
          type="button"
          className={cn(
            RAIL_ITEM,
            compact ? RAIL_ITEM_GEOM_COMPACT : RAIL_ITEM_GEOM_EXPANDED,
            rowActive && RAIL_ITEM_ACTIVE,
            'grow shrink min-w-0',
          )}
          aria-current={rowActive ? 'page' : undefined}
          onClick={() => { handleRowClick(entry, subIds, active) }}
          title={`${t(entry.labelKey)} · ${t('nav.dragHint')}`}
        >
          <span className='inline-flex shrink-0 items-center justify-center opacity-90'><Icon name={entry.icon} size={18} /></span>
          <span className={cn(LABEL_FADE, 'flex-1 min-w-0 max-w-50 text-ellipsis', compact && cn(LABEL_FADE_HIDDEN, 'max-w-0 p-0'))}>{t(entry.labelKey)}</span>
        </button>
        {/* Y round: the refresh + pin actions no longer sit at the row's
            tail (the user: "别放到外面") — they live in ONE floating card
            that fades in on row hover (the base setting `navActionsFade`
            switches the fade on / off). Keyboard focus reveals it too.
            BN round (m06297 ③): when the rail is compact, OR this row's label
            is ellipsized, the card ALSO carries the option's name at its right
            edge — the row itself cannot read its own label there. The card is
            no longer `hidden` in compact mode for the same reason. */}
        <RowActionsFloat
          graceMs={animHoverGrace}
          rowId={entry.id}
          name={compact || labelTrunc.has(entry.id) ? t(entry.labelKey) : undefined}
        >
          {/* Q round: the refresh icon refreshes the page THIS row opens —
              even when that page is not active yet. */}
          <button
            type="button"
            className={cn(ROW_ICON_BUTTON, 'hover:rotate-90')}
            onClick={() =>{  onRefresh(entry.id) }}
            title={t('nav.refresh')}
            aria-label={t('nav.refresh')}
          >
            <Icon name="refresh" size={13} />
          </button>
          <button
            type="button"
            className={cn(ROW_ICON_BUTTON, pinnedNow && 'text-primary')}
            onClick={() =>{  togglePin(entry.id) }}
            title={pinnedNow ? t('nav.unpin') : t('nav.pin')}
            aria-label={pinnedNow ? t('nav.unpin') : t('nav.pin')}
          >
            <Icon name="pin" size={13} />
          </button>
          {/* BI round: a dedicated icon replaces the retired double-click —
              collapse / restore this family's plugin-rail labels. Family
              rows only (plain rows own no plugin routes). */}
          {subIds.length > 0 && (
            <button
              type="button"
              className={cn(ROW_ICON_BUTTON, !railLabelsHidden.split(',').includes(entry.id) && 'text-primary')}
              onClick={() =>{  setRailLabelsHidden(current => toggleInCommaList(current, entry.id)) }}
              title={t('nav.labelsToggle')}
              aria-label={t('nav.labelsToggle')}
            >
              <Icon name="type" size={13} />
            </button>
          )}
          {/* BQ6 round: the columns icon is ALWAYS present on family rows.
              Plain ROW_ICON_BUTTON styling (no accent): it expands the stowed
              sub-rail or collapses the visible one (same toggle as a click on
              the lit row); the tooltip names the action. */}
          {subIds.length > 0 && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={ROW_ICON_BUTTON}
                    onClick={() =>{  setRailHidden(current => toggleInCommaList(current, entry.id)) }}
                    aria-label={railNowHidden ? t('nav.railExpand') : t('nav.railCollapse')}
                  >
                    <Icon name="columns" size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{railNowHidden ? t('nav.railExpand') : t('nav.railCollapse')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </RowActionsFloat>
      </li>
    )
  }

  const pinnedRows = filtered
    .filter(entry => pinned.includes(entry.id) && entry.subOf === undefined)
    .sort(byOrder)
  const pluginRows = filtered.filter(entry => entry.group === 'plugins' && entry.subOf === undefined && !pinned.includes(entry.id)).sort(byOrder)
  const otherRows = filtered.filter(entry => entry.group === 'other' && !pinned.includes(entry.id)).sort(byOrder)

  /** @param next - locale chosen in the footer menu. */
  const chooseLocale = (next: Locale): void => {
    setLocale(next)
    setMenuOpen(false)
  }

  return (
    <aside
      className={cn(
        /* 2026-11-19: the rail's show/stow fold is the SAME functional layout
           motion as the plugin rail's — `.aek-rail-fold` owns the width /
           flex-basis / padding glide AND its reduced-motion exemption (the
           global crush below it in index.css would otherwise snap the first-
           level rail closed under the system "reduce motion" setting while
           the second-level rail still glides). */
        'aek-rail-fold sticky top-(--aek-titlebar-h) flex flex-col h-(--aek-viewport-h) basis-(--aek-sidebar-width) w-(--aek-sidebar-width) bg-card border-r border-border overflow-hidden z-2 text-(length:--aek-sidebar-font-size) tracking-(--aek-sidebar-letter-spacing)',
        compact
          ? 'basis-(--aek-sidebar-compact) w-(--aek-sidebar-compact) px-0'
          : cn('px-(--aek-sidebar-pad-x)', 'max-[640px]:basis-(--aek-sidebar-compact) max-[640px]:w-(--aek-sidebar-compact)'),
        resized !== undefined && 'aek-no-transition',
        !navActionsFade && 'aek-nav-no-fade',
      )}
      style={compact ? undefined : ({ '--aek-sidebar-width': `${String(railWidth)}px` } as CSSProperties)}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
    >
      <div className={cn(
        /* `aek-sidebar-header`: stable class so the reduced-motion exemption
           in index.css can re-glide the header padding with the fold. */
        'aek-sidebar-header flex items-center justify-between gap-2 h-18 min-h-18 py-(--aek-sidebar-pad-y) border-b border-border transition-[padding] duration-(--aek-sidebar-duration) ease-aek-out',
        compact ? 'aek-sidebar-header-compact' : 'px-4',
        'max-[640px]:flex-col max-[640px]:justify-center max-[640px]:gap-1 max-[640px]:h-22 max-[640px]:min-h-22 max-[640px]:p-0',
      )}>
        <button
          type="button"
          className={cn(
            'aek-brand-button flex items-center min-w-0 p-0 text-inherit bg-transparent border-0 cursor-pointer transition-[gap] duration-(--aek-sidebar-duration) ease-aek-out focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 focus-visible:rounded-sm',
            compact ? 'gap-0' : 'gap-3',
          )}
          onClick={handleToggle}
          aria-label={brandLabel}
          aria-expanded={logoToggle ? !compact : undefined}
          title={brandLabel}
          tabIndex={logoToggle ? 0 : -1}
        >
          {logoVisible
            ? (
              /* BQ round (m10857 item 2): the next slot carries the original
                 logo with a small "next" label at its BOTTOM-RIGHT corner.
                 BW round (m13557②): label → "Next" (capitalized) wrapped in
                 a rounded-rect chip so it reads as a badge, not stray text. */
              <span className='relative shrink-0 basis-8.5 w-8.5 h-8.5'>
                <BrandMark size={34} className='aek-brand-mark w-8.5 h-8.5 block' variant={logoVariant} />
                {currentSlot === 'next'
                  ? <span className='absolute -bottom-1 -right-1.5 rounded-sm border border-border bg-card px-1 py-px text-5xs font-semibold text-text-muted leading-none select-none'>Next</span>
                  : null}
              </span>
            )
            : null}
          {brandText.length > 0
            ? (
              <span className={cn(LABEL_FADE, 'flex flex-col min-w-0 max-w-45 whitespace-nowrap', compact && cn(LABEL_FADE_HIDDEN, 'max-w-0 p-0'), 'max-[640px]:hidden')}>
                <span className='text-2xs tracking-aek-tagline text-text-muted'>
                  {brandText}
                </span>
              </span>
            )
            : null}
        </button>
      </div>

      <nav
        className={cn(
          'aek-sidebar-body flex-1 overflow-auto transition-[padding] duration-(--aek-sidebar-duration) ease-aek-out',
          compact ? 'py-4 px-2' : 'py-4 px-3',
          hScroll && 'aek-sidebar-body-hscroll',
          'max-[640px]:py-4 max-[640px]:px-2',
        )}
        aria-label={t('nav.searchAria')}
        ref={navRef}
        onDragOver={handleRailDragOver}
        onDrop={handleRailDrop}
      >
        <div className={cn(
          NAV_SEARCH_WRAP,
          compact && 'justify-center gap-0 p-0',
          compact && 'focus-within:justify-start focus-within:px-2',
        )}>
          <span className={NAV_SEARCH_ICON}><Icon name="search" size={16} /></span>
          <input
            className={cn(
              NAV_SEARCH_INPUT,
              'flex-1 max-w-50',
              compact && cn(
                'grow-0 shrink basis-0 w-0 p-0 border-0 opacity-0 pointer-events-none max-w-0',
                'focus-within:grow focus-within:shrink focus-within:w-auto focus-within:opacity-100',
              ),
            )}
            type="text"
            value={query}
            aria-label={t('nav.searchAria')}
            onChange={(event) =>{  setQuery(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
              if (event.key === 'Enter' && filtered.length > 0) {
                onSelect(filtered[0].id)
                setQuery('')
              }
            }}
          />
        </div>

        {/* H round: rows are invisible until the persisted order lands —
            see `prefLanded`. The search box and the rail's own box stay
            visible so nothing shifts. */}
        <div style={{ visibility: prefLanded ? 'visible' : 'hidden' }}>
          {pinnedRows.length > 0
            ? (
              <DrawerGroup label={t('nav.group.pinned')} open={isOpen('pinned')} onToggle={() =>{  toggleGroup('pinned') }} compact={compact}>
                {pinnedRows.map(entry => renderRow(entry, true))}
              </DrawerGroup>
            )
            : null}

          <DrawerGroup label={t('nav.group.plugins')} open={isOpen('plugins')} onToggle={() =>{  toggleGroup('plugins') }} compact={compact}>
            {pluginRows.map(entry => renderRow(entry, false))}
          </DrawerGroup>

          <DrawerGroup label={t('nav.group.other')} open={isOpen('other')} onToggle={() =>{  toggleGroup('other') }} compact={compact}>
            {otherRows.map(entry => renderRow(entry, false))}
          </DrawerGroup>

          {filtered.length === 0
            ? <div className={cn(NAV_NO_MATCH, compact && 'basis-0 w-0 max-w-0 p-0 overflow-hidden opacity-0 pointer-events-none')}>{t('nav.noMatch')}</div>
            : null}
        </div>
      </nav>

      <div className={cn(
        compact ? 'py-4 px-0 border-t border-border flex justify-center' : 'p-4 border-t border-border',
        'max-[640px]:py-4 max-[640px]:px-0 max-[640px]:flex max-[640px]:justify-center',
      )}>
        <div className={compact ? 'flex flex-col justify-center items-center gap-2 w-full' : 'flex items-center justify-between gap-2'}>
          <div className='relative' ref={localeWrap}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(FOOTER_ICON_BUTTON, compact && 'mx-auto')}
                  onClick={() =>{  setMenuOpen(value => !value) }}
                  aria-label={t('footer.language')}
                  aria-expanded={menuOpen}
                >
                  <Icon name="language" size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('footer.language')}</TooltipContent>
            </Tooltip>
            {menuOpen
              ? (
                <ul className='fixed left-4 bottom-18 min-w-42 p-1.5 bg-card border border-border rounded-md shadow-lg z-20 list-none m-0' role="menu">
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className={cn(LOCALE_MENU_ITEM, locale === 'zh-CN' && LOCALE_MENU_ACTIVE)}
                      onClick={() =>{  chooseLocale('zh-CN') }}
                    >
                      简体中文
                      {locale === 'zh-CN' ? <Icon name="check" size={14} /> : null}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className={cn(LOCALE_MENU_ITEM, locale === 'en-US' && LOCALE_MENU_ACTIVE)}
                      onClick={() =>{  chooseLocale('en-US') }}
                    >
                      English
                      {locale === 'en-US' ? <Icon name="check" size={14} /> : null}
                    </button>
                  </li>
                </ul>
              )
              : null}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(FOOTER_ICON_BUTTON, compact && 'mx-auto')}
                onClick={cycleBaseTheme}
                aria-label={t(themeNextKey)}
              >
                <Icon name={baseTheme === 'light' ? 'sun' : baseTheme === 'dark' ? 'moon' : 'contrast'} size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t(themeNextKey)}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                className={cn(FOOTER_ICON_BUTTON, compact && 'mx-auto')}
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t('footer.github')}
              >
                <Icon name="star" size={18} />
              </a>
            </TooltipTrigger>
            <TooltipContent>{t('footer.github')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* W round: drag the rail's right edge to resize; double-click resets.
          Only while expanded — the compact rail is fixed to its icon width. */}
      {!compact
        ? (
          <div
            className={cn('absolute top-0 right-0 w-1.25 h-full cursor-col-resize z-3 touch-none', resized !== undefined && 'bg-accent-border')}
            role="separator"
            aria-orientation="vertical"
            title={t('nav.resizeHint')}
            onPointerDown={startResize}
            onDoubleClick={() => { setResized(undefined); setSidebarWidth(SIDEBAR_DEFAULT_WIDTH) }}
          />
        )
        : null}
    </aside>
  )
}
