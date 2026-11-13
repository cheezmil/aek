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
 * @module @cheezmil/aek-home/src/client/PluginSubNav
 */
import { Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { NAV, panelFamilyOf, subEntriesOf, useLastSubMemory } from './nav-model.ts'
import type { PanelId } from './nav-model.ts'
import { css, cx } from './styles.ts'

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
}

/**
 * The plugin-owned route rail next to the plugin's content.
 * @param props - active panel + selection.
 * @returns the rail, or `null` when the active panel has no family routes.
 */
export function PluginSubNav({ active, onSelect }: PluginSubNavProps) {
  const { t, tf } = useI18n()
  const { record } = useLastSubMemory()
  // `panelFamilyOf` returns the owning family as a plain string; every family
  // it names is a NAV root, i.e. a valid PanelId.
  const family = panelFamilyOf(active) as PanelId | undefined
  if (family === undefined) return null
  const parent = NAV.find(entry => entry.id === family)
  if (parent === undefined) return null
  const routes: RouteRow[] = [
    { id: family, icon: 'layout', label: tf('nav.home', { name: t(parent.labelKey) }) },
    ...subEntriesOf(family).map(sub => ({ id: sub.id, icon: sub.icon, label: t(sub.labelKey) })),
  ]
  return (
    <nav className={css.pluginSubNav} aria-label={t('nav.pluginRoutes')}>
      <ul className={css.pluginSubNavList}>
        {routes.map(route => (
          <li key={route.id} data-panel={route.id}>
            <button
              type="button"
              className={cx(css.pluginSubNavItem, active === route.id && css.pluginSubNavItemActive)}
              aria-current={active === route.id ? 'page' : undefined}
              title={route.label}
              onClick={() => {
                onSelect(route.id)
                record(family, route.id)
              }}
            >
              <span className={css.pluginSubNavIcon}><Icon name={route.icon} size={14} /></span>
              <span className={css.pluginSubNavLabel}>{route.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
