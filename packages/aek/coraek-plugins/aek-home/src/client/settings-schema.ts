/**
 * The SINGLE source of truth for every user-adjustable console setting.
 *
 * Design borrowed from the schema-form projects compared on 2026-11-09
 * (`rjsf-team/react-jsonschema-form`, `vantezzen/autoform`,
 * `eclipsesource/jsonforms`, `vazco/uniforms`): one declarative field
 * descriptor drives validation, the rendered control, the host key, the CSS
 * custom property and the reset value. Adding a setting means adding ONE row
 * here — no component edit, no hardcoded value in a JSX tree.
 *
 * We deliberately do NOT install one of those frameworks: AEK stores flat JSON
 * primitives in `<AEK_HOME>/preferences/aek-home.json`, uses CSS Modules, and
 * needs bespoke "slider + number box" controls. A ~100-line field registry is
 * the honest amount of machinery for that shape.
 *
 * @module @cheezmil/aek-home/src/client/settings-schema
 */
import type { PrefValue } from './preferences.tsx'

/** The four control shapes the generated settings page knows how to render. */
export type SettingKind = 'toggle' | 'range' | 'text' | 'select'

/** One select option. */
export interface SettingOption {
  /** Stored value. */
  value: string
  /** i18n key of its label. */
  labelKey: string
}

/** One declarative setting. */
export interface SettingField {
  /** Host preference key (`aek-home.*`). */
  key: string
  /** Which control to render. */
  kind: SettingKind
  /** Group id, used only for headings + in-page search. */
  group: 'sidebar' | 'navigation' | 'general' | 'websearch'
  /** i18n key of the visible label. */
  labelKey: string
  /** i18n key of the hint under the control. */
  hintKey?: string
  /** Value used until the host answers, and on reset. */
  default: PrefValue
  /** Range lower bound (may be negative). */
  min?: number
  /** Range upper bound. */
  max?: number
  /** Range step. */
  step?: number
  /** Unit suffix shown next to the number box. */
  unit?: string
  /** CSS custom property the value is written to, with `unit` appended. */
  cssVar?: string
  /** Select options. */
  options?: readonly SettingOption[]
}

/** All settings, in the order they appear on the generated page. */
export const SETTINGS_SCHEMA: readonly SettingField[] = [
  {
    key: 'aek-home.sidebarFontSize', kind: 'range', group: 'sidebar',
    labelKey: 'settings.sidebarFontSize', hintKey: 'settings.sidebarFontSizeHint',
    default: 14, min: 10, max: 24, step: 1, unit: 'px', cssVar: '--aek-sidebar-font-size',
  },
  {
    key: 'aek-home.sidebarWidth', kind: 'range', group: 'sidebar',
    labelKey: 'settings.sidebarWidth', hintKey: 'settings.sidebarWidthHint',
    default: 248, min: 180, max: 360, step: 2, unit: 'px', cssVar: '--aek-sidebar-width',
  },
  {
    key: 'aek-home.sidebarPadX', kind: 'range', group: 'sidebar',
    labelKey: 'settings.sidebarPadX', default: 14, min: 4, max: 32, step: 1,
    unit: 'px', cssVar: '--aek-sidebar-pad-x',
  },
  {
    key: 'aek-home.sidebarPadY', kind: 'range', group: 'sidebar',
    labelKey: 'settings.sidebarPadY', default: 10, min: 4, max: 28, step: 1,
    unit: 'px', cssVar: '--aek-sidebar-pad-y',
  },
  {
    key: 'aek-home.sidebarGap', kind: 'range', group: 'sidebar',
    labelKey: 'settings.sidebarGap', default: 6, min: 0, max: 20, step: 1,
    unit: 'px', cssVar: '--aek-sidebar-gap',
  },
  {
    key: 'aek-home.sidebarIconGap', kind: 'range', group: 'sidebar',
    labelKey: 'settings.sidebarIconGap', default: 10, min: 0, max: 24, step: 1,
    unit: 'px', cssVar: '--aek-sidebar-icon-gap',
  },
  {
    key: 'aek-home.sidebarRadius', kind: 'range', group: 'sidebar',
    labelKey: 'settings.sidebarRadius', default: 10, min: 0, max: 24, step: 1,
    unit: 'px', cssVar: '--aek-sidebar-radius',
  },
  {
    // A signed slider: negative values tighten the letter spacing, positive
    // values loosen it. Demonstrates the +/- range the user asked for.
    key: 'aek-home.sidebarLetterSpacing', kind: 'range', group: 'sidebar',
    labelKey: 'settings.sidebarLetterSpacing', default: 0, min: -2, max: 8, step: 0.5,
    unit: 'px', cssVar: '--aek-sidebar-letter-spacing',
  },
  {
    key: 'aek-home.logoVisible', kind: 'toggle', group: 'sidebar',
    labelKey: 'settings.logoVisible', hintKey: 'settings.logoVisibleHint', default: true,
  },
  {
    // X round: the W-round horizontal scroll added a bottom scrollbar the user
    // wants GONE by default (content still scrolls); this toggle brings it back.
    key: 'aek-home.sidebarHScroll', kind: 'toggle', group: 'sidebar',
    labelKey: 'settings.sidebarHScroll', hintKey: 'settings.sidebarHScrollHint', default: false,
  },
  {
    key: 'aek-home.logoVariant', kind: 'select', group: 'sidebar',
    labelKey: 'settings.logoVariant', default: 'mark',
    options: [
      { value: 'mark', labelKey: 'settings.logoVariant.mark' },
      { value: 'round', labelKey: 'settings.logoVariant.round' },
      { value: 'square', labelKey: 'settings.logoVariant.square' },
      { value: 'text', labelKey: 'settings.logoVariant.text' },
    ],
  },
  {
    key: 'aek-home.brandText', kind: 'text', group: 'sidebar',
    labelKey: 'settings.brandText', hintKey: 'settings.brandTextHint', default: 'AEK',
  },
  {
    key: 'aek-home.logoToggle', kind: 'toggle', group: 'navigation',
    labelKey: 'settings.logoToggle', hintKey: 'settings.logoToggleHint', default: true,
  },
  {
    key: 'aek-home.hoverExpand', kind: 'toggle', group: 'navigation',
    labelKey: 'settings.hover', hintKey: 'settings.hoverHint', default: true,
  },
  {
    key: 'aek-home.drawerExpanded', kind: 'toggle', group: 'navigation',
    labelKey: 'settings.drawerExpanded', hintKey: 'settings.drawerExpandedHint', default: true,
  },
  {
    // Y round: the sidebar's floating refresh/pin action box fades in and out
    // on hover; this switch turns the animation off (instant show / hide).
    key: 'aek-home.navActionsFade', kind: 'toggle', group: 'navigation',
    labelKey: 'settings.navActionsFade', hintKey: 'settings.navActionsFadeHint', default: true,
  },
  {
    // Disabling a plugin takes its routes down immediately, so the switch asks
    // for a second click by default. Users who disable plugins often can turn
    // that off here instead of being stuck with a confirm step forever.
    key: 'aek-home.confirmPluginDisable', kind: 'toggle', group: 'general',
    labelKey: 'settings.confirmPluginDisable', hintKey: 'settings.confirmPluginDisableHint',
    default: true,
  },
  {
    key: 'aek-home.keyRetentionDays', kind: 'range', group: 'general',
    labelKey: 'settings.keyRetentionDays', hintKey: 'settings.keyRetentionDaysHint',
    default: 7, min: 1, max: 90, step: 1, unit: 'd',
  },
  {
    // Path display style (Q round): the console shows host-absolute paths
    // (providers.yml, plugin dirs, …). The default shortens the home prefix to
    // `~/` (posix) or `%USERPROFILE%\` (Windows, backslashes); "full" keeps the
    // raw absolute path. Copy buttons always copy the RAW path.
    key: 'aek-home.pathStyle', kind: 'select', group: 'general',
    labelKey: 'settings.pathStyle', hintKey: 'settings.pathStyleHint',
    default: 'abbreviated',
    options: [
      { value: 'abbreviated', labelKey: 'settings.pathStyle.abbreviated' },
      { value: 'full', labelKey: 'settings.pathStyle.full' },
    ],
  },
  {
    // A round: the per-plugin route rail (PluginSubNav) width. Dragging the
    // rail's right edge writes this pref; the CSS variable below carries the
    // number into the layout, same as every other sidebar metric.
    key: 'aek-home.pluginRailWidth', kind: 'range', group: 'sidebar',
    labelKey: 'settings.pluginRailWidth', hintKey: 'settings.pluginRailWidthHint',
    default: 200, min: 140, max: 360, step: 2, unit: 'px', cssVar: '--aek-plugin-rail-width',
  },
  {
    // A round addendum: the compact icon-only column width used while the
    // rail's labels are hidden. Settings-owned (no CSS variable — the value
    // drives PluginSubNav's layout property directly).
    key: 'aek-home.pluginRailCompactWidth', kind: 'range', group: 'sidebar',
    labelKey: 'settings.pluginRailCompactWidth', hintKey: 'settings.pluginRailCompactWidthHint',
    default: 64, min: 48, max: 96, step: 2, unit: 'px',
  },
  {
    // A round: base switch for the plugin route rail's bottom operation hint
    // ("single-click the main rail row = show/hide this rail; double-click =
    // hide the labels"). The hint can also be dismissed inline with its ×;
    // flipping this ON re-arms it.
    key: 'aek-home.railHint', kind: 'toggle', group: 'navigation',
    labelKey: 'settings.railHint', hintKey: 'settings.railHintHint', default: true,
  },
]

/**
 * Plugin-owned setting rows (Q round: "each plugin gets its own settings
 * page, not one giant Settings page"). A page appears only when a plugin
 * actually has user-facing settings — no empty shells. The Web Search plugin
 * owns the ranking refresh interval; its display filters stay on the search
 * page itself.
 */
export const WEBSEARCH_SETTINGS_SCHEMA: readonly SettingField[] = [
  {
    // Y round: the "不进行任何排行分类" switch — when on, the Web Search page
    // shows a flat provider list: no tier groups, no ranks, no filters and
    // no ranking traffic at all (the refresh interval below is moot).
    key: 'aek-home.websearch.noRanking', kind: 'toggle', group: 'websearch',
    labelKey: 'settings.websearchNoRanking', hintKey: 'settings.websearchNoRankingHint', default: false,
  },
  {
    key: 'aek-home.websearch.rankingTtlHours', kind: 'range', group: 'websearch',
    labelKey: 'settings.websearchRankingTtl', hintKey: 'settings.websearchRankingTtlHint',
    default: 24, min: 1, max: 168, step: 1, unit: 'h',
  },
]

/**
 * Every schema row that participates in "restore defaults" (Q round: the
 * reset backs up the live settings file first, then writes these defaults;
 * the undo banner calls the host restore route).
 * @returns the combined base + plugin rows.
 */
export function allSettingFields(): readonly SettingField[] {
  return [...SETTINGS_SCHEMA, ...WEBSEARCH_SETTINGS_SCHEMA]
}

/**
 * Clamp and round one raw value to a field's declared range.
 * @param field - the field descriptor.
 * @param raw - untrusted value (from the host or a number input).
 * @returns a valid value for the field.
 */
export function coerce(field: SettingField, raw: unknown): PrefValue {
  if (field.kind === 'toggle') return raw === true || raw === 'true' ? true : (raw === false || raw === 'false' ? false : field.default)
  if (field.kind === 'range') {
    const numeric = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(numeric)) return field.default
    const min = field.min ?? 0
    const max = field.max ?? 100
    return Math.min(max, Math.max(min, numeric))
  }
  if (field.kind === 'select') {
    const value = typeof raw === 'string' ? raw : field.default
    return field.options?.some(option => option.value === value) === true ? value : field.default
  }
  return typeof raw === 'string' ? raw : field.default
}

/**
 * Build the inline CSS custom properties for the sidebar from the current
 * settings map. Only fields declaring `cssVar` contribute.
 * @param values - current settings.
 * @returns a React-compatible style record with custom properties.
 */
export function sidebarCssVars(values: Record<string, PrefValue>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of SETTINGS_SCHEMA) {
    if (field.cssVar === undefined) continue
    const value = coerce(field, values[field.key] ?? field.default)
    out[field.cssVar] = `${String(value)}${field.unit ?? ''}`
  }
  return out
}
