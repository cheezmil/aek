/**
 * The library filter pill row: the hub's category vocabulary as count pills,
 * the synthetic untagged bucket, the per-source-type pills, and the row
 * filter they drive.
 *
 * @module aek-web/tests/skill-manager/categoryPills.spec
 */
import { describe, expect, it } from 'vitest'
import { UNTAGGED, buildCategoryPills, buildSourcePills, filterByPills } from '../../src/skill-manager/domain/categoryPills.ts'
import type { CategoryCount, SkillRow } from '../../src/useSkills.ts'

function skill(name: string, categories: string[] = [], source?: NonNullable<SkillRow['source']>): SkillRow {
  return {
    name,
    title: name,
    category: categories[0] ?? 'experimental',
    tags: [],
    categories,
    consumers: [],
    description: '',
    source: source ?? null,
    archived: false,
  }
}

describe('buildCategoryPills', () => {
  it('orders by count (ties alphabetical) and appends the untagged bucket last-in-order rules', () => {
    const skills = [
      skill('a', ['web']),
      skill('b', ['web', 'ops']),
      skill('c', []),
      skill('d', []),
      skill('e', ['ops']),
    ]
    const counts: CategoryCount[] = [
      { category: 'web', count: 2 },
      { category: 'ops', count: 2 },
      { category: 'infra', count: 1 },
    ]
    const pills = buildCategoryPills(skills, counts)
    expect(pills.map(pill => pill.label)).toEqual(['ops', UNTAGGED, 'web', 'infra'])
    expect(pills[1].count).toBe(2)
    expect(pills[1].untagged).toBe(true)
  })

  it('omits the untagged bucket when every skill carries a category', () => {
    const skills = [skill('a', ['web'])]
    expect(buildCategoryPills(skills, [{ category: 'web', count: 1 }]).map(pill => pill.label)).toEqual(['web'])
  })

  it('yields an empty row for an empty hub', () => {
    expect(buildCategoryPills([], [])).toEqual([])
  })
})

describe('buildSourcePills', () => {
  it('buckets by source type (absent source = local), ordered by count then name', () => {
    const skills = [
      skill('a'),
      skill('b', [], { type: 'git', url: 'https://example.com/repo.git' }),
      skill('c', [], { type: 'git', url: 'https://example.com/other.git' }),
      skill('d', [], { type: 'github' }),
      skill('e'),
    ]
    expect(buildSourcePills(skills)).toEqual([
      { type: 'git', count: 2 },
      { type: 'local', count: 2 },
      { type: 'github', count: 1 },
    ])
  })
})

describe('filterByPills', () => {
  const skills = [
    skill('a', ['web']),
    skill('b', ['web', 'ops']),
    skill('c', []),
    skill('d', ['ops']),
  ]

  it('passes everything with no active pills', () => {
    expect(filterByPills(skills, new Set())).toHaveLength(4)
  })

  it('matches categories with an intersection (a skill in two active buckets passes once)', () => {
    expect(filterByPills(skills, new Set(['web', 'ops']))).toHaveLength(3)
  })

  it('treats the untagged key as the category-less bucket only', () => {
    expect(filterByPills(skills, new Set([UNTAGGED]))).toEqual([skills[2]])
  })

  it('mixes untagged with real categories (original order preserved)', () => {
    expect(filterByPills(skills, new Set([UNTAGGED, 'ops']))).toEqual([skills[1], skills[2], skills[3]])
  })
})
