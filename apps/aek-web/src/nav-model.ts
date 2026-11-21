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
 * R2 round (2026-11-18): the second-level rail becomes a hard contract —
 * every AEK plugin that owns a webui face AND the three built-in pages
 * (插件与程序管理 / 基础设置 / 关于) get their own route rail. The rail
 * gained a third row KIND besides "synthetic home" and "different page":
 * an ANCHOR tab (`NavEntry.anchor`) that stays on the family's page and
 * positions it to one of the page's own sections (`data-nav-anchor`).
 * Plugin developers freely choose: tabs may jump pages OR position the
 * page (the user's freedom, 2026-11-18 ruling). `scripts/aek/
 * verify-plugin-rails.mjs` machine-enforces the contract (dev-cycle
 * verify `plugin-rails` rule).
 *
 * @module @cheezmil/aek-home/src/client/nav-model
 */
import { useCallback, useMemo } from 'react'
import { PREF_KEYS, useSettings } from './preferences.tsx'
import type { IconName } from './Icons.tsx'
import { NAV_ICONS } from './icon-registry.ts'

/** Every surface the console can show. */
export type PanelId = 'runtime' | 'websearch' | 'plugins' | 'skills' | 'prompts' | 'websearchSettings' | 'icons'
  | 'iconsLucide' | 'iconsTabler' | 'iconsPhosphor' | 'iconsHeroicons' | 'iconsBootstrap'
  | 'iconsSettings'
  | 'skillsSettings' | 'promptsSettings'
  // BO round (m07690 item 7): the style gallery — one screen comparing
  // every frontend skill's visual style + live re-skin of the console's
  // own components.
  | 'art' | 'artSettings'
  // BH round Plan C: the Skill Manager family's flat rail rows — the
  // reference's sidebar nav (library / install / backup); the dashboard is
  // the family home row. The preset + 全局工作区 sections are rail extras
  // filled by the panel (rail-extras.ts), not flat rows.
  | 'skillsLibrary' | 'skillsBackup'
  // R2 round: the second-level rail of the 插件与程序管理 page — one tab
  // per section of the composed page (an in-page POSITION, not a new page).
  | 'runtimeRuntimes' | 'runtimePlugins' | 'runtimeInfo'
  // R2 round: the second-level rail of the 基础设置 page — one tab per
  // settings section (in-page position).
  | 'settingsSidebarFirst' | 'settingsSidebarSecond' | 'settingsNavigation'
  | 'settingsGeneral' | 'settingsAccess' | 'settingsPermissions' | 'settingsDefaults' | 'settingsMotion'
  | 'settings' | 'about'

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
  /**
   * R2 round: the two row kinds of a second-level rail. Without `anchor`
   * the row is a DIFFERENT PAGE (its own panel id, its own content tree).
   * WITH `anchor` the row stays on the `subOf` page and only positions it:
   * clicking it activates this row's panel id (selection / last-sub
   * memory / URL all key off it) while the CONTENT that renders is the
   * family's, scrolled to the element carrying
   * `data-nav-anchor="<anchor>"`. Plugin authors pick per tab — the same
   * rail may mix both kinds.
   */
  anchor?: string
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
  { id: 'runtime', labelKey: 'panel.runtime', icon: NAV_ICONS.runtime, group: 'other', keywords: ['plugin', 'program', 'runtime', 'instance', 'slot', 'port', '运行实例', '实例', '插件与程序', '程序'] },
  // Web Search is a real AEK plugin, so it belongs in the 插件 drawer, not 其他.
  { id: 'websearch', labelKey: 'panel.websearch', icon: NAV_ICONS.websearch, group: 'plugins', keywords: ['search', 'keys', 'api key', 'provider', '密钥'] },
  // Icon semantics live in `icon-registry.ts` (BB round): skills → the
  // mortarboard (capability block), prompts → the plain text block.
  { id: 'skills', labelKey: 'panel.skills', icon: NAV_ICONS.skills, group: 'plugins', keywords: ['skill', 'manager', '技能'] },
  { id: 'prompts', labelKey: 'panel.prompts', icon: NAV_ICONS.prompts, group: 'plugins', keywords: ['prompt', 'manager', '提示词'] },
  // Q round: every plugin with user-facing settings gets its own settings
  // page instead of one giant Settings page. Web Search owns the ranking
  // refresh interval; the base "Settings" page was renamed 基础设置.
  { id: 'websearchSettings', labelKey: 'panel.websearchSettings', icon: NAV_ICONS.websearchSettings, group: 'plugins', subOf: 'websearch', keywords: ['websearch', 'search', 'ranking', '排行', '设置'] },
  // IV round: the icon manager — every frontend icon with click-to-copy usage
  // and multi-select bulk copy, so the user can point the icons at an agent.
  { id: 'icons', labelKey: 'panel.icons', icon: NAV_ICONS.icons, group: 'plugins', keywords: ['icon', 'glyph', '复制', '图标', 'agent', 'lucide'] },
  // V6.7: icon-set sub-routes — clicking a row in the rail shows just one
  // curated library on its own page; the family root (`icons`) stays the
  // "all" view, so no separate "all" sub-route is needed.
  { id: 'iconsLucide', labelKey: 'panel.iconsLucide', icon: NAV_ICONS.icons, group: 'plugins', subOf: 'icons', keywords: ['icon', 'lucide'] },
  { id: 'iconsTabler', labelKey: 'panel.iconsTabler', icon: NAV_ICONS.icons, group: 'plugins', subOf: 'icons', keywords: ['icon', 'tabler'] },
  { id: 'iconsPhosphor', labelKey: 'panel.iconsPhosphor', icon: NAV_ICONS.icons, group: 'plugins', subOf: 'icons', keywords: ['icon', 'phosphor'] },
  { id: 'iconsHeroicons', labelKey: 'panel.iconsHeroicons', icon: NAV_ICONS.icons, group: 'plugins', subOf: 'icons', keywords: ['icon', 'heroicons'] },
  { id: 'iconsBootstrap', labelKey: 'panel.iconsBootstrap', icon: NAV_ICONS.icons, group: 'plugins', subOf: 'icons', keywords: ['icon', 'bootstrap'] },
  // R2 round: the webui plugin rail contract — EVERY AEK plugin that has a
  // webui face owns a settings page on its family rail (the rail's synthetic
  // "{name}首页" row is the home page; this row is the settings page).
  { id: 'skillsSettings', labelKey: 'panel.skillsSettings', icon: NAV_ICONS.skillsSettings, group: 'plugins', subOf: 'skills', keywords: ['skill', 'settings', '设置'] },
  // BH round Plan C: the Skill Manager's flat rail rows — the reference's
  // sidebar nav (技能库 / 安装 Skills / 备份). The dashboard is the family
  // home row; the Preset + 全局工作区 sections are rail extras (the panel
  // fills rail-extras.ts; the preset/workspace views have no flat row).
  { id: 'skillsLibrary', labelKey: 'panel.skillsLibrary', icon: NAV_ICONS.skillsLibrary, group: 'plugins', subOf: 'skills', anchor: 'library', keywords: ['skill', 'library', '技能库'] },
  { id: 'skillsBackup', labelKey: 'panel.skillsBackup', icon: NAV_ICONS.skillsBackup, group: 'plugins', subOf: 'skills', anchor: 'backup', keywords: ['skill', 'backup', '备份', 'git'] },
  { id: 'promptsSettings', labelKey: 'panel.promptsSettings', icon: NAV_ICONS.promptsSettings, group: 'plugins', subOf: 'prompts', keywords: ['prompt', 'settings', '设置'] },
  { id: 'iconsSettings', labelKey: 'panel.iconsSettings', icon: NAV_ICONS.iconsSettings, group: 'plugins', subOf: 'icons', keywords: ['icon', 'settings', '设置'] },
  // BU round (m12968 ②): the style gallery is a built-in webui panel, not an
  // AEK plugin (it ships in apps/aek-web, its "engine" is static spec data)
  // — the user ruled it belongs under 其他, not 插件.
  { id: 'art', labelKey: 'panel.art', icon: NAV_ICONS.art, group: 'other', keywords: ['style', 'theme', 'skin', 'gallery', 'art', '质感', '皮肤', '主题'] },
  { id: 'artSettings', labelKey: 'panel.artSettings', icon: NAV_ICONS.artSettings, group: 'other', subOf: 'art', keywords: ['style', 'settings', '设置'] },
  // R2 round: the built-in pages get the second-level rail too.
  // (The 关于 page was later reduced to a single version row by user ruling,
  // so it owns no tabs — see below.)
  // 插件与程序管理: one ANCHOR tab per section of the composed page — the
  // tabs position the page, they do not switch to a new page.
  { id: 'runtimeRuntimes', labelKey: 'panel.runtimeSection', icon: NAV_ICONS.runtime, group: 'other', subOf: 'runtime', anchor: 'runtimes', keywords: ['runtime', 'instance', '运行实例'] },
  { id: 'runtimePlugins', labelKey: 'panel.pluginsSection', icon: NAV_ICONS.plugins, group: 'other', subOf: 'runtime', anchor: 'plugins', keywords: ['plugin', 'program', '插件与程序'] },
  { id: 'runtimeInfo', labelKey: 'panel.infoSection', icon: NAV_ICONS.about, group: 'other', subOf: 'runtime', anchor: 'info', keywords: ['info', 'system', '系统信息'] },
  // 基础设置: one ANCHOR tab per settings section (in-page position).
  { id: 'settingsSidebarFirst', labelKey: 'settings.group.sidebarFirst', icon: NAV_ICONS.settings, group: 'other', subOf: 'settings', anchor: 'sidebarFirst', keywords: ['sidebar', '侧栏'] },
  { id: 'settingsSidebarSecond', labelKey: 'settings.group.sidebarSecond', icon: NAV_ICONS.settings, group: 'other', subOf: 'settings', anchor: 'sidebarSecond', keywords: ['plugin rail', '二级侧栏'] },
  { id: 'settingsNavigation', labelKey: 'settings.group.navigation', icon: NAV_ICONS.settings, group: 'other', subOf: 'settings', anchor: 'navigation', keywords: ['navigation', '导航'] },
  { id: 'settingsGeneral', labelKey: 'settings.group.general', icon: NAV_ICONS.settings, group: 'other', subOf: 'settings', anchor: 'general', keywords: ['general', '通用'] },
  // 2026-11-19: the MOTION section of 基础设置 (the app-wide front-end
  // motion kill switch, `aek-home.disableMotion`).
  { id: 'settingsMotion', labelKey: 'settings.group.motion', icon: NAV_ICONS.settings, group: 'other', subOf: 'settings', anchor: 'motion', keywords: ['motion', 'animation', '动态效果'] },
  { id: 'settingsAccess', labelKey: 'settings.group.access', icon: NAV_ICONS.settings, group: 'other', subOf: 'settings', anchor: 'access', keywords: ['access', 'lan', '访问设置'] },
  { id: 'settingsPermissions', labelKey: 'settings.group.permissions', icon: NAV_ICONS.settings, group: 'other', subOf: 'settings', anchor: 'permissions', keywords: ['permissions', '权限'] },
  { id: 'settingsDefaults', labelKey: 'settings.group.defaults', icon: NAV_ICONS.settings, group: 'other', subOf: 'settings', anchor: 'defaults', keywords: ['defaults', '默认值'] },
  // 2026-11-18 user ruling: the 关于 page carries ONLY the desktop version
  // number (no sections, no rosters) — with no sections to position, the
  // about family owns no anchor tabs and renders no rail.
  { id: 'settings', labelKey: 'panel.settings', icon: NAV_ICONS.settings, group: 'other', keywords: ['preferences', 'options', 'sidebar', '基础设置', '设置'] },
  { id: 'about', labelKey: 'panel.about', icon: NAV_ICONS.about, group: 'other', keywords: ['version', 'info', 'entry', '关于'] },
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

/**
 * R2 round: which CONTENT TREE a panel id renders. An ANCHOR route
 * (`NavEntry.anchor`) does not own a page of its own — it renders the
 * family's page (the `subOf` root) positioned to its own section, so the
 * keep-alive mount set must merge it into the family. Every other id
 * answers itself.
 * @param id - a panel id.
 * @returns the panel id whose content tree is rendered for `id`.
 */
export function panelRenderIdOf(id: string): string {
  const entry = NAV.find(item => item.id === id)
  if (entry !== undefined && entry.anchor !== undefined && entry.subOf !== undefined) return entry.subOf
  return id
}

/**
 * R2 round: the in-page position an ANCHOR route carries.
 * @param id - a panel id.
 * @returns the `data-nav-anchor` value to scroll to, or undefined for plain panels.
 */
export function panelAnchorOf(id: string): string | undefined {
  return NAV.find(item => item.id === id)?.anchor
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
