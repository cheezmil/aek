import { describe, expect, it } from 'vitest'
import type { AgentInfo, DistributionBySkill, SkillRow } from '../../src/useSkills.ts'
import { agentSkillCounts, skillsForAgent, skillsNotForAgent, syncCoverage } from '../../src/skill-manager/domain/workspace.ts'

const agents: AgentInfo[] = [
  { id: 'opencode', label: 'OpenCode', detected: true },
  { id: 'cline', label: 'Cline', detected: false },
]

const skills: SkillRow[] = [
  { name: 'alpha', title: 'Alpha', category: 'experimental', tags: [], categories: [], consumers: [], description: '', source: null, archived: false },
  { name: 'beta', title: 'Beta', category: 'experimental', tags: [], categories: [], consumers: [], description: '', source: null, archived: false },
]

const bySkill: DistributionBySkill = {
  alpha: { agents: ['opencode'], targets: [] },
  beta: { agents: ['opencode', 'cline'], targets: [] },
}

describe('skillsForAgent', () => {
  it('keeps only the agent-wired skills, catalog order', () => {
    expect(skillsForAgent(skills, bySkill, 'cline').map(s => s.name)).toEqual(['beta'])
  })

  it('unknown agent = empty (absent wiring never counts as installed)', () => {
    expect(skillsForAgent(skills, bySkill, 'unknown')).toEqual([])
  })
})

describe('skillsNotForAgent', () => {
  it('inverts the agent filter', () => {
    expect(skillsNotForAgent(skills, bySkill, 'cline').map(s => s.name)).toEqual(['alpha'])
  })
})

describe('agentSkillCounts', () => {
  it('counts installed skills per catalog agent, zero-initialised', () => {
    expect([...agentSkillCounts(agents, skills, bySkill).entries()]).toEqual([
      ['opencode', 2],
      ['cline', 1],
    ])
  })

  it('unknown distribution agent ids do not leak into the map', () => {
    const by = { alpha: { agents: ['opencode', 'ghost'], targets: [] } }
    expect(agentSkillCounts(agents, skills, by).has('ghost')).toBe(false)
  })
})

describe('syncCoverage', () => {
  it('covered = agents carrying >=1 skill', () => {
    expect(syncCoverage(agents, skills, bySkill)).toEqual({ covered: 2, total: 2 })
  })

  it('no wiring = 0 covered', () => {
    expect(syncCoverage(agents, skills, {})).toEqual({ covered: 0, total: 2 })
  })

  it('empty catalog = 0/0', () => {
    expect(syncCoverage([], skills, bySkill)).toEqual({ covered: 0, total: 0 })
  })
})
