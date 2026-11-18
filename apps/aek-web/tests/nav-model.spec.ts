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
 * R2 round (2026-11-18) additions — the second-level rail CONTRACT:
 * - every webui plugin (a `plugins`-drawer family) owns a settings-page
 *   route (`panel.*Settings`);
 * - the three built-in families (`runtime` / `settings` / `about`) own a
 *   non-empty set of section-tab routes;
 * - an ANCHOR route renders the FAMILY's page (panelRenderIdOf) and carries
 *   its in-page position (panelAnchorOf); plain ids answer themselves.
 *
 * @module aek-home/tests/nav-model.spec
 */
import { describe, expect, it } from 'vitest'
import { NAV, NAV_TOP, panelAnchorOf, panelFamilyOf, panelRenderIdOf, subEntriesOf } from '../src/nav-model.ts'

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

  it('plain panels have no family (R2: only the retired bucket id stays plain)', () => {
    // skills / prompts / websearch / icons gained settings-page routes (R2),
    // and runtime / settings / about gained section-tab routes (R2) — they
    // are all family roots now. The retired `plugins` bucket id owns no
    // routes, so it is the only panel that answers "no family".
    expect(panelFamilyOf('plugins')).toBeUndefined()
  })
})

describe('nav-model R2 round: the second-level rail contract', () => {
  it('every webui plugin family owns a settings-page route', () => {
    const webuiFamilies = NAV.filter(entry => entry.subOf === undefined && entry.group === 'plugins')
    expect(webuiFamilies.length).toBeGreaterThan(0)
    for (const family of webuiFamilies) {
      const hasSettings = subEntriesOf(family.id).some(route => /^panel\.[A-Za-z0-9]+Settings$/.test(route.labelKey))
      expect(hasSettings, `family "${family.id}" must own a settings page`).toBe(true)
    }
  })

  it('the built-in families own section-tab routes — except 关于 (version-only)', () => {
    // 2026-11-18 user ruling: the 关于 page carries ONLY the desktop version
    // number, so it owns no sections and no rail. runtime / settings keep
    // their section tabs.
    for (const family of ['runtime', 'settings'] as const) {
      expect(subEntriesOf(family).length, `family "${family}" must own rail routes`).toBeGreaterThan(0)
    }
    expect(subEntriesOf('about').length, 'the 关于 page is version-only and must stay rail-less').toBe(0)
  })

  it('anchored routes position their FAMILY page (render = family, anchor = position)', () => {
    for (const entry of NAV.filter(item => item.anchor !== undefined)) {
      expect(entry.subOf, `anchored route "${entry.id}" must hang off a family`).toBeDefined()
      expect(panelRenderIdOf(entry.id)).toBe(entry.subOf)
      expect(panelAnchorOf(entry.id)).toBe(entry.anchor)
    }
  })

  it('plain panels render themselves', () => {
    for (const id of ['runtime', 'websearch', 'settings', 'about', 'skillsSettings'] as const) {
      expect(panelRenderIdOf(id)).toBe(id)
      expect(panelAnchorOf(id)).toBeUndefined()
    }
  })
})
