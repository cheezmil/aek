/**
 * The per-agent sync dots on a card (the reference's SyncDots footer row,
 * rewritten for our distribution wiring): the hub's agents in catalog
 * order, a filled dot means the skill is linked to that agent, the visible
 * dots cap out and the overflow collapses to "+N".
 */

/** One dot: a catalog agent + whether the skill is currently linked there. */
export interface AgentDot {
  id: string
  label: string
  on: boolean
}

/** The visible-dot cap before the "+N" overflow (the reference's limit 6). */
export const DOT_CAP = 6

/**
 * @param agents - the hub's catalog agents (the dot order).
 * @param distributed - the skill's current agent links (`DistributionBySkill`).
 */
export function agentDots(
  agents: readonly { id: string; label: string }[],
  distributed: readonly string[],
): { dots: AgentDot[]; more: number } {
  const on = new Set(distributed)
  const all: AgentDot[] = agents.map(agent => ({ id: agent.id, label: agent.label, on: on.has(agent.id) }))
  return { dots: all.slice(0, DOT_CAP), more: Math.max(0, all.length - DOT_CAP) }
}
