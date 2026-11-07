/**
 * The left navigation rail of the AEK console: brand, grouped menu entries
 * with an icon and a text label, a compact (icon-only) mode, and a footer
 * status. Navigation is pure local state — the shell owns the whole `#root`.
 *
 * @module @cheezmil/aek-home/src/client/Sidebar
 */
import { BrandMark, Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import { css, cx } from './styles.ts'

/** Every surface the console can show. */
export type PanelId = 'overview' | 'websearch' | 'plugins' | 'settings' | 'about'

/** One menu row. */
interface NavEntry {
  /** Panel to activate. */
  id: PanelId
  /** Visible label. */
  label: string
  /** Icon drawn before the label. */
  icon: IconName
}

/** A labelled group of menu rows. */
interface NavGroup {
  /** Group heading. */
  label: string
  /** Rows in order. */
  items: readonly NavEntry[]
}

/** Static navigation model. New AEK features add a row here. */
const GROUPS: readonly NavGroup[] = [
  {
    label: '工作台',
    items: [
      { id: 'overview', label: '概览', icon: 'dashboard' },
      { id: 'websearch', label: 'Web Search', icon: 'search' },
    ],
  },
  {
    label: '管理',
    items: [
      { id: 'plugins', label: '插件', icon: 'plugins' },
      { id: 'settings', label: '设置', icon: 'settings' },
    ],
  },
  {
    label: '帮助',
    items: [
      { id: 'about', label: '关于', icon: 'about' },
    ],
  },
]

/** Props for {@link Sidebar}. */
export interface SidebarProps {
  /** Currently selected panel. */
  active: PanelId
  /** Select a panel. */
  onSelect: (id: PanelId) => void
  /** Whether the rail is in icon-only mode. */
  collapsed: boolean
  /** Toggle the rail width. */
  onToggleCollapse: () => void
  /** Provider count shown as a badge, `undefined` until the host answers. */
  providerCount: number | undefined
}

/**
 * Render the navigation rail.
 * @param props - selection, collapse state and badge data.
 * @returns the sidebar.
 */
export function Sidebar({ active, onSelect, collapsed, onToggleCollapse, providerCount }: SidebarProps) {
  return (
    <aside className={cx(css.sidebar, collapsed && css.sidebarCompact)}>
      <div className={css.sidebarHeader}>
        <div className={css.brand}>
          <BrandMark size={34} className={css.brandMark} />
          <div className={css.brandText}>
            <span className={css.brandName}>AEK</span>
            <span className={css.brandTagline}>AGENT ENHANCE KIT</span>
          </div>
        </div>
        <button
          type="button"
          className={css.collapseButton}
          onClick={onToggleCollapse}
          aria-label={collapsed ? '展开菜单栏' : '收起菜单栏'}
          title={collapsed ? '展开菜单栏' : '收起菜单栏'}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
        </button>
      </div>

      <nav className={css.sidebarBody} aria-label="主导航">
        {GROUPS.map(group => (
          <div className={css.navGroup} key={group.label}>
            <div className={css.navGroupLabel}>{group.label}</div>
            <div className={css.navList}>
              {group.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={cx(css.navItem, active === item.id && css.navItemActive)}
                  aria-current={active === item.id ? 'page' : undefined}
                  title={item.label}
                  onClick={() => onSelect(item.id)}
                >
                  <span className={css.navIcon}><Icon name={item.icon} size={18} /></span>
                  <span className={css.navLabel}>{item.label}</span>
                  {item.id === 'websearch' && providerCount !== undefined
                    ? <span className={css.navBadge}>{String(providerCount)}</span>
                    : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={css.sidebarFooter}>
        <div className={css.statusPill}>
          <span className={css.statusDot} />
          <span className={css.statusText}>本地服务运行中</span>
        </div>
        <div className={css.sidebarMeta}>AEK Web Console · local</div>
      </div>
    </aside>
  )
}
