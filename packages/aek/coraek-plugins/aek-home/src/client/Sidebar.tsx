/**
 * The left navigation rail of the AEK console.
 *
 * Design notes (2026-11-08 revision):
 * - One flat menu: no first-level group headings, because the console will
 *   grow a lot and a search box scales better than more grouping.
 * - The top logo is the collapse toggle (with a native tooltip); there is no
 *   chevron button any more.
 * - `collapsed` is the LOCKED state. When "auto-expand on pointer hover" is
 *   enabled, hovering temporarily expands the rail without changing the lock —
 *   the three-mode pattern (locked open / collapsed / hover-to-expand) used by
 *   common sidebar implementations.
 * - The footer contains exactly two controls: language and the GitHub star.
 *
 * @module @cheezmil/aek-home/src/client/Sidebar
 */
import { useEffect, useRef, useState } from 'react'
import { BrandMark, Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import type { Locale } from './i18n.tsx'
import { css, cx } from './styles.ts'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const localeWrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent): void => {
      if (!localeWrap.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  const compact = collapsed && !(hoverExpandEnabled && hovered)
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={css.sidebarHeader}>
        <button
          type="button"
          className={css.brandButton}
          onClick={onToggleCollapse}
          aria-label={collapsed ? t('brand.expand') : t('brand.collapse')}
          title={collapsed ? t('brand.expand') : t('brand.collapse')}
        >
          <BrandMark size={34} className={css.brandMark} />
          <span className={css.brandText}>
            <span className={css.brandTagline}>AEK</span>
          </span>
        </button>
        <span className={css.headerBadge} title={t('badge.local')}>
          <Icon name="server" size={14} />
          <span className={css.headerBadgeText}>{t('badge.local')}</span>
        </span>
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
              <Icon name="globe" size={18} />
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
