/**
 * The 全局工作区 (agent workspace) + dashboard derivations (the reference's
 * Global Workspace IA, rewritten in our own domain tier): which library
 * skills are live for one agent, which agents a skill reaches, the per-agent
 * counts the sidebar's agent rows show, and the dashboard's three stat cards.
 *
 * Everything derives from the overview's `distributionBySkill` index (the
 * host's per-skill wiring: the agent ids + the physical targets) — no new
 * engine face, P15.
 */
import type { AgentInfo, DistributionBySkill, SkillRow } from '../../useSkills.ts'

/** The skills installed for one agent (catalog order kept, undetected agents included). */
export function skillsForAgent(skills: readonly SkillRow[], bySkill: DistributionBySkill, agentId: string): SkillRow[] {
  return skills.filter(skill => bySkill[skill.name]?.agents?.includes(agentId))
}

/** The skills NOT installed for one agent (the add-to-agent sheet's list). */
export function skillsNotForAgent(skills: readonly SkillRow[], bySkill: DistributionBySkill, agentId: string): SkillRow[] {
  return skills.filter(skill => !bySkill[skill.name]?.agents?.includes(agentId))
}

/** The per-agent installed-skill counts (the sidebar agent rows' badges). */
export function agentSkillCounts(
  agents: readonly AgentInfo[],
  skills: readonly SkillRow[],
  bySkill: DistributionBySkill,
): Map<string, number> {
  const counts = new Map<string, number>()
  const catalog = new Set<string>()
  for (const agent of agents) {
    counts.set(agent.id, 0)
    catalog.add(agent.id)
  }
  for (const skill of skills) {
    if (!(skill.name in bySkill)) continue // stale skill: its wiring left the index
    for (const agentId of bySkill[skill.name].agents) {
      if (!catalog.has(agentId)) continue // stale wiring: the agent left the catalog
      counts.set(agentId, (counts.get(agentId) ?? 0) + 1)
    }
  }
  return counts
}

/** The dashboard's 同步覆盖 stat: how many catalog agents carry at least one
 *  live skill (coverage 0..1, 0 when the catalog is empty). */
export function syncCoverage(
  agents: readonly AgentInfo[],
  skills: readonly SkillRow[],
  bySkill: DistributionBySkill,
): { covered: number; total: number } {
  const counts = agentSkillCounts(agents, skills, bySkill)
  let covered = 0
  for (const value of counts.values()) if (value > 0) covered += 1
  return { covered, total: agents.length }
}
