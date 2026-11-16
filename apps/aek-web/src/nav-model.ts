/**
 * The shared navigation model of the AEK console.
 *
 * Z round: the model used to live inside `Sidebar.tsx`. It moved out so the
 * main rail AND the per-plugin mini side-nav (the plugin-owned route rail,
 * see `PluginSubNav.tsx`) derive their rows from ONE place — a panel's
 * "family" (itself + its `subOf` children) and the per-plugin last-sub
 * memory.
 *
 * Every surface the console can show is one `PanelId`; sub-entries (plugin
 * internal routes, e.g. the Web Search settings page) hang off their family
 * via `subOf` and are NOT top-level rail rows (Z round user ruling: the main
 * nav never shows third-level boards; plugins manage their own routes with a
 * side rail of their own).
 *
 * @module @cheezmil/aek-home/src/client/nav-model
 */
import { useCallback, useMemo } from 'react'
import { PREF_KEYS, useSettings } from './preferences.tsx'
import type { IconName } from './Icons.tsx'

/** Every surface the console can show. */
export type PanelId = 'runtime' | 'websearch' | 'plugins' | 'skills' | 'prompts' | 'websearchSettings' | 'settings' | 'about'

/** The two drawer groups the user asked for (plus the pinned bucket). */
export type NavGroup = 'plugins' | 'other'

/** One menu row of the MAIN rail (top-level only — sub entries are family routes). */
export interface NavEntry {
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
   * its drawer (the Web Search settings row lives under Web Search). Since
   * the Z round it is NOT rendered in the main rail at all — it is a route
   * of the owning plugin, shown in the plugin's own side rail.
   */
  subOf?: string
  /** Extra aliases for the search box. */
  keywords: readonly string[]
}

/** Navigation model. Adding a panel = one row; the drawer picks it up. */
export const NAV: readonly NavEntry[] = [
  // M round: 运行实例管理 was renamed 插件与程序管理 and now also hosts the
  // former 插件管理 page content plus the former 关于 content (Home composes
  // the three sections into one page). The 'plugins' entry is GONE from the
  // nav — its old stored-order id is filtered out by the Sidebar's
  // orderIds memo (stored ids not in NAV simply don't render).
  { id: 'runtime', labelKey: 'panel.runtime', icon: 'activity', group: 'other', keywords: ['plugin', 'program', 'runtime', 'instance', 'slot', 'port', '运行实例', '实例', '插件与程序', '程序'] },
  // Web Search is a real AEK plugin, so it belongs in the 插件 drawer, not 其他.
  { id: 'websearch', labelKey: 'panel.websearch', icon: 'search', group: 'plugins', keywords: ['search', 'keys', 'api key', 'provider', '密钥'] },
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

/** Top-level rail rows only: `subOf` entries are family routes, never rail rows. */
export const NAV_TOP: readonly NavEntry[] = NAV.filter(entry => entry.subOf === undefined)

/** Every panel id, used to validate the stored last-sub pairs. */
export const NAV_IDS: readonly string[] = NAV.map(entry => entry.id)

/** @param id - a panel. @returns the top-level entries of its family (its routes). */
export function subEntriesOf(id: string): NavEntry[] {
  return NAV.filter(entry => entry.subOf === id)
}

/**
 * @param id - a panel id. @returns the family (plugin) that owns the panel:
 * the panel itself when it is a family root with routes, else the `subOf`
 * parent when the panel is a family route; undefined for plain panels.
 */
export function panelFamilyOf(id: PanelId): string | undefined {
  if (subEntriesOf(id).length > 0) return id
  // The panel itself is a family ROUTE: find the entry that carries its id
  // and answer with its parent. (Not `entry.subOf === id` — that would mean
  // "entries nested UNDER this panel", a direction that exists for no panel
  // today and hides the route's own family.)
  return NAV.find(entry => entry.id === id)?.subOf
}

/** The host preference holding the per-plugin third-level (now: route) memory. */
const LAST_SUB_KEY = PREF_KEYS.lastSub

/**
 * Z round: the per-plugin memory of the last visited route, stored as
 * `parent:child,parent:child` panel ids (`child === parent` means the
 * default "{name}首页" board). Shared by the main rail (a family row click
 * re-opens the remembered route) and the plugin's own side rail (visiting a
 * route records it).
 */
export function useLastSubMemory(): {
  /** @returns the last visited route per family. */
  lastSub: ReadonlyMap<PanelId, PanelId>
  /** @param parent - the family. @param child - the route just visited. */
  record: (parent: PanelId, child: PanelId) => void
} {
  const { prefs, set } = useSettings()
  const lastSub = useMemo(() => {
    const map = new Map<PanelId, PanelId>()
    if (typeof prefs[LAST_SUB_KEY] === 'string') {
      for (const part of prefs[LAST_SUB_KEY].split(',')) {
        const at = part.lastIndexOf(':')
        if (at <= 0) continue
        const parent = part.slice(0, at) as PanelId
        const child = part.slice(at + 1) as PanelId
        if (NAV_IDS.includes(parent) && NAV_IDS.includes(child)) map.set(parent, child)
      }
    }
    return map
  }, [prefs])
  const record = useCallback((parent: PanelId, child: PanelId): void => {
    const next = new Map(lastSub)
    next.set(parent, child)
    set(LAST_SUB_KEY, [...next.entries()].map(([parentId, childId]) => `${parentId}:${childId}`).join(','))
  }, [lastSub, set])
  return { lastSub, record }
}

/**
 * A round: host preferences of the per-plugin route rail interactions. The
 * list-valued keys hold comma-separated FAMILY ids (the row owning plugin
 * routes — today only `websearch`).
 */
/** `aek-home.pluginRailHidden`: family ids whose route rail is hidden. */
export const RAIL_HIDDEN_KEY = 'aek-home.pluginRailHidden'
/** `aek-home.pluginRailLabelsHidden`: family ids whose route labels are hidden (icon-only rows). */
export const RAIL_LABELS_HIDDEN_KEY = 'aek-home.pluginRailLabelsHidden'
/**
 * `aek-home.railHint`: the base switch of the rail's bottom operation hint
 * (one boolean owns it: the × button switches it off, the Settings row
 * switches it back on; unset = default on).
 */
export const RAIL_HINT_KEY = 'aek-home.railHint'
/** `aek-home.pluginRailWidth`: the dragged rail width in px (settings-schema row). */
export const RAIL_WIDTH_KEY = 'aek-home.pluginRailWidth'
/** `aek-home.pluginRailCompactWidth`: the icon-only column width used while the labels are hidden. */
export const RAIL_COMPACT_WIDTH_KEY = 'aek-home.pluginRailCompactWidth'

/** @param raw - the raw pref value. @returns the stored comma list ("" when unset). */
export function parseCommaList(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

/**
 * Toggle one family id inside a comma-separated list (pure — spec-able).
 * @param list - the stored comma list, "" allowed.
 * @param id - the family to add or remove.
 * @returns the next list.
 */
export function toggleInCommaList(list: string, id: string): string {
  const items = list.length === 0 ? [] : list.split(',').filter(Boolean)
  const next = items.includes(id) ? items.filter(item => item !== id) : [...items, id]
  return next.join(',')
}
