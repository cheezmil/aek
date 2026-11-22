/**
 * The per-plugin route rail (Z round).
 *
 * The main nav rail is at most two levels: group → plugin row. A plugin's
 * INTERNAL routes (its settings page, …) are the plugin's own business — each
 * plugin that owns routes gets its own left side rail, rendered inside the
 * panel area next to the plugin's content (`Home.tsx` composes it).
 *
 * The rail lists the family's routes: the synthetic "{name}首页" board first
 * (the plugin's main surface, panel id = the family itself), then every real
 * `subOf` entry. It is data-driven off `nav-model.ts` — a plugin gains a rail
 * the moment it declares a `subOf` entry; families without routes render
 * nothing (zero layout cost).
 *
 * Visiting a route records the per-plugin `lastSub` memory, so clicking the
 * plugin's row in the MAIN rail re-opens the route the user was last on.
 *
 * A round additions (all host-persisted, never localStorage):
 * - the rail's RIGHT EDGE drags its width (`aek-home.pluginRailWidth`, the
 *   settings-schema row writes the CSS variable into the layout);
 * - `labelsHidden` (from the main rail's DOUBLE click on the family row)
 *   collapses the route labels to icons only;
 * - a small operation HINT at the bottom of the rail teaches the single /
 *   double-click semantics; ONE boolean (`aek-home.railHint`, the
 *   settings-schema row) owns it: the inline × switches it off, the
 *   Settings row switches it back on (no second "dismissed" state, so a
 *   reload can never lose the transition).
 *
 * 2026-11-18 flicker fix: the per-family HIDDEN state (tucked away by
 * single-clicking the family row) no longer unmounts the rail — `Home`
 * keeps it mounted and passes `hidden`, which collapses the column to a
 * zero width with the same transition timing as the main rail. Switching
 * into a tucked-away page therefore animates the fold instead of
 * jumping the whole content area one frame; expanding back animates too.
 *
 * @module @cheezmil/aek-web/src/PluginSubNav
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from './Icons.tsx'
import { RAIL_SEARCH_ICON, RAIL_SEARCH_INPUT, RAIL_SEARCH_WRAP } from './rail-searchbox.ts'
import type { IconName } from './Icons.tsx'
import { FAMILY_HOME_ICON } from './icon-registry.ts'
import { useI18n } from './i18n.tsx'
import { useRailExtras } from './rail-extras.ts'
import type { RailExtraRow } from './rail-extras.ts'
import {
  NAV,
  RAIL_COMPACT_WIDTH_KEY,
  RAIL_HINT_KEY,
  RAIL_WIDTH_KEY,
  panelFamilyOf,
  subEntriesOf,
  useLastSubMemory,
} from './nav-model.ts'
import type { PanelId } from './nav-model.ts'
import { parseBoolean, usePref } from './preferences.tsx'
import { ROW_ACTIONS_HIDE_GRACE_MS, RowActionsFloat } from './RowActionsFloat.tsx'
import { cn } from '@/lib/utils'

/** One route row of the plugin rail. */
interface RouteRow {
  /** Panel to activate. */
  id: PanelId
  /** Icon drawn before the label. */
  icon: IconName
  /** Translated visible label. */
  label: string
}

/** Props for {@link PluginSubNav}. */
export interface PluginSubNavProps {
  /** Currently active panel. */
  active: PanelId
  /** Select a route (panel) of the owning family. */
  onSelect: (id: PanelId) => void
  /**
   * A round: labels of THIS family's rows are hidden (icon-only mode, set by
   * the main rail's double click on the family row).
   */
  labelsHidden?: boolean
  /**
   * 2026-11-18 flicker fix: this family's rail is in the hidden state (single
   * click on the family row). The rail element STAYS MOUNTED and animates to
   * a zero-width column instead of unmounting: a panel switch into a
   * tucked-away rail must read as a smooth fold, not a one-frame reflow
   * ("突然闪一下收纳起来"). The per-family hidden state itself is unchanged —
   * only the rendering of it.
   */
  hidden?: boolean
  /**
   * BJ round: the host's refresh handler (the row hover action box's refresh
   * button). Absent = no action box on this rail's rows.
   */
  onRefresh?: (id: PanelId) => void
}

/** A round: the width a drag of the rail's right edge may reach (px). */
const RAIL_MIN_WIDTH = 140
const RAIL_MAX_WIDTH = 360
/**
 * A round: the COMPACT width bounds used while the labels are hidden
 * (icon-only mode) — hiding the text must NOT keep the wide column. The
 * value itself is user-tunable in Settings (`aek-home.pluginRailCompactWidth`);
 * the user-set width (drag / settings) applies as soon as the labels show.
 */
const RAIL_COMPACT_DEFAULT = 64
const RAIL_COMPACT_MIN = 48
const RAIL_COMPACT_MAX = 96
/** BR round: the row hover action card is a viewport-fixed float anchored to
 *  the row's right edge (+ 8px) by <RowActionsFloat> (never covers the option,
 *  never clipped by the rail's `overflow-hidden`). The fade timing lives in
 *  the `.aek-row-actions` rules in index.css. */
const RAIL_ROW_ICON_BUTTON = 'inline-flex items-center justify-center size-6 p-0 border-0 rounded-xs bg-transparent text-text-muted cursor-pointer transition-[color,background-color,transform] duration-140 ease-aek hover:text-primary hover:bg-accent-soft'

/** @param raw - the parsed compact width. @returns a clamped number, or undefined. */
function parseRailCompactWidth(raw: unknown): number | undefined {
  const value = Number(raw)
  if (!Number.isFinite(value)) return undefined
  return Math.min(RAIL_COMPACT_MAX, Math.max(RAIL_COMPACT_MIN, value))
}

/** @param raw - the parsed width. @returns a clamped number, or undefined. */
function parseRailWidth(raw: unknown): number | undefined {
  const value = Number(raw)
  if (!Number.isFinite(value)) return undefined
  return Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, value))
}

/** BJ round: clamp the hover-card grace-window setting to its schema range (0–1000ms). */
function parseAnimHoverGrace(raw: unknown): number | undefined {
  const value = Number(raw)
  if (!Number.isFinite(value)) return undefined
  return Math.min(1000, Math.max(0, value))
}

/**
 * The plugin-owned route rail next to the plugin's content.
 * @param props - active panel, selection and the label state.
 * @returns the rail, or `null` when the active panel has no family routes.
 */
export function PluginSubNav({ active, onSelect, labelsHidden = false, hidden = false, onRefresh }: PluginSubNavProps) {
  const { t, tf } = useI18n()
  const { record } = useLastSubMemory()
  // `panelFamilyOf` returns the owning family as a plain string; every family
  // it names is a NAV root, i.e. a valid PanelId.
  const family = panelFamilyOf(active) as PanelId | undefined
  if (family === undefined) return null
  const parent = NAV.find(entry => entry.id === family)
  if (parent === undefined) return null
  const routes: RouteRow[] = [
    { id: family, icon: FAMILY_HOME_ICON, label: tf('nav.home', { name: t(parent.labelKey) }) },
    ...subEntriesOf(family).map(sub => ({ id: sub.id, icon: sub.icon, label: t(sub.labelKey) })),
  ]

  // A round: the dragged width. The pref (settings-schema row
  // `aek-home.pluginRailWidth`) feeds the CSS variable that owns the layout;
  // while dragging, a local state keeps the rail under the pointer and the
  // pref is written once, on release.
  const [railWidth, setRailWidth] = usePref<number>(RAIL_WIDTH_KEY, 200, parseRailWidth)
  // A round addendum: the compact (labels-hidden) width is a Settings value,
  // not a constant — the user gets a granular row for the mini rail column.
  const [railCompactWidth] = usePref<number>(RAIL_COMPACT_WIDTH_KEY, RAIL_COMPACT_DEFAULT, parseRailCompactWidth)
  // BJ round (m04565): the hover-card grace-window setting (基础设置 → 动画);
  // feeds the two row-action cards below as a prop.
  const [animHoverGrace] = usePref<number>('aek-home.animHoverGrace', ROW_ACTIONS_HIDE_GRACE_MS, parseAnimHoverGrace)
  const [resized, setResized] = useState<number | undefined>(undefined)
  // BN round (m06297 ③): which of this rail's labels are ellipsized, tracked
  // live — the hover card shows the option's name when the labels are hidden
  // (compact icon column) OR the row's label is truncated (see the cards'
  // `name` prop below).
  const [labelTrunc, setLabelTrunc] = useState<Set<string>>(() => new Set())
  const subNavRef = useRef<HTMLElement>(null)
  // BH round Plan C: the plugin-filled extras sections (Preset / 全局工作区
  // agent sub-list) collapse independently; the set holds the CLOSED keys.
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set())
  const extras = useRailExtras(family)
  // BJ round: while an extras row is active AND names a host panel to
  // suppress (`suppressActive`), that host panel's flat row loses its active
  // highlight — the drill-through owns the highlight, one row at a time.
  const suppressed = new Set(
    extras
      .flatMap(section => section.rows)
      .filter(row => row.active && row.suppressActive !== undefined)
      .map(row => row.suppressActive as string),
  )
  /** @param id - the route id. @returns whether the flat row shows active. */
  const isRouteActive = (id: PanelId): boolean => active === id && !suppressed.has(id)
  /** @param key - the section key. @returns whether the section is open. */
  const isSectionOpen = (key: string): boolean => !collapsedSections.has(key)
  /** @param key - the section key. Toggle its open state. */
  const toggleSection = (key: string): void => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }
  // A round: hidden labels → the rail compacts to the icon column; the
  // dragged width pref is untouched and comes back when the labels return.
  // 2026-11-18 flicker fix: the HIDDEN state (family rail tucked away) is
  // rendered as a ZERO-WIDTH column, not an unmount — the fold / unfold is
  // the width transition below, so a panel switch into a tucked-away rail
  // reads as a smooth collapse instead of a one-frame layout jump.
  const width = hidden ? 0 : (labelsHidden ? railCompactWidth : (resized ?? railWidth))
  /** @param event - the pointerdown on the rail's right-edge handle. */
  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    setResized(startWidth)
    const onMove = (move: globalThis.PointerEvent): void => {
      setResized(parseRailWidth(startWidth + move.clientX - startX))
    }
    const onUp = (up: globalThis.PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const finalWidth = parseRailWidth(startWidth + up.clientX - startX)
      setResized(undefined)
      if (finalWidth !== undefined) setRailWidth(finalWidth)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // A round: the bottom operation hint. ONE boolean owns it (no cross-state
  // to lose on reload): the × button switches the base setting off; the
  // Settings row switches it back on. `railHint` unset = default true = the
  // hint shows on first use.
  const [railHint, setRailHint] = usePref<boolean>(RAIL_HINT_KEY, true, parseBoolean)
  const hintVisible = railHint
  // BI round: the rail's per-axis scrollbar toggles (both default OFF — the
  // bars stay invisible while the content still scrolls; the CSS classes in
  // index.css bring each bar back, the twin of the main rail's h-scroll row).
  const [railHScroll] = usePref<boolean>('aek-home.pluginRailHScroll', false, parseBoolean)
  const [railVScroll] = usePref<boolean>('aek-home.pluginRailVScroll', false, parseBoolean)
  // BI round: the rail's own search box (a hard requirement — the sub-sections
  // are the quick locator). Resets on every family switch; Enter jumps to
  // the first hit (a route, else an extras row).
  const [query, setQuery] = useState('')
  useEffect(() => { setQuery('') }, [family])
  const needle = query.trim().toLowerCase()
  const visibleRoutes = needle === ''
    ? routes
    : routes.filter(route => route.label.toLowerCase().includes(needle) || route.id.toLowerCase().includes(needle))
  const visibleExtras = needle === ''
    ? extras
    : extras
      .map(section => ({
        ...section,
        rows: section.rows.filter(row => row.label.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle)),
      }))
      .filter(section => section.rows.length > 0)

  /**
   * BN round (m06297 ③): re-measure which of this rail's labels are
   * ellipsized (`scrollWidth > clientWidth` on the `[data-aek-trunc]`
   * spans). A ResizeObserver on the rail catches width changes (the resizer
   * drag, the labels-hidden compact fold); the dep list re-binds it when the
   * row set or geometry inputs change. Hidden labels (`labelsHidden` /
   * `hidden`) have `clientWidth` 0 and are skipped — the card call sites OR
   * those flags in themselves.
   */
  useEffect(() => {
    const nav = subNavRef.current
    if (nav === null) return
    const measure = (): void => {
      const next = new Set<string>()
      for (const el of Array.from(nav.querySelectorAll<HTMLElement>('[data-aek-trunc]'))) {
        if (el.clientWidth <= 0) continue
        if (el.scrollWidth - el.clientWidth <= 1) continue
        const id = el.dataset.aekTrunc
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
  }, [labelsHidden, hidden, family, query, resized, railWidth])

  return (
    <nav
      ref={subNavRef}
      className={cn(
        'aek-rail-fold sticky top-(--aek-titlebar-h) flex h-(--aek-viewport-h) flex-col grow-0 shrink-0 basis-(--aek-plugin-rail-width) w-(--aek-plugin-rail-width) bg-surface border-r border-border pt-6 px-3 pb-3 overflow-hidden',
        resized !== undefined && 'aek-no-transition',
      )}
      aria-label={t('nav.pluginRoutes')}
      aria-hidden={hidden ? true : undefined}
      // A round: the width is set as a LAYOUT property directly (inline
      // width + flex-basis), not through a custom property: Chromium fails
      // to invalidate the layout of this sticky flex item when only the
      // inline `--aek-plugin-rail-width` value changes mid-session, so the
      // compact/drag transitions would render one step behind until a full
      // reflow. A direct width change invalidates layout normally. The CSS
      // variable stays as the rule-level fallback for the initial render.
      // 2026-11-18 flicker fix: the fold transition is the `.aek-rail-fold`
      // class in index.css (with its reduced-motion exemption — see there).
      // `minWidth: 0` is what lets the column truly collapse: without it the
      // flex item's `min-width: auto` floors the width at the content size
      // (a 25px stub stayed behind the fold). While dragging the rail edge,
      // `aek-no-transition` (!important, later in the stylesheet) keeps the
      // width glued to the pointer.
      style={{
        '--aek-plugin-rail-width': `${String(width)}px`,
        width: `${String(width)}px`,
        flexBasis: `${String(width)}px`,
        minWidth: '0px',
        ...(hidden ? { padding: '0px', borderRightWidth: '0px' } : null),
      } as CSSProperties}
    >
      {/* BI round: the rail's own search box (a hard requirement) — fixed
          ABOVE the scrolling body so it never scrolls away, and rendered
          in every mode, icon-only included. */}
      {/* BS round: identical box to the first-level rail (rail-searchbox.ts). */}
      <div className={cn(RAIL_SEARCH_WRAP, labelsHidden && 'justify-center')}>
        <span className={RAIL_SEARCH_ICON}><Icon name="search" size={16} /></span>
        <input
          type="text"
          className={cn(RAIL_SEARCH_INPUT)}
          value={query}
          aria-label={t('nav.pluginSearch')}
          onChange={(event) => { setQuery(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { setQuery('') }
            if (event.key === 'Enter' && needle !== '') {
              const hit = visibleRoutes.length > 0
                ? { kind: 'route' as const, route: visibleRoutes[0] }
                : visibleExtras.length > 0
                  ? { kind: 'extra' as const, row: visibleExtras[0].rows[0] }
                  : undefined
              if (hit !== undefined) {
                if (hit.kind === 'route') {
                  onSelect(hit.route.id)
                  record(family, hit.route.id)
                } else {
                  hit.row.onClick?.()
                }
                setQuery('')
              }
            }
          }}
        />
      </div>
      {/* The rows fade with the fold (`.aek-rail-fold ul` in index.css);
          the clipping of the zero-width column does the rest. BI round: the
          body scrolls (per-axis bars hidden by default, the
          `.aek-plugin-rail-*scroll` classes in index.css bring each back)
          inside the clipped column — 79 agent rows used to overflow into
          the void because the nav's `overflow-hidden` swallowed both axes. */}
      <div
        className={cn(
          'aek-plugin-rail-body flex min-h-0 flex-1 flex-col gap-3 overflow-auto pt-2',
          railHScroll && 'aek-plugin-rail-hscroll',
          railVScroll && 'aek-plugin-rail-vscroll',
        )}
        style={{ opacity: hidden ? 0 : 1 }}
      >
        <ul
          className="flex flex-col gap-1"
        >
          {visibleRoutes.map((route) => {
            const routeActive = isRouteActive(route.id)
            return (
              <li key={route.id} data-panel={route.id} className="group relative">
                <button
                  type="button"
                  tabIndex={hidden ? -1 : undefined}
                  className={cn(
                    'relative flex h-8.5 w-full items-center gap-2 rounded-sm px-2 text-aek-13 font-medium text-text-secondary bg-transparent border-0 text-left whitespace-nowrap cursor-pointer transition-colors duration-140 ease-aek hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
                    routeActive
                      && 'text-accent-ink bg-accent-soft hover:bg-accent-soft hover:text-accent-ink before:absolute before:content-[""] before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.75 before:rounded-r-aek-bar before:bg-primary',
                    labelsHidden && 'justify-center px-0',
                  )}
                  aria-current={routeActive ? 'page' : undefined}
                  title={route.label}
                  onClick={() => {
                    onSelect(route.id)
                    record(family, route.id)
                  }}
                >
                  <span className={cn('inline-flex flex-none items-center justify-center text-text-muted', routeActive && 'text-accent-ink')}><Icon name={route.icon} size={14} /></span>
                  <span data-aek-trunc={route.id} className={cn('min-w-0 overflow-hidden text-ellipsis', labelsHidden && 'hidden')}>{route.label}</span>
                </button>
                {onRefresh !== undefined ? (
                  <RowActionsFloat
                    graceMs={animHoverGrace}
                    rowId={family + '/' + route.id}
                    name={labelsHidden || labelTrunc.has(route.id) ? route.label : undefined}
                  >
                    <button
                      type="button"
                      className={RAIL_ROW_ICON_BUTTON}
                      title={t('nav.refresh')}
                      aria-label={t('nav.refresh')}
                      onClick={() => { onRefresh(route.id) }}
                    >
                      <Icon name="refresh" size={13} />
                    </button>
                  </RowActionsFloat>
                ) : null}
              </li>
            )
          })}
        </ul>

        {/* BH round Plan C: plugin-filled extras sections (the agent sub-list
            with brand icons, optional Projects group). BI round: icon-only
            mode keeps them (the user's 3rd ruling: hiding the labels must not
            delete the icons) — the rows render centered icon-only, the section
            heads keep their chevron. A live search force-expands the sections. */}
        {extras.length > 0 ? (
          <div className="flex flex-col gap-2">
            {(needle === '' ? extras : visibleExtras).map((section) => {
              const open = needle !== '' || isSectionOpen(section.key)
              return (
                <div key={section.key}>
                  <button
                    type="button"
                    tabIndex={hidden ? -1 : undefined}
                    className={cn('flex w-full items-center gap-1 rounded-sm border-0 bg-transparent p-1 text-aek-11 font-semibold text-text-muted cursor-pointer transition-colors duration-140 ease-aek hover:text-text', labelsHidden && 'justify-center')}
                    aria-expanded={open}
                    onClick={() => { toggleSection(section.key) }}
                  >
                    <Icon name="chevronDown" size={11} className={cn('flex-none transition-transform duration-140', !open && '-rotate-90')} />
                    <span className={cn('min-w-0 overflow-hidden text-ellipsis', labelsHidden && 'hidden')}>{section.title}</span>
                  </button>
                  {open ? (
                    <ul className="mt-0.5 flex flex-col gap-0.5 pl-1">
                      {section.rows.map((row: RailExtraRow) => (
                        <li key={row.id} className="group relative">
                          <button
                            type="button"
                            tabIndex={hidden ? -1 : undefined}
                            className={cn(
                              'relative flex h-8.5 w-full items-center gap-2 rounded-sm px-2 text-aek-13 font-medium text-text-secondary bg-transparent border-0 text-left whitespace-nowrap cursor-pointer transition-colors duration-140 ease-aek hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
                              row.active
                                && 'text-accent-ink bg-accent-soft hover:bg-accent-soft hover:text-accent-ink before:absolute before:content-[""] before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.75 before:rounded-r-aek-bar before:bg-primary',
                              labelsHidden && 'justify-center px-0',
                              row.className,
                            )}
                            aria-current={row.active ? 'page' : undefined}
                            title={row.label}
                            onClick={() => { row.onClick?.() }}
                          >
                            {row.icon !== undefined ? <span className="inline-flex flex-none items-center justify-center text-text-muted">{row.icon}</span> : null}
                            <span data-aek-trunc={row.id} className={cn('min-w-0 flex-1 overflow-hidden text-ellipsis text-left', labelsHidden && 'hidden')}>{row.label}</span>
                            {row.badge !== undefined && row.badge !== null && row.badge > 0 ? <span className={cn('min-w-4.5 flex-none rounded-full bg-surface-hover px-1.5 text-aek-11 tabular-nums text-text-muted', labelsHidden && 'hidden')}>{String(row.badge)}</span> : null}
                          </button>
                          {onRefresh !== undefined ? (
                            <RowActionsFloat
                              graceMs={animHoverGrace}
                              rowId={family + '/' + row.id}
                              name={labelsHidden || labelTrunc.has(row.id) ? row.label : undefined}
                            >
                              <button
                                type="button"
                                className={RAIL_ROW_ICON_BUTTON}
                                title={t('nav.refresh')}
                                aria-label={t('nav.refresh')}
                                onClick={() => { onRefresh(family) }}
                              >
                                <Icon name="refresh" size={13} />
                              </button>
                            </RowActionsFloat>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      {hintVisible
        ? (
          <div
            className={cn(
              'mt-auto flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-hover p-2',
              labelsHidden && 'justify-center',
              hidden && 'opacity-0',
            )}
          >
            {!labelsHidden ? <span className="text-aek-11 leading-normal text-text-muted">{t('nav.railHint.text')}</span> : null}
            <button
              type="button"
              tabIndex={hidden ? -1 : undefined}
              className="inline-flex size-5.5 flex-none items-center justify-center rounded-sm border-0 bg-transparent p-0 text-text-muted cursor-pointer hover:bg-surface hover:text-text"
              title={t('nav.railHint.dismiss')}
              aria-label={t('nav.railHint.dismiss')}
              onClick={() =>{  setRailHint(false) }}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        )
        : null}

      {/* A round: drag the rail's right edge to resize; the width lands in
          the `aek-home.pluginRailWidth` pref (and its settings-schema row).
          The compact (labels-hidden) rail is fixed-width — no resizer; a
          hidden (zero-width) rail is clipped and inert — none either. */}
      {!labelsHidden && !hidden
        ? (
          <div
            className="absolute top-0 -right-0.75 z-1 h-full w-1.75 cursor-col-resize hover:bg-accent-soft active:bg-accent-soft"
            role="separator"
            aria-orientation="vertical"
            title={t('nav.resizeHint')}
            onPointerDown={startResize}
          />
        )
        : null}
    </nav>
  )
}
