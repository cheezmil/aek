/**
 * A round: CJK ↔ Latin auto-spacing (i18n) and the rail-interaction list
 * helpers (nav-model).
 *
 * `spaceMixed` is the typography fix the user demanded on 2026-11-14 ("英文和
 * 中文之间没空格？太难受了"): every visible console string leaves through
 * `t()` / `tf()` spaced at the CJK↔Latin boundary — pure-EN and pure-CJK
 * strings must pass through UNCHANGED (that is the regression this spec pins),
 * and already-spaced text must not double-space.
 *
 * @module aek-home/tests/space-mixed.spec
 */
import { describe, expect, it } from 'vitest'
import { spaceMixed } from '../src/client/i18n.tsx'
import { parseCommaList, toggleInCommaList } from '../src/client/nav-model.ts'

describe('spaceMixed: CJK ↔ Latin auto-spacing', () => {
  it('inserts a space at Latin → CJK ("Web Search首页")', () => {
    expect(spaceMixed('Web Search首页')).toBe('Web Search 首页')
  })

  it('inserts a space at CJK → Latin ("设置Web")', () => {
    expect(spaceMixed('设置Web')).toBe('设置 Web')
  })

  it('inserts at digit ↔ CJK boundaries too', () => {
    expect(spaceMixed('v2版')).toBe('v2 版')
    expect(spaceMixed('3家')).toBe('3 家')
  })

  it('leaves pure-CJK strings untouched', () => {
    expect(spaceMixed('基础设置')).toBe('基础设置')
    expect(spaceMixed('搜索板块')).toBe('搜索板块')
  })

  it('leaves pure-EN strings untouched', () => {
    expect(spaceMixed('Web Search Home')).toBe('Web Search Home')
    expect(spaceMixed('AEK')).toBe('AEK')
  })

  it('never doubles an existing space', () => {
    expect(spaceMixed('Web Search 设置')).toBe('Web Search 设置')
    expect(spaceMixed('Web  Search 首页')).toBe('Web  Search 首页')
  })

  it('does not space after CJK punctuation', () => {
    expect(spaceMixed('侧栏，Web')).toBe('侧栏，Web')
  })
})

describe('rail interaction list helpers (A round)', () => {
  it('parseCommaList tolerates missing / wrong-typed values', () => {
    expect(parseCommaList(undefined)).toBe('')
    expect(parseCommaList('websearch')).toBe('websearch')
    expect(parseCommaList(true)).toBe('')
  })

  it('toggleInCommaList adds, then removes, keeping the rest', () => {
    expect(toggleInCommaList('', 'websearch')).toBe('websearch')
    expect(toggleInCommaList('websearch', 'websearch')).toBe('')
    expect(toggleInCommaList('websearch,plugins', 'plugins')).toBe('websearch')
    expect(toggleInCommaList('websearch', 'skills')).toBe('websearch,skills')
  })

  it('survives stored noise (empty parts, stray commas)', () => {
    expect(toggleInCommaList(',websearch,,', 'plugins')).toBe('websearch,plugins')
    expect(toggleInCommaList(',websearch,,', 'websearch')).toBe('')
  })
})
