#!/usr/bin/env node
/**
 * One entry point for the AEK console development round.
 *
 * WHY THIS EXISTS (user rule, 2026-11-09): do not paste long chains of shell
 * commands into a terminal. Every build / gate / verify step lives in a
 * `.mjs` script under `scripts/aek` so the whole round is one reproducible
 * command and the exact command list is reviewable in source control.
 *
 * SAFETY: with NO arguments this script is a **read-only dry run** — it prints
 * the plan and resolves every path, but executes nothing. Pass `--yes` to
 * actually run steps. `--only=<csv>` restricts the step ids; `--list` prints
 * step ids and exits. This follows `AGENTS.md` section 6 (default = safe
 * no-op, state changes require an explicit `--yes`).
 *
 * NO HARDCODED ABSOLUTE PATHS: the repository root is resolved at runtime by
 * walking up from `import.meta.url` until `pnpm-workspace.yaml` is found.
 * Every child process uses an absolute argv[0] / cwd derived from that root,
 * never a developer's home directory.
 *
 * Usage:
 *   node scripts/aek/console-round.mjs                 # dry run (read-only)
 *   node scripts/aek/console-round.mjs --list          # list step ids
 *   node scripts/aek/console-round.mjs --yes           # run every step
 *   node scripts/aek/console-round.mjs --yes --only=bundles,gates
 *
 * @module scripts/aek/console-round
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Resolve the repo root by walking up to `pnpm-workspace.yaml`. */
function findRoot(start) {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('cannot locate pnpm-workspace.yaml above scripts/aek')
}

const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)))
const A_SCRIPTS = join(ROOT, 'scripts', 'aek')

/** pnpm in a non-interactive shell needs this env (see .npmrc header). */
const BASE_ENV = {
  ...process.env,
  PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
}

/** One reproducible step. `argv` is passed to spawnSync without a shell. */
const STEPS = [
  {
    id: 'home-bundle',
    group: 'bundles',
    label: 'aek-home client bundle (tsdown)',
    argv: ['pnpm', '--filter', '@cheezmil/aek-home', 'run', 'bundle'],
  },
  {
    id: 'websearch-bundle',
    group: 'bundles',
    label: 'aek-websearch host lib + d.mts (tsdown, dts:true)',
    argv: ['pnpm', '--filter', '@cheezmil/aek-websearch', 'run', 'build'],
  },
  {
    id: 'desktop-tsc',
    group: 'bundles',
    label: 'desktop main TypeScript emit',
    argv: [process.execPath, join('scripts', 'aek', 'build.mjs')],
  },
  {
    id: 'script-syntax',
    group: 'bundles',
    label: 'node --check every scripts/aek/*.mjs',
    check: true,
  },
  {
    id: 'lint',
    group: 'gates',
    label: 'root pnpm run lint (must be 0/0)',
    argv: ['pnpm', 'run', 'lint'],
  },
  {
    id: 'typecheck',
    group: 'gates',
    label: 'root pnpm run typecheck (aek-owned files must be 0)',
    argv: ['pnpm', 'run', 'typecheck'],
    allowFailure: true,
  },
  {
    id: 'verify-aek-home',
    group: 'gates',
    label: 'verify-aek-home',
    argv: [process.execPath, join('scripts', 'aek', 'verify-aek-home.mjs')],
  },
  {
    id: 'verify-command-namespace',
    group: 'gates',
    label: 'verify-command-namespace',
    argv: [process.execPath, join('scripts', 'aek', 'verify-command-namespace.mjs')],
  },
  {
    id: 'verify-web-stack',
    group: 'gates',
    label: 'verify-web-stack',
    argv: [process.execPath, join('scripts', 'aek', 'verify-web-stack.mjs')],
  },
  {
    id: 'verify-console-round',
    group: 'gates',
    label: 'R1/R6/R7/R10/R24 static acceptance gate (read-only)',
    argv: [process.execPath, join('scripts', 'aek', 'verify-console-round.mjs')],
  },
  {
    id: 'verify-note-lists',
    group: 'gates',
    label: 'R24 note lists (AEK_NOTES_DIR optional; no-op when unset)',
    // No machine path in source: the notes directory is supplied at runtime.
    argv: [process.execPath, join('scripts', 'aek', 'verify-note-lists.mjs'),
      ...(process.env.AEK_NOTES_DIR === undefined ? [] : [`--notes=${process.env.AEK_NOTES_DIR}`])],
  },
  {
    id: 'verify-live-console',
    group: 'live',
    label: 'running AEK.app / bundles / host facts read-only acceptance (skips when offline)',
    argv: [process.execPath, join('scripts', 'aek', 'verify-live-console.mjs')],
  },
]

/** Parse the small, explicit CLI surface. */
function parseArgs(argv) {
  const flags = new Set()
  let only
  for (const arg of argv) {
    if (arg === '--yes' || arg === '--list' || arg === '--help' || arg === '-h') flags.add(arg)
    else if (arg.startsWith('--only=')) only = arg.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean)
    else throw new Error(`unknown argument: ${arg}`)
  }
  return { flags, only }
}

/** Print usage without executing anything. */
function usage() {
  process.stdout.write([
    'AEK console round runner',
    '',
    '  node scripts/aek/console-round.mjs              dry run (read-only, prints the plan)',
    '  node scripts/aek/console-round.mjs --list       list step ids',
    '  node scripts/aek/console-round.mjs --yes        run every step',
    '  node scripts/aek/console-round.mjs --yes --only=bundles,gates',
    '',
    '  step ids: ' + STEPS.map(s => s.id).join(', '),
    '  groups:   bundles, gates, live',
    '',
  ].join('\n'))
}

/** @param {string} argv0 @param {string[]} args @returns {number} exit code */
function run(argv0, args) {
  const result = spawnSync(argv0, args, { cwd: ROOT, env: BASE_ENV, stdio: 'inherit' })
  return result.status ?? 1
}

/** Syntax-check every .mjs script; returns non-zero on the first failure. */
function checkScripts() {
  let failed = 0
  for (const file of readdirSync(A_SCRIPTS).filter(name => name.endsWith('.mjs')).sort()) {
    const result = spawnSync(process.execPath, ['--check', join(A_SCRIPTS, file)], {
      cwd: ROOT, env: BASE_ENV, encoding: 'utf8',
    })
    if (result.status !== 0) {
      failed++
      process.stderr.write(`[syntax] FAIL ${relative(ROOT, join(A_SCRIPTS, file))}\n${result.stderr ?? ''}`)
    }
  }
  process.stdout.write(`[syntax] checked ${readdirSync(A_SCRIPTS).filter(n => n.endsWith('.mjs')).length} scripts, ${failed} failed\n`)
  return failed === 0 ? 0 : 1
}

const { flags, only } = parseArgs(process.argv.slice(2))
if (flags.has('--help') || flags.has('-h')) {
  usage()
  process.exit(0)
}
if (flags.has('--list')) {
  for (const step of STEPS) process.stdout.write(`${step.id}\t${step.group}\t${step.label}\n`)
  process.exit(0)
}

const selected = only === undefined
  ? STEPS
  : STEPS.filter(step => only.includes(step.id) || only.includes(step.group))
if (selected.length === 0) throw new Error(`--only matched no step: ${only.join(',')}`)

process.stdout.write(`[round] root = ${ROOT}\n`)
process.stdout.write(`[round] mode = ${flags.has('--yes') ? 'EXECUTE' : 'DRY RUN (no side effects)'}\n`)
for (const step of selected) {
  const command = step.check
    ? `${process.execPath} --check scripts/aek/*.mjs`
    : step.argv.join(' ')
  process.stdout.write(`  - ${step.id}: ${command}\n`)
}

if (!flags.has('--yes')) {
  process.stdout.write('[round] dry run complete; pass --yes to execute.\n')
  process.exit(0)
}

const results = []
for (const step of selected) {
  process.stdout.write(`\n[round] === ${step.id} :: ${step.label} ===\n`)
  const code = step.check ? checkScripts() : run(step.argv[0], step.argv.slice(1))
  results.push({ step: step.id, code })
  if (code !== 0 && !step.allowFailure) {
    process.stderr.write(`[round] STOP at ${step.id} (exit ${code})\n`)
    break
  }
}
process.stdout.write(`\n[round] summary ${JSON.stringify(results)}\n`)
const hardFailures = results.filter(r => {
  const step = STEPS.find(s => s.id === r.step)
  return r.code !== 0 && !step?.allowFailure
})
process.exit(hardFailures.length === 0 ? 0 : 1)
