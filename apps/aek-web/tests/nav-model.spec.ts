/**
 * Shared navigation model: the two-level rail contract and the family-of-panel
 * resolution the per-plugin route rail (PluginSubNav) and the main rail both
 * depend on.
 *
 * Pins the Z round ruling in machine-checkable form:
 * - the main rail never surfaces `subOf` entries (NAV_TOP);
 * - a family root answers itself, a family ROUTE answers its parent, and a
 *   plain panel answers nothing (the route case was the direction bug of
 *   2026-11-14: "entries nested under X" ≠ "X's parent").
 *
 * @module aek-home/tests/nav-model.spec
 */
import { describe, expect, it } from 'vitest'
import { NAV, NAV_TOP, panelFamilyOf, subEntriesOf } from '../src/client/nav-model.ts'

describe('nav-model: two-level rail contract', () => {
  it('lists every panel exactly once', () => {
    const ids = NAV.map(entry => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps sub-entries out of the top-level rail', () => {
    const topIds = NAV_TOP.map(entry => entry.id)
    for (const entry of NAV) {
      if (entry.subOf === undefined) expect(topIds).toContain(entry.id)
      else expect(topIds).not.toContain(entry.id)
    }
  })

  it('every sub-entry hangs off an existing family root', () => {
    for (const entry of NAV.filter(item => item.subOf !== undefined)) {
      expect(NAV.some(root => root.id === entry.subOf && root.subOf === undefined)).toBe(true)
    }
  })
})

describe('nav-model: subEntriesOf', () => {
  it('answers the routes of a family root', () => {
    const websearch = subEntriesOf('websearch')
    expect(websearch.map(entry => entry.id)).toEqual(['websearchSettings'])
  })

  it('answers nothing for plain panels and for routes', () => {
    expect(subEntriesOf('plugins')).toEqual([])
    expect(subEntriesOf('websearchSettings')).toEqual([])
  })
})

describe('nav-model: panelFamilyOf', () => {
  it('a family root with routes answers itself', () => {
    expect(panelFamilyOf('websearch')).toBe('websearch')
  })

  it('a family ROUTE answers its parent (the 2026-11-14 direction bug)', () => {
    expect(panelFamilyOf('websearchSettings')).toBe('websearch')
  })

  it('plain panels have no family', () => {
    for (const id of ['runtime', 'plugins', 'skills', 'prompts', 'settings', 'about'] as const) {
      expect(panelFamilyOf(id)).toBeUndefined()
    }
  })
})
