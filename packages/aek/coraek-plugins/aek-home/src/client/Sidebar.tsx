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
 * - EVERY list is an unordered `<ul>/<li>` (user rule). No `<ol>` anywhere.
 * - The top search box filters the rail; panel-level search boxes live in the
 *   panels themselves.
 *
 * @module @cheezmil/aek-home/src/client/Sidebar
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { BrandMark, Icon } from './Icons.tsx'
import type { BrandVariant, IconName } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import type { Locale } from './i18n.tsx'
import { parseBoolean, PREF_KEYS, usePref, useSettings } from './preferences.tsx'
import { css, cx } from './styles.ts'

/** Delay before a pointer hover starts the peek (hover intent). */
const HOVER_ENTER_DELAY = 120
/** Delay before the peek collapses after the pointer leaves. */
const HOVER_LEAVE_DELAY = 200

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

/** Every surface the console can show. */
export type PanelId = 'runtime' | 'websearch' | 'plugins' | 'skills' | 'prompts' | 'websearchSettings' | 'settings' | 'about'

/** The two drawer groups the user asked for (plus the pinned bucket). */
export type NavGroup = 'plugins' | 'other'

/** One menu row. */
interface NavEntry {
  /** Panel to activate. */
  id: PanelId
  /** i18n key of the visible label. */
  labelKey: string
  /** Icon drawn before the label. */
  icon: IconName
  /** Which drawer holds it. */
  group: NavGroup
  /**
   * W round: nest under another row instead of being a top-level entry of
   * its drawer (the Web Search settings row lives under Web Search).
   */
  subOf?: string
  /** Extra aliases for the search box. */
  keywords: readonly string[]
}

/** Navigation model. Adding a panel = one row; the drawer picks it up. */
const NAV: readonly NavEntry[] = [
  { id: 'runtime', labelKey: 'panel.runtime', icon: 'activity', group: 'other', keywords: ['runtime', 'instance', 'slot', 'port', '运行实例', '实例'] },
  // Web Search is a real AEK plugin, so it belongs in the 插件 drawer, not 其他.
  { id: 'websearch', labelKey: 'panel.websearch', icon: 'search', group: 'plugins', keywords: ['search', 'keys', 'api key', 'provider', '密钥'] },
  { id: 'plugins', labelKey: 'panel.plugins', icon: 'plugins', group: 'plugins', keywords: ['plugin', 'package', 'inventory', '插件管理'] },
  // Q round: "book" read as docs and "sparkles" as AI magic — neither says
  // "manager". A skill is a pluggable capability block (puzzle); a prompt
  // manager manages plain text blocks (type).
  { id: 'skills', labelKey: 'panel.skills', icon: 'puzzle', group: 'plugins', keywords: ['skill', 'manager', '技能'] },
  { id: 'prompts', labelKey: 'panel.prompts', icon: 'type', group: 'plugins', keywords: ['prompt', 'manager', '提示词'] },
  // Q round: every plugin with user-facing settings gets its own settings
  // page instead of one giant Settings page. Web Search owns the ranking
  // refresh interval; the base "Settings" page was renamed 基础设置.
  { id: 'websearchSettings', labelKey: 'panel.websearchSettings', icon: 'settings', group: 'plugins', subOf: 'websearch', keywords: ['websearch', 'search', 'ranking', '排行', '设置'] },
  { id: 'settings', labelKey: 'panel.settings', icon: 'settings', group: 'other', keywords: ['preferences', 'options', 'sidebar', '基础设置', '设置'] },
  { id: 'about', labelKey: 'panel.about', icon: 'about', group: 'other', keywords: ['version', 'info', 'entry', '关于'] },
]

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
  /** Provider count badge; `undefined` until the host answers. */
  providerCount: number | undefined
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
function DrawerGroup({ label, open, onToggle, children }: {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className={css.drawerGroup}>
      <button
        type="button"
        className={css.drawerHead}
        onClick={onToggle}
        aria-expanded={open}
        title={open ? t('nav.collapse') : t('nav.expand')}
      >
        <Icon name="chevronDown" size={14} className={cx(css.drawerCaret, open && css.chevronOpen)} />
        <span className={css.drawerLabel}>{label}</span>
      </button>
      {open ? <ul className={css.navList}>{children}</ul> : null}
    </div>
  )
}

/**
 * Render the navigation rail.
 * @param props - selection only; everything else comes from host settings.
 * @returns the sidebar.
 */
export function Sidebar({ active, onSelect, providerCount, currentSlot, onRefresh }: SidebarProps) {
  const { t, locale, setLocale } = useI18n()
  const { prefs, set } = useSettings()
  const [collapsed, setCollapsed] = usePref<boolean>(PREF_KEYS.collapsed, false, parseBoolean)
  const [hoverExpand] = usePref<boolean>(PREF_KEYS.hoverExpand, true, parseBoolean)
  const [logoToggle] = usePref<boolean>(PREF_KEYS.logoToggle, true, parseBoolean)
  // W round: the user-dragged rail width (persisted like every other rail
  // setting; the CSS variable only animates the DEFAULT width).
  const [sidebarWidth, setSidebarWidth] = usePref<number>('aek-home.sidebarWidth', SIDEBAR_DEFAULT_WIDTH, parseSidebarWidth)
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
  const enterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const defaultOpen = prefs[DRAWER_KEY] !== false
  const pinned = useMemo(() => (typeof prefs[PINNED_KEY] === 'string'
    ? String(prefs[PINNED_KEY]).split(',').filter(Boolean)
    : []), [prefs])
  /**
   * The complete row order. Stored ids that still exist come first in the
   * user's sequence; anything added since the order was saved is appended in
   * the default order, so a new panel never disappears.
   */
  const orderIds = useMemo<PanelId[]>(() => {
    const stored = typeof prefs[ORDER_KEY] === 'string' ? String(prefs[ORDER_KEY]).split(',').filter(Boolean) : []
    const all = NAV.map(entry => entry.id)
    const ordered = stored.filter((id): id is PanelId => (all as string[]).includes(id))
    for (const id of all) if (!ordered.includes(id)) ordered.push(id)
    return ordered
  }, [prefs])
  /** @param id - panel. @returns its position in the manual order. */
  const rankOf = (id: PanelId): number => orderIds.indexOf(id)
  /** Sort helper: applies the manual order to any row slice. */
  const byOrder = (a: NavEntry, b: NavEntry): number => rankOf(a.id) - rankOf(b.id)
  const logoVisible = prefs['aek-home.logoVisible'] !== false
  const brandText = typeof prefs['aek-home.brandText'] === 'string' ? String(prefs['aek-home.brandText']) : 'AEK'
  const logoVariant = logoVariantOf(prefs['aek-home.logoVariant'])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent): void => {
      if (!localeWrap.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  useEffect(() => () => {
    if (enterTimer.current !== undefined) clearTimeout(enterTimer.current)
    if (leaveTimer.current !== undefined) clearTimeout(leaveTimer.current)
  }, [])

  /** Pointer entered the rail: start the (delayed) peek unless suppressed. */
  const handlePointerEnter = (): void => {
    if (leaveTimer.current !== undefined) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = undefined
    }
    // Dragging a row must never expand / collapse the rail under the pointer.
    if (dragId !== undefined) return
    if (suppressPeek || enterTimer.current !== undefined) return
    enterTimer.current = setTimeout(() => {
      enterTimer.current = undefined
      setHovered(true)
    }, HOVER_ENTER_DELAY)
  }

  /** Pointer left the rail: end the peek, re-arm hover for the next visit. */
  const handlePointerLeave = (): void => {
    if (enterTimer.current !== undefined) {
      clearTimeout(enterTimer.current)
      enterTimer.current = undefined
    }
    if (leaveTimer.current !== undefined) clearTimeout(leaveTimer.current)
    setSuppressPeek(false)
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = undefined
      setHovered(false)
    }, HOVER_LEAVE_DELAY)
  }

  /** Logo click changes the LOCK, but only when the toggle is enabled. */
  const handleToggle = (): void => {
    if (!logoToggle) return
    if (collapsed) {
      setSuppressPeek(false)
    } else {
      setSuppressPeek(true)
      setHovered(false)
      if (enterTimer.current !== undefined) {
        clearTimeout(enterTimer.current)
        enterTimer.current = undefined
      }
    }
    setCollapsed(value => !value)
  }

  const peek = hoverExpand && hovered && !suppressPeek
  const compact = collapsed && !peek
  const brandLabel = !logoToggle ? brandText : (compact ? t('brand.expand') : (collapsed ? t('brand.pinOpen') : t('brand.collapse')))

  const needle = query.trim().toLowerCase()
  const filtered = needle.length === 0
    ? NAV
    : NAV.filter((entry) => {
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
    const source = [...nav.querySelectorAll<HTMLLIElement>('li[data-panel].navRow')]
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
      const id = resolved.ids[offset]
      if (id !== undefined) next[slot] = id
    }
    if (next.join(',') === orderIds.join(',')) return
    set(ORDER_KEY, next.join(','))
  }

  /** @param entry - one row. @param pinnedNow - whether it is pinned. @returns the row. */
  const renderRow = (entry: NavEntry, pinnedNow: boolean): ReactNode => {
    return (
      <li
        key={entry.id}
        data-panel={entry.id}
        className={cx(
          css.navRow,
          dragId === entry.id && css.navRowDragging,
          dropMark?.before === entry.id && dragId !== undefined && css.navRowDropBefore,
          dropMark?.after === entry.id && dragId !== undefined && css.navRowDropAfter,
        )}
        draggable
        onDragStart={event => handleDragStart(event, entry.id)}
        onDragEnd={() => { dragIdRef.current = undefined; dropAtRef.current = undefined; setDragId(undefined); setDropMark(undefined) }}
      >
        <button
          type="button"
          className={cx(css.navItem, active === entry.id && css.navItemActive)}
          aria-current={active === entry.id ? 'page' : undefined}
          title={`${t(entry.labelKey)} · ${t('nav.dragHint')}`}
          onClick={() => onSelect(entry.id)}
        >
          <span className={css.navIcon}><Icon name={entry.icon} size={18} /></span>
          <span className={css.navLabel}>{t(entry.labelKey)}</span>
          {entry.id === 'websearch' && providerCount !== undefined
            ? <span className={css.navBadge}>{String(providerCount)}</span>
            : null}
        </button>
        {/* Q round: the refresh icon sits LEFT of the pin and refreshes the
            page THIS row opens — even when that page is not active yet. */}
        <button
          type="button"
          className={css.rowRefresh}
          onClick={() => onRefresh(entry.id)}
          title={t('nav.refresh')}
          aria-label={t('nav.refresh')}
        >
          <Icon name="refresh" size={13} />
        </button>
        <button
          type="button"
          className={cx(css.pinButton, pinnedNow && css.pinActive)}
          onClick={() => togglePin(entry.id)}
          title={pinnedNow ? t('nav.unpin') : t('nav.pin')}
          aria-label={pinnedNow ? t('nav.unpin') : t('nav.pin')}
        >
          <Icon name="pin" size={13} />
        </button>
      </li>
    )
  }

  /**
   * W round: the indented settings row(s) nested under one plugin row.
   * Deliberately NOT draggable (the order is owned by the parent row) and
   * without pin / refresh affordances — it is a child, not a peer.
   */
  const renderSubRows = (parent: string): ReactNode => {
    return (
      <>
        {subRowsFor(parent).map(sub => (
          <li
            key={sub.id}
            className={css.navRowSub}
            data-panel={sub.id}
          >
            <button
              type="button"
              className={cx(css.navItem, css.navItemSub, active === sub.id && css.navItemActive)}
              aria-current={active === sub.id ? 'page' : undefined}
              title={t(sub.labelKey)}
              onClick={() => onSelect(sub.id)}
            >
              <span className={css.navIcon}><Icon name={sub.icon} size={14} /></span>
              <span className={css.navLabel}>{t(sub.labelKey)}</span>
            </button>
          </li>
        ))}
      </>
    )
  }

  const pinnedRows = filtered.filter(entry => pinned.includes(entry.id)).sort(byOrder)
  const pluginRows = filtered.filter(entry => entry.group === 'plugins' && entry.subOf === undefined && !pinned.includes(entry.id)).sort(byOrder)
  // W round: the settings row that nests under a plugin row — visible only
  // while its parent row is visible AND neither is pinned away.
  /** @param parent - the row a settings entry nests under. @returns its visible sub rows. */
  const subRowsFor = (parent: string): NavEntry[] => {
    if (pinned.includes(parent) || !filtered.some(entry => entry.id === parent)) return []
    return filtered.filter(entry => entry.subOf === parent && !pinned.includes(entry.id))
  }
  const otherRows = filtered.filter(entry => entry.group === 'other' && !pinned.includes(entry.id)).sort(byOrder)

  /** @param next - locale chosen in the footer menu. */
  const chooseLocale = (next: Locale): void => {
    setLocale(next)
    setMenuOpen(false)
  }

  return (
    <aside
      className={cx(css.sidebar, compact && css.sidebarCompact, resized !== undefined && css.sidebarResizing)}
      style={compact ? undefined : ({ '--aek-sidebar-width': `${String(railWidth)}px` } as CSSProperties)}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
    >
      <div className={css.sidebarHeader}>
        <button
          type="button"
          className={css.brandButton}
          onClick={handleToggle}
          aria-label={brandLabel}
          aria-expanded={logoToggle ? !compact : undefined}
          title={brandLabel}
          tabIndex={logoToggle ? 0 : -1}
        >
          {logoVisible
            ? <BrandMark size={34} className={css.brandMark} variant={logoVariant} />
            : null}
          {brandText.length > 0
            ? (
              <span className={css.brandText}>
                <span className={css.brandTagline}>
                  {brandText}
                  {currentSlot === 'next'
                    ? <span className={css.slotBadge}>Next</span>
                    : null}
                </span>
              </span>
            )
            : null}
        </button>
      </div>

      <nav
        className={css.sidebarBody}
        aria-label={t('nav.searchAria')}
        ref={navRef}
        onDragOver={handleRailDragOver}
        onDrop={handleRailDrop}
      >
        <div className={css.navSearchWrap}>
          <span className={css.navSearchIcon}><Icon name="search" size={16} /></span>
          <input
            className={css.navSearchInput}
            type="search"
            value={query}
            placeholder={t('nav.search')}
            aria-label={t('nav.searchAria')}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
              if (event.key === 'Enter' && filtered[0] !== undefined) {
                onSelect(filtered[0].id)
                setQuery('')
              }
            }}
          />
          {query.length > 0
            ? (
              <button
                type="button"
                className={css.navSearchClear}
                onClick={() => setQuery('')}
                title={t('nav.clear')}
                aria-label={t('nav.clear')}
              >
                <Icon name="close" size={14} />
              </button>
            )
            : null}
        </div>

        {pinnedRows.length > 0
          ? (
            <DrawerGroup label={t('nav.group.pinned')} open={isOpen('pinned')} onToggle={() => toggleGroup('pinned')}>
              {pinnedRows.map(entry => (
                <Fragment key={entry.id}>
                  {renderRow(entry, true)}
                  {subRowsFor(entry.id).length > 0 ? renderSubRows(entry.id) : null}
                </Fragment>
              ))}
            </DrawerGroup>
          )
          : null}

        <DrawerGroup label={t('nav.group.plugins')} open={isOpen('plugins')} onToggle={() => toggleGroup('plugins')}>
          {pluginRows.map(entry => (
            <Fragment key={entry.id}>
              {renderRow(entry, false)}
              {subRowsFor(entry.id).length > 0 ? renderSubRows(entry.id) : null}
            </Fragment>
          ))}
        </DrawerGroup>

        <DrawerGroup label={t('nav.group.other')} open={isOpen('other')} onToggle={() => toggleGroup('other')}>
          {otherRows.map(entry => renderRow(entry, false))}
        </DrawerGroup>

        {filtered.length === 0
          ? <div className={css.navNoMatch}>{t('nav.noMatch')}</div>
          : null}
      </nav>

      <div className={css.sidebarFooter}>
        <div className={css.footerActions}>
          <div className={css.localeWrap} ref={localeWrap}>
            <button
              type="button"
              className={css.footerIconButton}
              onClick={() => setMenuOpen(value => !value)}
              title={t('footer.language')}
              aria-label={t('footer.language')}
              aria-expanded={menuOpen}
            >
              <Icon name="language" size={18} />
            </button>
            {menuOpen
              ? (
                <ul className={css.localeMenu} role="menu">
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className={cx(css.localeMenuItem, locale === 'zh-CN' && css.localeMenuActive)}
                      onClick={() => chooseLocale('zh-CN')}
                    >
                      简体中文
                      {locale === 'zh-CN' ? <Icon name="check" size={14} /> : null}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className={cx(css.localeMenuItem, locale === 'en-US' && css.localeMenuActive)}
                      onClick={() => chooseLocale('en-US')}
                    >
                      English
                      {locale === 'en-US' ? <Icon name="check" size={14} /> : null}
                    </button>
                  </li>
                </ul>
              )
              : null}
          </div>
          <a
            className={css.footerIconButton}
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            title={t('footer.github')}
            aria-label={t('footer.github')}
          >
            <Icon name="star" size={18} />
          </a>
        </div>
      </div>

      {/* W round: drag the rail's right edge to resize; double-click resets.
          Only while expanded — the compact rail is fixed to its icon width. */}
      {!compact
        ? (
          <div
            className={css.sidebarResize}
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
