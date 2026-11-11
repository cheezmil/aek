#!/usr/bin/env node
/**
 * verify-build-rules — the machine-enforceable half of the project rules.
 *
 * A rule written in AGENTS.md is only a suggestion to a script. This gate is
 * what makes it real: it runs BEFORE any TypeScript compile, electron-builder
 * package, or web host boot, and exits non-zero with a friendly message.
 *
 * Gates:
 *   - classes   every AEK package declares aek.distribution ∈ {A1, A2};
 *               undeclared / illegal = build failure (no fallback, no default)
 *   - signing   macOS build uses a self-signed development identity, never
 *               adhoc; missing certificate = build failure + setup guide
 *   - publish   no A2 package appears in any publish / installable roster
 *
 * SAFETY: no arguments = read-only check. `--json` for CI. `--only <gate>`
 * narrows the run. `--skip-signing` is ONLY for pure source compiles that
 * never produce a .app (used by build.mjs), never for packaging.
 *
 * Usage:
 *   node scripts/aek/verify-build-rules.mjs
 *   node scripts/aek/verify-build-rules.mjs --json
 *   node scripts/aek/verify-build-rules.mjs --only classes
 *
 * @module scripts/aek/verify-build-rules
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPluginMeta } from '../../packages/aek/base/coraek/plugin-meta.mjs'
import { runCheck, repoRoot } from './plugin-class.mjs'
import { resolveSigningIdentity, setupGuide } from './signing-identity.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Find A2 packages named in the local CI/CD publishable roster.
 * @param {string} root - repository root.
 * @returns {{ ok: boolean, problems: string[], a2: string[] }} result.
 */
export function checkPublishScope(root = repoRoot()) {
  // Read the roster straight from the source of truth instead of duplicating it.
  const packages = readPluginMeta(root, { languages: false })
  const a2 = packages.filter(pkg => pkg.distribution.value === 'A2').map(pkg => pkg.packageName)
  const problems = []
  for (const file of ['scripts/aek/cicd.mjs', 'scripts/release/publish-order.txt']) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    for (const name of a2) {
      if (text.includes(name)) {
        problems.push(`${file} 里出现了 A2 本地专用包 ${name} —— 它绝不能进入发布 / 安装清单`)
      }
    }
  }
  return { ok: problems.length === 0, problems, a2 }
}

/**
 * @typedef {object} GateResult
 * @property {boolean} ok - all requested gates passed.
 * @property {{ name: string, ok: boolean, problems: string[] }[]} gates - each gate.
 * @property {string} root - repository root.
 */

/**
 * Run the gates. This is the function the build entry points call.
 * @param {{ root?: string, only?: string, skipSigning?: boolean }} [options] - controls.
 * @returns {GateResult} result.
 */
export function verifyBuildRules(options = {}) {
  const root = options.root ?? repoRoot()
  const requested = options.only === undefined
    ? ['classes', 'signing', 'publish']
    : [options.only]
  /** @type {{ name: string, ok: boolean, problems: string[] }[]} */
  const gates = []

  if (requested.includes('classes')) {
    const result = runCheck(root)
    gates.push({ name: 'classes', ok: result.ok, problems: result.violations })
  }
  if (requested.includes('signing') && options.skipSigning !== true) {
    const result = resolveSigningIdentity(process.env, root)
    gates.push({ name: 'signing', ok: result.ok, problems: result.problems })
  }
  if (requested.includes('publish')) {
    const result = checkPublishScope(root)
    gates.push({ name: 'publish', ok: result.ok, problems: result.problems })
  }
  return { ok: gates.every(gate => gate.ok), gates, root }
}

/**
 * Throw a friendly, aggregated error when any gate fails.
 * @param {{ root?: string, skipSigning?: boolean }} [options] - controls.
 * @returns {GateResult} the passing result.
 * @throws {Error} with the complete actionable report.
 */
export function assertBuildRules(options = {}) {
  const result = verifyBuildRules(options)
  if (result.ok) return result
  const lines = [
    '',
    '╭──────────────────────────────────────────────────────────────────────╮',
    '│  构建中止：项目规则未通过（详见下方）                                │',
    '╰──────────────────────────────────────────────────────────────────────╯',
  ]
  for (const gate of result.gates.filter(item => !item.ok)) {
    lines.push('', `[${gate.name}]`)
    for (const problem of gate.problems) lines.push(`  ✗ ${problem}`)
    if (gate.name === 'classes') {
      lines.push('', '  给每个包补上 package.json → aek.distribution: "A1" 或 "A2"。')
      lines.push('  A1 = 将来发布到互联网给全球使用；A2 = 完全本地使用（发布链自动排除）。')
      lines.push('  没有第三类，也没有默认值。改已有分类必须经用户同意：')
      lines.push('    node scripts/aek/plugin-class.mjs set <pkg> A2 --reason "..." --confirm')
    }
    if (gate.name === 'signing') {
      lines.push('', ...setupGuide().split('\n').map(line => `  ${line}`))
    }
  }
  lines.push('', '  单独复查（只读）：node scripts/aek/verify-build-rules.mjs', '')
  throw new Error(lines.join('\n'))
}

/** CLI. @returns {number} exit code. */
function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const onlyAt = args.indexOf('--only')
  const only = onlyAt === -1 ? undefined : args[onlyAt + 1]
  const result = verifyBuildRules({
    only,
    skipSigning: args.includes('--skip-signing'),
  })
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 1
  }
  for (const gate of result.gates) {
    console.log(`  ${gate.ok ? 'PASS' : 'FAIL'}  ${gate.name}`)
    for (const problem of gate.problems) console.log(`        ${problem}`)
  }
  if (!result.ok) {
    console.error('\nverify-build-rules: BUILD BLOCKED — see details above.')
    console.error('Run `node scripts/aek/verify-build-rules.mjs --json` for the machine-readable report.')
    return 1
  }
  console.log(`verify-build-rules: ${result.gates.length} gates passed.`)
  return 0
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main())
}
