/**
 * Bare-command regression for the `aeksm` bin: per the bare-command testing
 * rule (2026-11-12) specs invoke the CLI by its PATH name, never by a
 * repo-relative path. The dev link is a symlink of `bin/aeksm` (a POSIX
 * shim that delegates to `bin/aeksm.mjs`) onto PATH (e.g. `~/.local/bin`);
 * a missing bare command is an environment precondition failure, reported
 * as such.
 *
 * @module aek-skill-manager/tests/cli-bare.spec
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

function runBare(command: string, ...argv: string[]) {
  const out = spawnSync(command, argv, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 120_000,
  })
  if (out.error !== undefined && 'code' in out.error && out.error.code === 'ENOENT') {
    throw new Error(
      `bare CLI command '${command}' is not on PATH. `
      + 'Environment precondition: link the repo bin (`bin/aeksm`) into a PATH '
      + 'directory (e.g. ~/.local/bin). Without the bare command this spec '
      + 'cannot test the real entry.',
    )
  }
  return { code: out.status, text: `${out.stdout ?? ''}\n${out.stderr ?? ''}` }
}

describe('bare `aeksm` CLI', () => {
  it('bare aeksm resolves and serves --help (environment precondition)', () => {
    const { code, text } = runBare('aeksm', '--help')
    expect(code).toBe(0)
    expect(text).toContain('aeksm')
    expect(text).not.toContain('Node.js v')
  })

  it('an unknown subcommand fails cleanly (no wrapper crash dump)', () => {
    const { code, text } = runBare('aeksm', 'definitely-not-a-command')
    expect(code).not.toBe(0)
    expect(text).toContain('unknown command')
    expect(text).not.toContain('Node.js v')
  })
})
