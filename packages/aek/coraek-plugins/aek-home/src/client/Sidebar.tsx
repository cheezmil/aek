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
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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

/** Every surface the console can show. */
export type PanelId = 'runtime' | 'websearch' | 'plugins' | 'skills' | 'prompts' | 'settings' | 'about'

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
  /** Extra aliases for the search box. */
  keywords: readonly string[]
}

/** Navigation model. Adding a panel = one row; the drawer picks it up. */
const NAV: readonly NavEntry[] = [
  { id: 'runtime', labelKey: 'panel.runtime', icon: 'activity', group: 'other', keywords: ['runtime', 'instance', 'slot', 'port', '运行实例', '实例'] },
  // Web Search is a real AEK plugin, so it belongs in the 插件 drawer, not 其他.
  { id: 'websearch', labelKey: 'panel.websearch', icon: 'search', group: 'plugins', keywords: ['search', 'keys', 'api key', 'provider', '密钥'] },
  { id: 'plugins', labelKey: 'panel.plugins', icon: 'plugins', group: 'plugins', keywords: ['plugin', 'package', 'inventory', '插件管理'] },
  { id: 'skills', labelKey: 'panel.skills', icon: 'book', group: 'plugins', keywords: ['skill', 'manager', '技能'] },
  { id: 'prompts', labelKey: 'panel.prompts', icon: 'sparkles', group: 'plugins', keywords: ['prompt', 'manager', '提示词'] },
  { id: 'settings', labelKey: 'panel.settings', icon: 'settings', group: 'other', keywords: ['preferences', 'options', 'sidebar', '设置'] },
  { id: 'about', labelKey: 'panel.about', icon: 'about', group: 'other', keywords: ['version', 'info', 'entry', '关于'] },
]

/** The project's public repository (verified with `gh repo view`). */
const GITHUB_REPO_URL = 'https://github.com/cheezmil/agent-enhance-kit'

/** Host preference holding comma-separated pinned panel ids. */
const PINNED_KEY = 'aek-home.pinned'
/** Host preference holding the default drawer expanded state. */
const DRAWER_KEY = 'aek-home.drawerExpanded'

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
export function Sidebar({ active, onSelect, providerCount, currentSlot }: SidebarProps) {
  const { t, locale, setLocale } = useI18n()
  const { prefs, set } = useSettings()
  const [collapsed, setCollapsed] = usePref<boolean>(PREF_KEYS.collapsed, false, parseBoolean)
  const [hoverExpand] = usePref<boolean>(PREF_KEYS.hoverExpand, true, parseBoolean)
  const [logoToggle] = usePref<boolean>(PREF_KEYS.logoToggle, true, parseBoolean)
  const [query, setQuery] = useState('')
  const [hovered, setHovered] = useState(false)
  const [suppressPeek, setSuppressPeek] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({})
  const localeWrap = useRef<HTMLDivElement>(null)
  const enterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const defaultOpen = prefs[DRAWER_KEY] !== false
  const pinned = useMemo(() => (typeof prefs[PINNED_KEY] === 'string'
    ? String(prefs[PINNED_KEY]).split(',').filter(Boolean)
    : []), [prefs])
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

  /** @param entry - one row. @param pinnedNow - whether it is pinned. @returns the row. */
  const renderRow = (entry: NavEntry, pinnedNow: boolean): ReactNode => (
    <li key={entry.id} className={css.navRow}>
      <button
        type="button"
        className={cx(css.navItem, active === entry.id && css.navItemActive)}
        aria-current={active === entry.id ? 'page' : undefined}
        title={t(entry.labelKey)}
        onClick={() => onSelect(entry.id)}
      >
        <span className={css.navIcon}><Icon name={entry.icon} size={18} /></span>
        <span className={css.navLabel}>{t(entry.labelKey)}</span>
        {entry.id === 'websearch' && providerCount !== undefined
          ? <span className={css.navBadge}>{String(providerCount)}</span>
          : null}
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

  const pinnedRows = filtered.filter(entry => pinned.includes(entry.id))
  const pluginRows = filtered.filter(entry => entry.group === 'plugins' && !pinned.includes(entry.id))
  const otherRows = filtered.filter(entry => entry.group === 'other' && !pinned.includes(entry.id))

  /** @param next - locale chosen in the footer menu. */
  const chooseLocale = (next: Locale): void => {
    setLocale(next)
    setMenuOpen(false)
  }

  return (
    <aside
      className={cx(css.sidebar, compact && css.sidebarCompact)}
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

      <nav className={css.sidebarBody} aria-label={t('nav.searchAria')}>
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
              {pinnedRows.map(entry => renderRow(entry, true))}
            </DrawerGroup>
          )
          : null}

        <DrawerGroup label={t('nav.group.plugins')} open={isOpen('plugins')} onToggle={() => toggleGroup('plugins')}>
          {pluginRows.map(entry => renderRow(entry, false))}
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
    </aside>
  )
}
