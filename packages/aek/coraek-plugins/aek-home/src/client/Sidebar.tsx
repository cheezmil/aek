/**
 * The left navigation rail of the AEK console.
 *
 * Design notes (2026-11-08 revision + polish pass):
 * - One flat menu: no first-level group headings, because the console will
 *   grow a lot and a search box scales better than more grouping.
 * - The top logo is the collapse toggle (with a native tooltip); there is no
 *   chevron button and no header badge any more.
 * - `collapsed` is the LOCKED state. Hovering a locked-collapsed rail shows a
 *   temporary "peek" without changing the lock — the three-mode pattern
 *   (locked open / locked collapsed / hover peek) used by common sidebars.
 * - The header contains exactly two controls in the footer: language and star.
 *
 * Hover intent (2026-11-08 polish): entering is delayed a little and leaving
 * is delayed a little longer, so crossing the rail edge does not flicker.
 * After a click-to-collapse the current pointer visit is suppressed until the
 * pointer actually leaves — otherwise the hover would immediately re-expand
 * the rail and the click would look like it did nothing. Text fades/slides via
 * CSS instead of `display: none`, so the rail never snaps between sizes.
 *
 * @module @cheezmil/aek-home/src/client/Sidebar
 */
import { useEffect, useRef, useState } from 'react'
import { BrandMark, Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import type { Locale } from './i18n.tsx'
import { css, cx } from './styles.ts'

/** Delay before a pointer hover starts the peek (hover intent). */
const HOVER_ENTER_DELAY = 120
/** Delay before the peek collapses after the pointer leaves. */
const HOVER_LEAVE_DELAY = 200

/** Every surface the console can show. */
export type PanelId = 'overview' | 'websearch' | 'plugins' | 'settings' | 'about'

/** One menu row. */
interface NavEntry {
  /** Panel to activate. */
  id: PanelId
  /** i18n key of the visible label. */
  labelKey: string
  /** Icon drawn before the label. */
  icon: IconName
  /** Extra aliases for the search box (same idea as cmdk's `keywords`). */
  keywords: readonly string[]
}

/**
 * Flat navigation model. New AEK features add one row here; the search box
 * picks it up automatically through its label / id / keywords.
 */
const NAV: readonly NavEntry[] = [
  { id: 'overview', labelKey: 'panel.overview', icon: 'dashboard', keywords: ['home', 'dashboard', '概览', 'status'] },
  { id: 'websearch', labelKey: 'panel.websearch', icon: 'search', keywords: ['search', 'keys', 'api key', 'provider', '密钥'] },
  { id: 'plugins', labelKey: 'panel.plugins', icon: 'plugins', keywords: ['plugin', 'package', 'inventory', '插件'] },
  { id: 'settings', labelKey: 'panel.settings', icon: 'settings', keywords: ['preferences', 'options', 'hover', '设置'] },
  { id: 'about', labelKey: 'panel.about', icon: 'about', keywords: ['version', 'info', 'install', '关于'] },
]

/** The project's public repository (verified with `gh repo view`). */
const GITHUB_REPO_URL = 'https://github.com/cheezmil/agent-enhance-kit'

/** Props for {@link Sidebar}. */
export interface SidebarProps {
  /** Currently selected panel. */
  active: PanelId
  /** Select a panel. */
  onSelect: (id: PanelId) => void
  /** LOCKED collapse state (hover expansion is separate). */
  collapsed: boolean
  /** Toggle the locked collapse state. */
  onToggleCollapse: () => void
  /** Whether pointer hover temporarily expands a collapsed rail. */
  hoverExpandEnabled: boolean
  /** Provider count shown as a badge, `undefined` until the host answers. */
  providerCount: number | undefined
}

/**
 * Render the navigation rail.
 * @param props - selection, collapse state and badge data.
 * @returns the sidebar.
 */
export function Sidebar({
  active, onSelect, collapsed, onToggleCollapse, hoverExpandEnabled, providerCount,
}: SidebarProps) {
  const { t, locale, setLocale } = useI18n()
  const [query, setQuery] = useState('')
  const [hovered, setHovered] = useState(false)
  const [suppressPeek, setSuppressPeek] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const localeWrap = useRef<HTMLDivElement>(null)
  const enterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

  /**
   * Logo click changes the LOCK. Collapsing also suppresses the current hover
   * visit, so the rail visibly closes even while the pointer is still inside.
   */
  const handleToggle = (): void => {
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
    onToggleCollapse()
  }

  const peek = hoverExpandEnabled && hovered && !suppressPeek
  const compact = collapsed && !peek
  // The tooltip describes the CURRENT visual state, not the saved lock.
  const brandLabel = compact
    ? t('brand.expand')
    : (collapsed ? t('brand.pinOpen') : t('brand.collapse'))

  const needle = query.trim().toLowerCase()
  const filtered = needle.length === 0
    ? NAV
    : NAV.filter((entry) => {
      const haystack = [t(entry.labelKey), entry.id, ...entry.keywords].join(' ').toLowerCase()
      return haystack.includes(needle)
    })

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
          aria-expanded={!compact}
          title={brandLabel}
        >
          <BrandMark size={34} className={css.brandMark} />
          <span className={css.brandText}>
            <span className={css.brandTagline}>AEK</span>
          </span>
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

        <div className={css.navList}>
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              className={cx(css.navItem, active === item.id && css.navItemActive)}
              aria-current={active === item.id ? 'page' : undefined}
              title={t(item.labelKey)}
              onClick={() => onSelect(item.id)}
            >
              <span className={css.navIcon}><Icon name={item.icon} size={18} /></span>
              <span className={css.navLabel}>{t(item.labelKey)}</span>
              {item.id === 'websearch' && providerCount !== undefined
                ? <span className={css.navBadge}>{String(providerCount)}</span>
                : null}
            </button>
          ))}
        </div>

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
                <div className={css.localeMenu} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={cx(css.localeMenuItem, locale === 'zh-CN' && css.localeMenuActive)}
                    onClick={() => chooseLocale('zh-CN')}
                  >
                    简体中文
                    {locale === 'zh-CN' ? <Icon name="check" size={14} /> : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={cx(css.localeMenuItem, locale === 'en-US' && css.localeMenuActive)}
                    onClick={() => chooseLocale('en-US')}
                  >
                    English
                    {locale === 'en-US' ? <Icon name="check" size={14} /> : null}
                  </button>
                </div>
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
