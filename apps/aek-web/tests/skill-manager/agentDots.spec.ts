/**
 * The card footer dots: catalog order kept, "on" = linked, the visible dots
 * cap out at DOT_CAP with the rest collapsed to "+N".
 *
 * @module aek-web/tests/skill-manager/agentDots.spec
 */
import { describe, expect, it } from 'vitest'
import { DOT_CAP, agentDots } from '../../src/skill-manager/domain/agentDots.ts'

const agents = [
  { id: 'a1', label: 'One' },
  { id: 'a2', label: 'Two' },
  { id: 'a3', label: 'Three' },
  { id: 'a4', label: 'Four' },
  { id: 'a5', label: 'Five' },
  { id: 'a6', label: 'Six' },
  { id: 'a7', label: 'Seven' },
  { id: 'a8', label: 'Eight' },
]

describe('agentDots', () => {
  it('marks linked agents on (catalog order kept, unknown ids ignored)', () => {
    const { dots, more } = agentDots(agents, ['a3', 'a7', 'nope'])
    expect(dots.map(dot => dot.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])
    expect(dots.map(dot => dot.on)).toEqual([false, false, true, false, false, false])
    expect(more).toBe(2)
  })

  it('caps the visible dots at DOT_CAP with the +N overflow', () => {
    expect(agentDots(agents.slice(0, 3), []).more).toBe(0)
    expect(agentDots(agents, []).dots).toHaveLength(DOT_CAP)
    expect(agentDots(agents, []).more).toBe(agents.length - DOT_CAP)
  })

  it('yields empty dots for a hub with no agents', () => {
    expect(agentDots([], ['whatever'])).toEqual({ dots: [], more: 0 })
  })
})
