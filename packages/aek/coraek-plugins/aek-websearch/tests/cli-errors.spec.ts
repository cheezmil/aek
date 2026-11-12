/**
 * CLI runner error-handling regression (aekws "炸点" 2026-11-12):
 * oclif v5's programmatic `run()` RE-THROWS command errors (missing required
 * args, unknown flags, …). Without `.catch(Errors.handle)` in `src/cli.ts`
 * they surface as raw Node crash dumps (stack + "Node.js v…" footer) instead
 * of oclif's clean one-line usage error. This spec spawns the real dev entry
 * and pins the clean form.
 *
 * @module aek-websearch/tests/cli-errors.spec
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Walk up from this package to the workspace root (pnpm-workspace.yaml),
 *  the way the bin entry itself does — no hardcoded paths. */
function findRepoRoot(start: string): string | null {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function runCli(cliEntry: string, ...argv: string[]) {
  const root = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
  if (!root) throw new Error('workspace root not found')
  const tsx = join(root, 'node_modules', '.bin', 'tsx')
  const out = spawnSync(tsx, [cliEntry, ...argv], { encoding: 'utf8', timeout: 60000 })
  return { code: out.status, text: `${out.stdout ?? ''}\n${out.stderr ?? ''}` }
}

describe('cli runner error handling', () => {
  it('missing required arg → clean oclif usage error, not a crash dump', () => {
    const cliEntry = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts')
    const { code, text } = runCli(cliEntry, 'search')
    expect(code).not.toBe(0)
    // The oclif-formatted message:
    expect(text).toContain('Missing 1 required arg')
    expect(text).toContain('See more help with --help')
    // NOT a Node crash dump:
    expect(text).not.toContain('Node.js v')
    expect(text).not.toContain('at validateArgs')
  })

  it('unknown flag → clean oclif flag error, not a crash dump', () => {
    const cliEntry = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts')
    const { code, text } = runCli(cliEntry, 'search', 'x', '--bogus')
    expect(code).not.toBe(0)
    expect(text).toContain('Nonexistent flag: --bogus')
    expect(text).toContain('See more help with --help')
    expect(text).not.toContain('Node.js v')
  })
})
