#!/usr/bin/env node
/**
 * rules-selftest — prove that the hard rules actually FAIL when broken.
 *
 * A rule that only passes on a clean tree is not a rule, it is a decoration.
 * This script builds throwaway repositories in the temp directory (never
 * inside the checkout) and asserts that each gate rejects the violation it
 * claims to reject. Zero side effects on the real project.
 *
 * Cases:
 *   - undeclared / illegal plugin class → classes gate fails
 *   - A2 package named in a publish roster → publish gate fails
 *   - AEK_SIGN_IDENTITY=- (adhoc) → signing gate fails
 *   - assertBuildRules() throws a friendly certificate-setup guide
 *   - `plugin-class.mjs set` without --confirm stays a dry run
 *   - `aek.external` wrapper with an in-process entry / missing spdx /
 *     off-whitelist attach.kind → external gate fails; legal wrapper passes
 *   - `aek.runtime` block: legal share+isolate passes; missing isolate.bin /
 *     absolute-or-shell bin / combined with aek.external / share without an
 *     in-process entry → external gate (runtime face) fails
 *
 * Usage: node scripts/aek/rules-selftest.mjs [--json]
 *
 * @module scripts/aek/rules-selftest
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyBuildRules, assertBuildRules } from './verify-build-rules.mjs'
import { repoRoot } from './plugin-class.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = repoRoot()
const NODE = process.execPath

/**
 * Build a fake repository with one plugin and (optionally) a publish roster.
 * @param {{ distribution?: string | null, roster?: boolean, external?: Record<string, unknown>, main?: string, exports?: Record<string, unknown>, runtime?: Record<string, unknown> }} options - shape.
 * @returns {string} the throwaway root.
 */
function fakeRepo(options) {
  const root = mkdtempSync(join(tmpdir(), 'aek-rules-'))
  const dir = join(root, 'packages', 'aek', 'coraek-plugins', 'fake')
  mkdirSync(dir, { recursive: true })
  const aek = options.distribution === null || options.distribution === undefined
    ? {}
    : { distribution: options.distribution }
  if (options.external !== undefined) aek.external = options.external
  if (options.runtime !== undefined) aek.runtime = options.runtime
  const manifest = { name: '@cheezmil/fake', version: '0.0.1', aek }
  if (options.main !== undefined) manifest.main = options.main
  if (options.exports !== undefined) manifest.exports = options.exports
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  if (options.roster === true) {
    mkdirSync(join(root, 'scripts', 'aek'), { recursive: true })
    writeFileSync(join(root, 'scripts', 'aek', 'cicd.mjs'),
      "// fake roster that wrongly includes a local-only plugin\n'@cheezmil/fake'\n")
  }
  return root
}

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const checks = []
/** @param {string} name @param {boolean} ok @param {string} detail */
const record = (name, ok, detail) => checks.push({ name, ok, detail })

/** Run each case, cleaning up its temp tree. */
function run() {
  // 1. A legal tree passes (sanity: the gate is not simply always red).
  {
    const root = fakeRepo({ distribution: 'A1' })
    try {
      const result = verifyBuildRules({ root, only: 'classes' })
      record('A1 declaration passes', result.ok, JSON.stringify(result.gates))
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 2. Undeclared class fails, with an actionable message.
  {
    const root = fakeRepo({ distribution: null })
    try {
      const result = verifyBuildRules({ root, only: 'classes' })
      const problem = result.gates[0]?.problems.join(' ') ?? ''
      record('undeclared class fails', !result.ok && problem.includes('MISSING'), problem.slice(0, 120))
      let threw = false
      try { assertBuildRules({ root, only: 'classes' }) } catch { threw = true }
      record('assertBuildRules throws', threw, threw ? 'threw as expected' : 'did NOT throw')
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 3. A third class is rejected too.
  {
    const root = fakeRepo({ distribution: 'A3' })
    try {
      const result = verifyBuildRules({ root, only: 'classes' })
      record('third class fails', !result.ok, result.gates[0]?.problems[0] ?? '')
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 4. A2 in a publish roster fails (and A2 with a clean roster passes).
  {
    const root = fakeRepo({ distribution: 'A2' })
    try {
      const clean = verifyBuildRules({ root, only: 'publish' })
      record('A2 alone is fine', clean.ok, JSON.stringify(clean.gates))
      mkdirSync(join(root, 'scripts', 'aek'), { recursive: true })
      writeFileSync(join(root, 'scripts', 'aek', 'cicd.mjs'), "'@cheezmil/fake'\n")
      const dirty = verifyBuildRules({ root, only: 'publish' })
      record('A2 in publish roster fails', !dirty.ok, dirty.gates[0]?.problems[0] ?? '')
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 5. adhoc signing intent fails in a child process (env is read there).
  {
    const result = spawnSync(NODE, [join(HERE, 'verify-build-rules.mjs'), '--only', 'signing', '--json'], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, AEK_SIGN_IDENTITY: '-' },
    })
    let parsed
    try { parsed = JSON.parse(result.stdout) } catch { parsed = {} }
    const failed = result.status !== 0 && parsed.ok === false
    record('adhoc intent fails the build', failed,
      parsed.gates?.[0]?.problems?.[0] ?? String(result.stdout).slice(0, 120))
  }

  // 6. The friendly guide is part of the failure, not a separate doc.
  {
    const result = spawnSync(NODE, ['-e', `
      import('${join(HERE, 'signing-identity.mjs').replace(/'/gu, "\\'")}').then(m => {
        try { m.assertBuildIdentity({ AEK_SIGN_IDENTITY: '-' }) }
        catch (e) { process.stdout.write(e.message) }
      })
    `], { cwd: ROOT, encoding: 'utf8' })
    const text = result.stdout ?? ''
    record('adhoc failure includes setup guide',
      text.includes('自签名') && text.includes('证书助理'),
      text.slice(0, 80).replace(/\n/gu, ' '))
  }

  // 7. `set` without --confirm must not write anything.
  {
    const file = join(ROOT, 'packages', 'aek', 'coraek-plugins', 'aek-quick-prompt', 'package.json')
    const before = readFileSync(file, 'utf8')
    const result = spawnSync(NODE, [join(HERE, 'plugin-class.mjs'),
      'set', 'aek-quick-prompt', 'A1', '--reason', 'selftest'], { cwd: ROOT, encoding: 'utf8' })
    const after = readFileSync(file, 'utf8')
    const dry = String(result.stdout).includes('DRY RUN') && before === after
    record('set without --confirm is a dry run', dry,
      dry ? 'class unchanged (still A2)' : 'FILE WAS MODIFIED')
  }

  // 8. A legal external wrapper (out-of-process only) passes the gate.
  {
    const root = fakeRepo({
      distribution: 'A1',
      external: {
        spdx: 'AGPL-3.0-or-later',
        attach: { kind: 'mcp-stdio', command: 'fake-provider', args: ['mcp'] },
      },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      record('legal external wrapper passes', result.ok, result.gates[0]?.problems.join(' ') ?? '')
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 9. An in-process `main` entry is a structural violation.
  {
    const root = fakeRepo({
      distribution: 'A1',
      main: './index.js',
      external: { spdx: 'AGPL-3.0-or-later', attach: { kind: 'mcp-stdio', command: 'fake-provider' } },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      const problem = result.gates[0]?.problems.join(' ') ?? ''
      record('external with main fails', !result.ok && problem.includes('main'), problem.slice(0, 120))
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 10. Missing provider license is a violation.
  {
    const root = fakeRepo({
      distribution: 'A1',
      external: { attach: { kind: 'mcp-stdio', command: 'fake-provider' } },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      const problem = result.gates[0]?.problems.join(' ') ?? ''
      record('external missing spdx fails', !result.ok && problem.includes('spdx'), problem.slice(0, 120))
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 11. An off-whitelist attach kind (shared memory / custom IPC) is rejected.
  {
    const root = fakeRepo({
      distribution: 'A1',
      external: { spdx: 'AGPL-3.0-or-later', attach: { kind: 'shared-memory', command: 'fake-provider' } },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      const problem = result.gates[0]?.problems.join(' ') ?? ''
      record('off-whitelist attach kind fails', !result.ok && problem.includes('attach.kind'), problem.slice(0, 120))
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 12. An in-process `exports["."]` runtime entry is a violation.
  {
    const root = fakeRepo({
      distribution: 'A1',
      exports: { '.': { types: './lib/types/index.d.ts', default: './lib/index.js' } },
      external: { spdx: 'AGPL-3.0-or-later', attach: { kind: 'jsonrpc-stdio', command: 'fake-provider' } },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      const problem = result.gates[0]?.problems.join(' ') ?? ''
      record('external with exports["."] fails', !result.ok && problem.includes('exports["."]'), problem.slice(0, 120))
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 13. A legal aek.runtime block (share + spawnable isolate bin, in-process
  //     entry present) passes the gate (runtime face of the external gate).
  {
    const root = fakeRepo({
      distribution: 'A1',
      main: './lib/index.js',
      runtime: { share: true, isolate: { bin: 'bin/aekws.mjs', spdx: 'MIT' } },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      record('legal aek.runtime passes', result.ok, result.gates[0]?.problems.join(' ') ?? '')
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 14. An isolate topology without a spawnable bin is a violation.
  {
    const root = fakeRepo({
      distribution: 'A1',
      main: './lib/index.js',
      runtime: { isolate: { spdx: 'MIT' } },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      const problem = result.gates[0]?.problems.join(' ') ?? ''
      record('runtime isolate missing bin fails', !result.ok && problem.includes('bin'), problem.slice(0, 120))
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 15. share with no in-process entry is a violation (share needs main/exports).
  {
    const root = fakeRepo({
      distribution: 'A1',
      runtime: { isolate: { bin: 'bin/aekws.mjs' } },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      const problem = result.gates[0]?.problems.join(' ') ?? ''
      record('runtime share without entry fails', !result.ok && problem.includes('in-process entry'), problem.slice(0, 120))
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 16. aek.runtime must not ride on an aek.external wrapper.
  {
    const root = fakeRepo({
      distribution: 'A1',
      external: { spdx: 'AGPL-3.0-or-later', attach: { kind: 'mcp-stdio', command: 'fake-provider' } },
      runtime: { share: false, isolate: { bin: 'bin/fake.mjs' } },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      const problem = result.gates[0]?.problems.join(' ') ?? ''
      record('runtime on external wrapper fails', !result.ok && problem.includes('aek.external'), problem.slice(0, 120))
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  // 17. An absolute / shell-bearing isolate bin is rejected.
  {
    const root = fakeRepo({
      distribution: 'A1',
      main: './lib/index.js',
      runtime: { isolate: { bin: '/usr/local/bin/aekws' } },
    })
    try {
      const result = verifyBuildRules({ root, only: 'external' })
      const problem = result.gates[0]?.problems.join(' ') ?? ''
      record('absolute runtime bin fails', !result.ok && problem.includes('relative'), problem.slice(0, 120))
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
}

run()
const ok = checks.every(check => check.ok)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok, checks }, null, 2))
} else {
  for (const check of checks) console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name.padEnd(38)} ${check.detail}`)
  console.log(ok
    ? `\nrules-selftest: ${checks.length}/${checks.length} passed — every gate rejects its violation.`
    : '\nrules-selftest: FAILED — a hard rule is not being enforced.')
}
process.exit(ok ? 0 : 1)
