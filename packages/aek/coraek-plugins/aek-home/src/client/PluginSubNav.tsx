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
 * @module @cheezmil/aek-home/src/client/PluginSubNav
 */
import { useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
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
  /**
   * A round: labels of THIS family's rows are hidden (icon-only mode, set by
   * the main rail's double click on the family row).
   */
  labelsHidden?: boolean
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

/**
 * The plugin-owned route rail next to the plugin's content.
 * @param props - active panel, selection and the label state.
 * @returns the rail, or `null` when the active panel has no family routes.
 */
export function PluginSubNav({ active, onSelect, labelsHidden = false }: PluginSubNavProps) {
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

  // A round: the dragged width. The pref (settings-schema row
  // `aek-home.pluginRailWidth`) feeds the CSS variable that owns the layout;
  // while dragging, a local state keeps the rail under the pointer and the
  // pref is written once, on release.
  const [railWidth, setRailWidth] = usePref<number>(RAIL_WIDTH_KEY, 200, parseRailWidth)
  // A round addendum: the compact (labels-hidden) width is a Settings value,
  // not a constant — the user gets a granular row for the mini rail column.
  const [railCompactWidth] = usePref<number>(RAIL_COMPACT_WIDTH_KEY, RAIL_COMPACT_DEFAULT, parseRailCompactWidth)
  const [resized, setResized] = useState<number | undefined>(undefined)
  // A round: hidden labels → the rail compacts to the icon column; the
  // dragged width pref is untouched and comes back when the labels return.
  const width = labelsHidden ? railCompactWidth : (resized ?? railWidth)
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

  return (
    <nav
      className={cx(css.pluginSubNav, labelsHidden && css.pluginSubNavNoLabels)}
      aria-label={t('nav.pluginRoutes')}
      // A round: the width is set as a LAYOUT property directly (inline
      // width + flex-basis), not through a custom property: Chromium fails
      // to invalidate the layout of this sticky flex item when only the
      // inline `--aek-plugin-rail-width` value changes mid-session, so the
      // compact/drag transitions would render one step behind until a full
      // reflow. A direct width change invalidates layout normally. The CSS
      // variable stays as the rule-level fallback for the initial render.
      style={{
        '--aek-plugin-rail-width': `${String(width)}px`,
        width: `${String(width)}px`,
        flexBasis: `${String(width)}px`,
      } as CSSProperties}
    >
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

      {hintVisible
        ? (
          <div className={css.pluginSubNavHint}>
            {!labelsHidden ? <span className={css.pluginSubNavHintText}>{t('nav.railHint.text')}</span> : null}
            <button
              type="button"
              className={css.pluginSubNavHintDismiss}
              title={t('nav.railHint.dismiss')}
              aria-label={t('nav.railHint.dismiss')}
              onClick={() => setRailHint(false)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        )
        : null}

      {/* A round: drag the rail's right edge to resize; the width lands in
          the `aek-home.pluginRailWidth` pref (and its settings-schema row).
          The compact (labels-hidden) rail is fixed-width — no resizer. */}
      {!labelsHidden
        ? (
          <div
            className={css.pluginSubNavResizer}
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
