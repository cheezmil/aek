/**
 * The archive confirm copy (the reference's destructive-delete ConfirmDialog,
 * re-voiced for the aeksm engine: there is no delete, only a non-destructive
 * archive that `aeksm adopt` can restore). The consequence line counts how
 * many skills move to the archive and how many agent links come with them,
 * so the operator knows exactly what a confirm will touch.
 */
export interface ArchiveConsequence {
  skillCount: number
  agentCount: number
  recoverable: boolean
}

/**
 * @param skills - the skills about to be archived.
 * @param agentLinks - per-skill observed agent links (how many go with them).
 */
export function archiveConsequence(
  skills: readonly string[],
  agentLinks: ReadonlyArray<{ skill: string; agents: readonly string[] }>,
): ArchiveConsequence {
  const agentCount = agentLinks.reduce((sum, entry) => {
    if (!skills.includes(entry.skill)) return sum
    return sum + entry.agents.length
  }, 0)
  return { skillCount: skills.length, agentCount, recoverable: true }
}
