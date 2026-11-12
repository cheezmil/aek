/**
 * Bare-command regression for the `aek` CLI wrapper (bin/aek.mjs): the dev
 * branch delegates to tsx and must PROPAGATE the child's exit code instead
 * of re-throwing a Node crash dump (the same wrapper-layer bug class as the
 * aekws "炸点", found when CLI tests moved to bare commands). Per the
 * bare-command testing rule (2026-11-12) the spec invokes the CLI by its
 * PATH name, never by a repo-relative path; a missing bare command is an
 * environment precondition failure, reported as such.
 *
 * @module coraek/tests/cli-bare.spec
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

function runBare(command: string, ...argv: string[]) {
  const out = spawnSync(command, argv, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 90_000,
  })
  if (out.error !== undefined && 'code' in out.error && out.error.code === 'ENOENT') {
    throw new Error(
      `bare CLI command '${command}' is not on PATH. `
      + 'Environment precondition: link the repo bin into PATH '
      + '(e.g. ~/.local/bin). Without the bare command this spec cannot test the real entry.',
    )
  }
  return { code: out.status, text: `${out.stdout ?? ''}\n${out.stderr ?? ''}` }
}

describe('bare `aek` CLI wrapper (exit-code propagation)', () => {
  it('bare aek resolves and serves --help (environment precondition)', () => {
    const { code, text } = runBare('aek', '--help')
    expect(code).toBe(0)
    expect(text).toContain('aek')
    expect(text).not.toContain('Node.js v')
  })

  it('a subcommand usage error exits non-zero WITHOUT a wrapper crash dump', () => {
    const { code, text } = runBare('aek', 'runtime', 'set', 'nope', 'bogus-mode')
    // `set` validates its mode argument; any non-zero exit is fine, but the
    // output must stay human-readable (no Node crash dump out of the wrapper).
    expect(code).not.toBe(0)
    expect(text).not.toContain('Node.js v')
    expect(text).not.toContain('at validateArgs')
  })
})
