/**
 * BS round (m11967 item 1): the FIRST-level rail (Sidebar) and the SECOND-level
 * rail (PluginSubNav) must show the SAME search box — identical height,
 * background, border, icon, type size and focus treatment. One constant set,
 * two call sites; per-rail layout-only overrides (compact/labelsHidden) stay
 * at the call site and merge over these.
 *
 * Target spec (both rails, read off the pre-BS first-level box):
 *   wrap   h-9, gap-2, px-2, rounded-sm, border-border, bg-surface-subtle,
 *          focus-within:border-accent-border focus-within:bg-card
 *   icon   search 16, text-text-muted, shrink-0
 *   input  text-xs-plus (13px), transparent, no border/outline
 */
export const RAIL_SEARCH_WRAP =
  'relative flex flex-none items-center gap-2 h-9 mb-4 rounded-sm border border-border bg-surface-subtle px-2 transition-[border-color,background-color] duration-150 ease-aek focus-within:border-accent-border focus-within:bg-card'
export const RAIL_SEARCH_ICON = 'inline-flex shrink-0 text-text-muted'
export const RAIL_SEARCH_INPUT =
  'min-w-0 flex-1 h-full p-0 max-w-50 bg-transparent border-0 text-text text-xs-plus placeholder:text-text-muted outline-none transition-opacity duration-150 ease-aek'
