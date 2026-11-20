/**
 * Rail extras: plugin-driven collapsible sections for a plugin-family's
 * secondary rail (the host `PluginSubNav`), BH round Plan C.
 *
 * The host rail is data-driven off `nav-model` sub-entries (flat route rows),
 * which cannot express a plugin's dynamic sections (e.g. the Skill Manager's
 * Preset list + 全局工作区 agent sub-list, with per-agent brand icons). The
 * plugin-side panel fills this small reactive store; the host rail subscribes
 * and renders the extras sections below the flat rows for that family.
 *
 * Both sides live in the same aek-web app, so rows may carry a `ReactNode`
 * icon (the panel builds `<AgentIcon/>` itself) — no host→plugin data leak.
 */
import { useSyncExternalStore } from 'react'

import type { ReactNode } from 'react'

export interface RailExtraRow {
  /** Stable row id (used as the React key). */
  id: string
  /** Row label text. */
  label: string
  /** Leading glyph; a `ReactNode` (e.g. the panel's `<AgentIcon/>`). */
  icon?: ReactNode
  /** Optional trailing count badge (rendered only when > 0). */
  badge?: number | null
  /** Whether this row is the active one (rail highlight). */
  active?: boolean
  /** Fired when the row is clicked (the panel routes it to its own view). */
  onClick?: () => void
  /** Extra className for the row. */
  className?: string
}

export interface RailExtraSection {
  /** Stable section key (React key + collapse-state key). */
  key: string
  /** Section heading label. */
  title: string
  /** The section's rows. */
  rows: RailExtraRow[]
  /** Open by default when first rendered. @default true */
  defaultOpen?: boolean
}

type SectionStore = ReadonlyArray<RailExtraSection>

const sectionsByFamily = new Map<string, SectionStore>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => { listener() })
}

/**
 * The stable render-relevant shape of a section list. `icon` (a live
 * `ReactNode` whose owner Fiber is circular in dev) and `onClick` are
 * dropped: identity, label, badge, active flag and row styling alone
 * decide whether the rail has to re-render.
 */
function stableShape(sections: SectionStore): string {
  return JSON.stringify(sections.map(section => ({
    key: section.key,
    title: section.title,
    defaultOpen: section.defaultOpen ?? null,
    rows: section.rows.map(row => [
      row.id,
      row.label,
      row.badge ?? null,
      row.active ? 1 : 0,
      row.className ?? '',
    ]),
  })))
}

/**
 * Fill (or clear) the extras sections a family contributes to its rail.
 * @param family - the nav-family id (e.g. `skills`).
 * @param sections - the sections to render; pass `[]` to clear.
 */
export function setRailExtras(family: string, sections: SectionStore) {
  const next: SectionStore = sections.length > 0 ? sections : []
  if (stableShape(sectionsByFamily.get(family) ?? []) === stableShape(next)) return
  sectionsByFamily.set(family, next)
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(family: string): SectionStore {
  return sectionsByFamily.get(family) ?? EMPTY_SECTIONS
}

const EMPTY_SECTIONS: SectionStore = []

/**
 * The extras sections currently registered for a family.
 * @param family - the nav-family id whose rail sections to read.
 */
export function useRailExtras(family: string): SectionStore {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(family),
    () => getSnapshot(family),
  )
}
