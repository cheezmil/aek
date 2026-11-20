import { describe, expect, it } from 'vitest'
import { filterSkills } from '../../src/skill-manager/domain/filterSkills'

const skills = [
  { name: 'tdd', category: 'coding', description: 'Test-driven development' },
  { name: 'github-trending', category: 'research', description: 'GitHub trending dashboards' },
  { name: 'math-geometry-lab', category: 'education', description: '几何互动课件' },
]

describe('filterSkills', () => {
  it('passes every skill through on an empty query', () => {
    expect(filterSkills(skills, '')).toEqual(skills)
    expect(filterSkills(skills, '   ')).toEqual(skills)
  })

  it('matches by name', () => {
    expect(filterSkills(skills, 'tdd').map(skill => skill.name)).toEqual(['tdd'])
  })

  it('matches by category, case-insensitively', () => {
    expect(filterSkills(skills, 'RESEARCH').map(skill => skill.name)).toEqual(['github-trending'])
  })

  it('matches by description, including non-ASCII text', () => {
    expect(filterSkills(skills, '几何').map(skill => skill.name)).toEqual(['math-geometry-lab'])
  })

  it('requires every whitespace-separated term to match somewhere', () => {
    expect(filterSkills(skills, 'github trending')).toHaveLength(1)
    expect(filterSkills(skills, 'github nomatch')).toHaveLength(0)
  })

  it('returns nothing when nothing matches, so the empty state can blame the filter', () => {
    expect(filterSkills(skills, 'nope')).toEqual([])
  })

  it('also searches the optional title, tags, and source fields', () => {
    const extended = [
      {
        name: 'web',
        category: 'devops',
        description: 'plain',
        title: 'Web tooling',
        tags: ['frontend', 'spa'],
        source: { type: 'git', url: 'https://github.com/owner/repo' },
      },
    ]
    expect(filterSkills(extended, 'web tooling').map(skill => skill.name)).toEqual(['web'])
    expect(filterSkills(extended, 'SPA').map(skill => skill.name)).toEqual(['web'])
    expect(filterSkills(extended, 'github.com').map(skill => skill.name)).toEqual(['web'])
    expect(filterSkills(extended, 'frontend git').map(skill => skill.name)).toEqual(['web'])
    expect(filterSkills(extended, 'kubernetes')).toEqual([])
  })
})
