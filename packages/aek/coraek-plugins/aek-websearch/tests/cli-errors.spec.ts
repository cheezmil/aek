/**
 * CLI runner error-handling regression (aekws "炸点" 2026-11-12):
 * oclif v5's programmatic `run()` RE-THROWS command errors (missing required
 * args, unknown flags, …). Without `.catch(Errors.handle)` in `src/cli.ts`
 * they surface as raw Node crash dumps (stack + "Node.js v…" footer) instead
 * of oclif's clean one-line usage error.
 *
 * Per the bare-command testing rule (2026-11-12), this spec invokes the
 * CLI by its PATH name (`aekws`), never by a repo-relative path. The dev
 * link is a symlink of `bin/aekws.mjs` onto PATH (`~/.local/bin/aekws`);
 * the bin entry's own three-context contract (dev = tsx source, installed =
 * compiled lib) makes the bare name test the real entry in both worlds.
 * A missing bare command is an environment precondition failure, reported
 * as such — never a silent pass.
 *
 * @module aek-websearch/tests/cli-errors.spec
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

/** Bare-command spawn (Windows PATH resolution needs the shell). */
function runBare(command: string, ...argv: string[]) {
  const out = spawnSync(command, argv, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 90_000,
  })
  if (out.error !== undefined && 'code' in out.error && out.error.code === 'ENOENT') {
    throw new Error(
      `bare CLI command '${command}' is not on PATH. `
      + 'Environment precondition: link the repo bin '
      + `(${command} → packages/*/bin/${command}.mjs, e.g. into ~/.local/bin). `
      + 'Without the bare command this spec cannot test the real entry.',
    )
  }
  return { code: out.status, text: `${out.stdout ?? ''}\n${out.stderr ?? ''}` }
}

describe('cli runner error handling (bare `aekws` on PATH)', () => {
  it('bare aekws resolves (environment precondition)', () => {
    const { code, text } = runBare('aekws', '--version')
    expect(code).toBe(0)
    expect(text.trim()).not.toBe('')
  })

  it('missing required arg → clean oclif usage error, not a crash dump', () => {
    const { code, text } = runBare('aekws', 'search')
    expect(code).not.toBe(0)
    // The oclif-formatted message:
    expect(text).toContain('Missing 1 required arg')
    expect(text).toContain('See more help with --help')
    // NOT a Node crash dump:
    expect(text).not.toContain('Node.js v')
    expect(text).not.toContain('at validateArgs')
  })

  it('unknown flag → clean oclif flag error, not a crash dump', () => {
    const { code, text } = runBare('aekws', 'search', 'x', '--bogus')
    expect(code).not.toBe(0)
    expect(text).toContain('Nonexistent flag: --bogus')
    expect(text).toContain('See more help with --help')
    expect(text).not.toContain('Node.js v')
  })
})
