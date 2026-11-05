/**
 * The AEK command namespace guard: AEK plugins are operated only through
 * `aek`-prefixed commands, and the copied upstream's `dsh` prefix is refused
 * in code rather than in a note.
 *
 * The launcher-side twin lives in `scripts/aek/command-namespace.mjs`; both
 * sides must agree on the same inputs, so this suite asserts the shared
 * behaviour and the pair's agreement.
 */

import { describe, expect, it } from 'vitest'
import {
  AEK_COMMAND_PREFIX,
  assertAekCommand,
  CommandNamespaceError,
  FORBIDDEN_COMMAND_HINT,
  FORBIDDEN_COMMAND_PREFIXES,
  forbiddenCommandMessage,
  isAekCommand,
  isForbiddenDshCommand,
} from '../src/command-namespace.ts'

describe('command namespace constants', () => {
  it('names aek as the only legal prefix', () => {
    expect(AEK_COMMAND_PREFIX).toBe('aek')
  })

  it('forbids exactly the legacy dsh prefix', () => {
    expect([...FORBIDDEN_COMMAND_PREFIXES]).toEqual(['dsh'])
  })

  it('names a usable replacement in its hint', () => {
    expect(FORBIDDEN_COMMAND_HINT).toContain('aek web')
  })
})

describe('isForbiddenDshCommand', () => {
  it('rejects the bare legacy command', () => {
    expect(isForbiddenDshCommand('dsh')).toBe(true)
    expect(isForbiddenDshCommand('dsh web')).toBe(true)
    expect(isForbiddenDshCommand('DSH')).toBe(true)
  })

  it('rejects legacy-prefixed commands', () => {
    expect(isForbiddenDshCommand('dsh-pack-vfs-image')).toBe(true)
    expect(isForbiddenDshCommand('/usr/local/bin/dsh-helper')).toBe(true)
  })

  it('accepts the AEK namespace', () => {
    expect(isForbiddenDshCommand('aek')).toBe(false)
    expect(isForbiddenDshCommand('aek web')).toBe(false)
    expect(isForbiddenDshCommand('aekws search')).toBe(false)
    expect(isForbiddenDshCommand('aeksm status')).toBe(false)
    expect(isForbiddenDshCommand('aekpm status')).toBe(false)
  })

  it('does not mistake a scoped npm package name for a command', () => {
    expect(isForbiddenDshCommand('@deepseek-ai/dsh-desktop')).toBe(false)
  })
})

describe('isAekCommand', () => {
  it('accepts every aek-prefixed command', () => {
    expect(isAekCommand('aek')).toBe(true)
    expect(isAekCommand('aekws')).toBe(true)
    expect(isAekCommand('aeksm')).toBe(true)
    expect(isAekCommand('/usr/local/bin/aek')).toBe(true)
  })

  it('rejects a non-aek command', () => {
    expect(isAekCommand('dsh')).toBe(false)
    expect(isAekCommand('npm')).toBe(false)
  })
})

describe('assertAekCommand', () => {
  it('passes the AEK commands', () => {
    expect(() => assertAekCommand('aek')).not.toThrow()
    expect(() => assertAekCommand('aekws search')).not.toThrow()
  })

  it('throws on a legacy command', () => {
    expect(() => assertAekCommand('dsh web')).toThrow(CommandNamespaceError)
    expect(() => assertAekCommand('dsh web')).toThrow(/dsh-prefixed commands are forbidden/)
  })

  it('throws on a command outside the AEK namespace', () => {
    expect(() => assertAekCommand('npm')).toThrow(/must use the "aek" prefix/)
  })
})

describe('forbiddenCommandMessage', () => {
  it('names the refused command and the replacement', () => {
    const message = forbiddenCommandMessage('dsh web')
    expect(message).toContain('dsh')
    expect(message).toContain('aek')
  })
})
