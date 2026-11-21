/**
 * Library filter pill row (the xingkongliang IA's tag/source pill line,
 * rewritten in our own domain tier): the hub's category vocabulary as
 * count pills, the synthetic "untagged" bucket, the per-source-type pills,
 * and the row filter they drive.
 *
 * Categories are the engine's OPERABLE axis (ADR-0015) — the pill row reads
 * `GET /api/aek/skills/categories` (the registry's authority) and the write
 * face is `POST /api/aek/skills/categories`. Source pills are derived, not
 * stored: a skill's `source.type` (absent = local), grouped client-side.
 */
import type { CategoryCount, SkillRow } from '../../useSkills.ts'

/** The synthetic untagged bucket's stable key (never a real category). */
export const UNTAGGED = 'untagged'

/** One filter pill (a category vocabulary entry or the untagged bucket). */
export interface CategoryPill {
  key: string
  label: string
  count: number
  untagged: boolean
}

/** One source-type pill (derived from `SkillRow.source.type`). */
export interface SourcePill {
  type: string
  count: number
}

/**
 * The category pill row, in display order: the engine's vocabulary by
 * count (ties: alphabetical), then the untagged bucket when it is
 * non-empty. An empty hub yields `[]` — the row hides itself.
 */
export function buildCategoryPills(
  skills: readonly SkillRow[],
  counts: readonly CategoryCount[],
): CategoryPill[] {
  const pills: CategoryPill[] = counts.map(entry => ({
    key: entry.category,
    label: entry.category,
    count: entry.count,
    untagged: false,
  }))
  const untagged = skills.filter(skill => skill.categories.length === 0).length
  if (untagged > 0) pills.push({ key: UNTAGGED, label: UNTAGGED, count: untagged, untagged: true })
  return pills.sort((a, b) => (a.count === b.count ? a.label.localeCompare(b.label) : b.count - a.count))
}

/**
 * The source-type pills, by count (ties: alphabetical). A skill without a
 * `source` (or without its `type`) buckets as `local`.
 */
export function buildSourcePills(skills: readonly SkillRow[]): SourcePill[] {
  const byType = new Map<string, number>()
  for (const skill of skills) {
    const type = skill.source?.type ?? 'local'
    byType.set(type, (byType.get(type) ?? 0) + 1)
  }
  return [...byType.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => (a.count === b.count ? a.type.localeCompare(b.type) : b.count - a.count))
}

/**
 * Apply the selected pills to the row: a skill passes when its categories
 * intersect the active set — the untagged bucket matches exactly the
 * category-less skills. No active pills = every skill passes (the row is
 * off, not an empty selection).
 */
export function filterByPills<T extends SkillRow>(skills: readonly T[], active: ReadonlySet<string>): T[] {
  if (active.size === 0) return [...skills]
  const wantsUntagged = active.has(UNTAGGED)
  const wanted = [...active].filter(key => key !== UNTAGGED)
  return skills.filter((skill) => {
    const categories = skill.categories
    if (categories.length === 0) return wantsUntagged
    if (wanted.length === 0) return false
    return categories.some(category => wanted.includes(category))
  })
}
