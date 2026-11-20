/**
 * The archive confirm copy: count the skills that move to the archive and
 * only the agent links that belong to THOSE skills (the operator must see
 * exactly what a confirm touches), plus the recoverable flag (aeksm has no
 * delete — only a non-destructive archive).
 *
 * @module aek-web/tests/skill-manager/archiveAsk.spec
 */
import { describe, expect, it } from 'vitest'
import { archiveConsequence } from '../../src/skill-manager/domain/archiveAsk.ts'

describe('archiveConsequence', () => {
  it('counts only the agent links of the skills being archived', () => {
    const consequence = archiveConsequence(
      ['alpha', 'beta'],
      [
        { skill: 'alpha', agents: ['claude', 'codex'] },
        { skill: 'beta', agents: ['dsh'] },
        { skill: 'gamma', agents: ['claude', 'codex', 'dsh'] },
      ],
    )
    expect(consequence).toEqual({ skillCount: 2, agentCount: 3, recoverable: true })
  })

  it('reports zero agent links when none of the skills are linked anywhere', () => {
    expect(archiveConsequence(['alpha'], [])).toEqual({ skillCount: 1, agentCount: 0, recoverable: true })
    expect(archiveConsequence(['alpha'], [{ skill: 'other', agents: ['claude'] }])).toEqual({
      skillCount: 1,
      agentCount: 0,
      recoverable: true,
    })
  })

  it('stays recoverable even with an empty selection (the engine never deletes)', () => {
    expect(archiveConsequence([], [{ skill: 'alpha', agents: ['claude'] }])).toEqual({
      skillCount: 0,
      agentCount: 0,
      recoverable: true,
    })
  })
})
