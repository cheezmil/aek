#!/usr/bin/env node
/**
 * cicd.mjs — local CI/CD pipeline for the AEK CLI packages.
 *
 * No git, no remote runner: it runs straight on this checkout.
 *
 *   node scripts/cicd.mjs            # all stages
 *   node scripts/cicd.mjs build test-dev test-npm
 *
 * Stages:
 *   install   pnpm install at the repo root (workspace deps for dev mode)
 *   build     build the aek packages that ship compiled output
 *   test-dev  BARE-COMMAND smoke of the repo checkout:
 *             symlinks aekws/aekpm into .ci/dev-bin (on PATH) and runs them
 *             by name — no relative/absolute path invocations anywhere.
 *   test-npm  BARE-COMMAND smoke of the PUBLISHED artifact:
 *             `npm i -g --prefix .ci/npm-global @cheezmil/<pkg>@<local version>`
 *             then runs the bare commands from .ci/npm-global/bin on PATH.
 *
 * Every CLI invocation is a bare command (PATH lookup). The pipeline never
 * calls `node <path>` — that is what this stage exists to catch.
 *
 * Disposables live under .ci/ (safe to rm -rf; re-created each run).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, symlinkSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

// ── repo discovery (no hardcoded layout) ─────────────────────────────────
function findRepoRoot(start) {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
const REPO_ROOT = findRepoRoot(dirname(new URL(import.meta.url).pathname)) ?? process.cwd()

const PKGS = {
  websearch: {
    npm: '@cheezmil/aek-websearch',
    dir: 'packages/aek/coraek-plugins/aek-websearch',
    binName: 'aekws',
    repoBin: 'bin/aekws.mjs',
    builds: true, // ships compiled output (tsdown)
    publishedCli: true, // published to npm → test-npm stage applies
  },
  promptManager: {
    npm: '@cheezmil/aek-prompt-manager',
    dir: 'packages/aek/coraek-plugins/aek-prompt-manager',
    binName: 'aekpm',
    repoBin: 'bin/aekpm.js',
    builds: false, // ships source (no build step)
    publishedCli: false, // source-only package, not on npm → test-npm skips
  },
  skillManager: {
    npm: '@cheezmil/aek-skill-manager',
    dir: 'packages/aek/coraek-plugins/aek-skill-manager',
    binName: 'aeksm',
    repoBin: 'bin/aeksm.mjs',
    builds: true, // tsc → lib/ + copy non-TS assets (agent-catalog.json, skills/, docs/)
    publishedCli: false, // not yet published to npm → test-npm skips; dev smoke covers it
  },
}

const CI_DIR = join(REPO_ROOT, '.ci')
const DEV_BIN = join(CI_DIR, 'dev-bin')

function localVersion(p) {
  return JSON.parse(readFileSync(join(REPO_ROOT, p.dir, 'package.json'), 'utf8')).version
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: REPO_ROOT, ...opts })
  return r.status ?? 0
}

// pnpm v12+ is mandatory for AEK. A machine whose PATH resolves to an old
// pnpm (e.g. a bundled toolchain earlier on PATH) can pin the binary here:
//   AEK_PNPM=/opt/homebrew/bin/pnpm node scripts/aek/cicd.mjs
const PNPM_BIN = process.env.AEK_PNPM || 'pnpm'

/** Run a BARE command with an extra PATH prefix. */
function bare(bin, args, pathPrefix, expect) {
  const env = { ...process.env, PATH: `${pathPrefix}:${process.env.PATH}` }
  const r = spawnSync(bin, args, { env, stdio: 'pipe' })
  const out = `${r.stdout?.toString() ?? ''}${r.stderr?.toString() ?? ''}`
  const ok = r.status === 0 && (expect ? expect(out) : true)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${bin} ${args.join(' ')}${expect && r.status === 0 && !ok ? '  (output mismatch)' : ''}`)
  if (!ok) console.log(out.split('\n').slice(0, 12).join('\n').padEnd(2, ' '))
  return ok
}

// ── stages ────────────────────────────────────────────────────────────────
const stages = {
  install() {
    console.log('\n── stage: install ──')
    const r = spawnSync(PNPM_BIN, ['install'], { stdio: 'pipe', cwd: REPO_ROOT })
    const out = `${r.stdout?.toString() ?? ''}${r.stderr?.toString() ?? ''}`
    if (r.status === 0) return
    // Pre-existing repo state: pnpm exits non-zero when dependency build
    // scripts are ignored (the repo blocks all dep builds via allowBuilds in
    // pnpm-workspace.yaml: @google/genai, protobufjs, …). Only real pnpm
    // errors (fetch/link/lockfile) fail this stage.
    const realError = out.split('\n').find((l) => l.includes('[ERR_PNPM_') && !l.includes('ERR_PNPM_IGNORED_BUILDS'))
    if (realError) {
      console.error(out)
      throw new Error(`pnpm install failed: ${realError.trim()}`)
    }
    console.log('  pnpm install OK (note: pre-existing ignored dep build scripts — see allowBuilds in pnpm-workspace.yaml)')
  },

  build() {
    console.log('\n── stage: build ──')
    for (const p of Object.values(PKGS).filter((x) => x.builds)) {
      const code = sh(PNPM_BIN, ['--filter', p.npm, 'run', 'build'])
      if (code !== 0) throw new Error(`${p.npm} build exited ${code}`)
      console.log(`  built ${p.npm}@${localVersion(p)}`)
    }
    // aek-prompt-manager ships source (no build step).
  },

  'test-dev'() {
    console.log('\n── stage: test-dev (bare commands against the repo checkout) ──')
    rmSync(DEV_BIN, { recursive: true, force: true })
    mkdirSync(DEV_BIN, { recursive: true })
    for (const p of Object.values(PKGS)) {
      const link = join(DEV_BIN, p.binName)
      if (!existsSync(join(REPO_ROOT, p.dir, p.repoBin))) throw new Error(`repo bin missing: ${p.repoBin}`)
      rmSync(link, { force: true })
      symlinkSync(resolve(join(REPO_ROOT, p.dir, p.repoBin)), link)
    }
    let ok = true
    ok = bare(PKGS.websearch.binName, ['--version'], DEV_BIN, (o) => o.includes('aek-websearch')) && ok
    ok = bare(PKGS.websearch.binName, ['--help'], DEV_BIN, (o) => o.includes('COMMANDS')) && ok
    ok = bare(PKGS.promptManager.binName, ['--help'], DEV_BIN, (o) => o.includes('patch')) && ok
    // `use` (no args) prints the mode; local is the auto default. Read-only.
    ok = bare(PKGS.promptManager.binName, ['use'], DEV_BIN, (o) => o.includes('mode:')) && ok
    // Bare query (no subcommand) must route to search — this is the primary
    // usage shape the user defined. Query text may contain spaces.
    ok = bare(PKGS.websearch.binName, ['macos arm64', 'node', 'version'], DEV_BIN, (o) => o.includes('tavily') || o.includes('Source')) && ok
    // aeksm: hub-independent read-only smoke. `echo` is the install sanity
    // check (touches no hub); `--help` enumerates the ~28-command catalog.
    ok = bare(PKGS.skillManager.binName, ['echo', 'smoke'], DEV_BIN, (o) => o.includes('smoke')) && ok
    ok = bare(PKGS.skillManager.binName, ['--help'], DEV_BIN, (o) => o.includes('aek-skill-manager')) && ok
    if (!ok) throw new Error('dev bare-command smoke failed')
  },

  'test-npm'() {
    console.log('\n── stage: test-npm (bare commands against the published artifact, pnpm global) ──')
    // AEK rules: pnpm v12+ only; global installs via `pnpm add -g` (never
    // `npm install -g`). pnpm cannot redirect its global store/bin dir via
    // config on this machine, so this stage uses the machine's REAL pnpm
    // global (idempotent: reinstalls the same spec; left in place on success).
    const pnpmVer = (spawnSync(PNPM_BIN, ['-v'], { encoding: 'utf8' }).stdout ?? '').trim()
    const major = Number(pnpmVer.split('.')[0])
    if (Number.isNaN(major) || major < 12) {
      const which = (spawnSync('which', [PNPM_BIN], { encoding: 'utf8' }).stdout ?? '').trim()
      throw new Error(`pnpm v12+ required (found ${pnpmVer || 'none'} at ${which || 'PATH'}). ` +
        `Fix: upgrade it (npm i -g pnpm@12), or pin the v12 binary for this run: AEK_PNPM=<path-to-pnpm12> node scripts/aek/cicd.mjs`)
    }
    const binDir = (spawnSync(PNPM_BIN, ['config', 'get', 'global-bin-dir'], { encoding: 'utf8', cwd: REPO_ROOT }).stdout ?? '').trim().split('\n')[0]
    if (!binDir || binDir.includes('undefined')) throw new Error('cannot resolve the pnpm global bin dir')
    const installable = Object.values(PKGS).filter((p) => p.publishedCli)
    for (const p of installable) {
      const spec = `${p.npm}@${localVersion(p)}`
      // Fresh publishes can lag the registry for a few minutes; retry.
      let code = 1
      for (let i = 0; i < 8 && code !== 0; i++) {
        code = sh(PNPM_BIN, ['add', '-g', spec])
        if (code !== 0) {
          console.log(`  registry not ready for ${spec} (try ${i + 1}/8), waiting 30s…`)
          sh('sleep', ['30'])
        }
      }
      if (code !== 0) throw new Error(`pnpm add -g ${spec} failed (is ${spec} actually published?)`)
      console.log(`  pnpm add -g ${spec} → global bin dir ${binDir}`)
    }
    let ok = true
    for (const p of installable) {
      ok = bare(p.binName, ['--version'], binDir, (o) => o.includes(p.binName === 'aekws' ? 'aek-websearch' : p.npm)) && ok
      ok = bare(p.binName, ['--help'], binDir, () => true) && ok
    }
    const skipped = Object.values(PKGS).filter((p) => !p.publishedCli)
    for (const p of skipped) console.log(`  SKIP  ${p.binName}: ${p.npm} not published to npm (source-only package; dev bare-command covered by test-dev)`)
    if (!ok) throw new Error('pnpm-global bare-command smoke failed')
  },
}

// ── run ────────────────────────────────────────────────────────────────────
const requested = (process.argv.slice(2).length ? process.argv.slice(2) : ['install', 'build', 'test-dev', 'test-npm'])
const unknown = requested.filter((s) => !stages[s])
if (unknown.length) {
  console.error(`unknown stage(s): ${unknown.join(', ')} — available: ${Object.keys(stages).join(', ')}`)
  process.exit(1)
}
console.log(`cicd (local, no git) — root: ${REPO_ROOT}`)
for (const s of requested) {
  stages[s]()
  console.log(`── ${s} ✓ ──`)
}
console.log('\nALL STAGES PASSED — CLIs verified by bare command only.')
