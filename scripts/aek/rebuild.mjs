#!/usr/bin/env node
/**
 * Recompile the whole AEK checkout and re-anchor the installed profiles.
 *
 * Why this exists: a dsh profile is a tiny pnpm workspace under the AEK data
 * root. Its `package.json` and `node_modules/@cheezmil/*` symlinks are RELATIVE
 * links back into this checkout. Renaming (or relocating) the repository folder
 * leaves every one of those links pointing at the old directory: the web shell
 * still boots, but every AEK plugin fails to import and all `/api/aek/*`
 * routes 404. Recompiling alone does not fix it — the links must be repaired
 * and each profile's pnpm lockfile refreshed.
 *
 * Steps (in order, all paths derived at runtime — no absolute paths, no user
 * names hardcoded):
 *   1. `pnpm install` in the repository root (workspace links + lockfile).
 *   2. `node scripts/aek/run.mjs build:artifacts` (every compiled artifact;
 *      aggregate type checks are intentionally NOT part of this step).
 *   3. `pnpm run build` inside every standalone package (own tsconfig,
 *      `outDir` other than `lib/types`; these are excluded from tsdown's
 *      shared workspace pass).
 *   4. `node scripts/aek/stop-stale-instances.mjs --yes` — gracefully stop
 *      orphaned backends launched from the OLD checkout path (they hold the
 *      port and still resolve modules from a directory that no longer exists).
 *      A loaded LaunchAgent supervisor then starts exactly one fresh backend.
 *   5. `node scripts/aek/repair-profile-links.mjs --yes` — re-point profile
 *      `link:` specs and symlinks at the packages found in THIS checkout.
 *   6. `pnpm install` inside every installed profile (refresh its lockfile).
 *   7. Verify: every `link:` spec resolves, and every profile symlink resolves.
 *
 * SAFETY: read-only by default — prints the plan and checks current state,
 * changes nothing. Pass `--yes` to actually rebuild and repair.
 *
 * Usage:
 *   node scripts/aek/rebuild.mjs          # plan (read-only)
 *   node scripts/aek/rebuild.mjs --yes    # rebuild + repair + verify
 *
 * @module scripts/aek/rebuild
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS, slotHome } from '../../packages/aek/base/coraek/slots.mjs'

const APPLY = process.argv.includes('--yes')
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', 'coverage', '.git'])

/**
 * Run one command, failing the whole rebuild if it fails.
 * @param {string} label - human-readable step label.
 * @param {string} command - executable.
 * @param {string[]} args - arguments.
 * @param {string} cwd - working directory (no shell, so no quoting issues).
 */
function run(label, command, args, cwd = ROOT) {
  console.log(`\n[${APPLY ? 'RUN  ' : 'PLAN '}] ${label}`)
  console.log(`         ${command} ${args.join(' ')}   (cwd: ${relative(ROOT, cwd) || '.'})`)
  if (!APPLY) return
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env })
}

/**
 * Discover packages that compile themselves (standalone tsconfig + own build
 * script), which the shared tsdown workspace pass deliberately skips.
 * @returns {{ name: string, dir: string }[]}
 */
function standalonePackages() {
  /** @type {{ name: string, dir: string }[]} */
  const found = []
  /** @param {string} dir */
  const walk = (dir, depth) => {
    if (depth > 5) return
    const manifestPath = join(dir, 'package.json')
    const tsconfigPath = join(dir, 'tsconfig.json')
    if (existsSync(manifestPath) && existsSync(tsconfigPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const tsconfig = readFileSync(tsconfigPath, 'utf8')
        const bundled = /"outDir"\s*:\s*"lib\/types"/u.test(tsconfig)
        if (!bundled && typeof manifest.name === 'string' && typeof manifest.scripts?.build === 'string') {
          found.push({ name: manifest.name, dir })
        }
      } catch { /* unreadable manifest: nothing to build here */ }
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      walk(join(dir, entry.name), depth + 1)
    }
  }
  walk(join(ROOT, 'packages'), 0)
  return found
}

/**
 * Enumerate every installed profile under every slot of the AEK data root.
 * @returns {{ label: string, dir: string }[]}
 */
function installedProfiles() {
  /** @type {{ label: string, dir: string }[]} */
  const profiles = []
  for (const slot of Object.keys(SLOTS)) {
    const profilesDir = join(slotHome(slot), 'profiles')
    if (!existsSync(profilesDir)) continue
    for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      profiles.push({ label: `${slot}/${entry.name}`, dir: join(profilesDir, entry.name) })
    }
  }
  return profiles
}

/**
 * Check all profile link specs and symlinks, and print a compact report.
 * @returns {number} number of broken links.
 */
function verifyProfiles() {
  /** @type {string[]} */
  const problems = []
  let checked = 0
  for (const { label, dir } of installedProfiles()) {
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    let manifest
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch { continue }
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        if (typeof spec !== 'string' || !/^(?:link|file):/u.test(spec)) continue
        checked++
        const target = resolve(dir, spec.replace(/^(?:link|file):/u, ''))
        if (!existsSync(target)) problems.push(`${label}: ${name} -> ${spec} (target missing)`)
      }
    }
    const modules = join(dir, 'node_modules')
    if (!existsSync(modules)) continue
    /** @param {string} path */
    const checkLink = (path) => {
      let link
      try { link = lstatSync(path) } catch { return }
      if (!link.isSymbolicLink()) return
      checked++
      try { statSync(path) } catch { problems.push(`${label}: dangling symlink ${relative(dir, path)}`) }
    }
    for (const entry of readdirSync(modules, { withFileTypes: true })) {
      const path = join(modules, entry.name)
      if (entry.isSymbolicLink()) checkLink(path)
      else if (entry.name.startsWith('@') && entry.isDirectory()) {
        for (const child of readdirSync(path, { withFileTypes: true })) {
          if (child.isSymbolicLink()) checkLink(join(path, child.name))
        }
      }
    }
  }
  console.log(`\n[verify] ${checked} link(s) checked, ${problems.length} broken`)
  for (const problem of problems) console.error(`  BROKEN  ${problem}`)
  return problems.length
}

// ---------------------------------------------------------------------------

const standalone = standalonePackages()
const profiles = installedProfiles()
console.log(`AEK rebuild — repository: ${ROOT}`)
console.log(`  standalone packages : ${standalone.length}`)
console.log(`  installed profiles  : ${profiles.length} (${profiles.map(p => p.label).join(', ') || 'none'})`)
console.log(`  mode                : ${APPLY ? 'APPLY (--yes)' : 'dry run (no changes)'}`)

run('install workspace dependencies', PNPM, ['install'])
run('build every compiled artifact', process.execPath, ['scripts/aek/run.mjs', 'build:artifacts'])
for (const pkg of standalone) {
  run(`standalone build: ${pkg.name}`, PNPM, ['run', 'build'], pkg.dir)
}
run('stop stale backends from an old checkout', process.execPath, ['scripts/aek/stop-stale-instances.mjs', '--yes'])
run('repair profile links', process.execPath, ['scripts/aek/repair-profile-links.mjs', '--yes'])
for (const profile of profiles) {
  run(`refresh profile lockfile: ${profile.label}`, PNPM, ['install'], profile.dir)
}

if (!APPLY) {
  console.log('\nDry run only. Re-run with --yes to rebuild and repair.')
  console.log('Current state:')
  verifyProfiles()
  process.exit(0)
}

const broken = verifyProfiles()
if (broken > 0) {
  console.error(`\nrebuild finished with ${broken} broken profile link(s).`)
  process.exitCode = 1
} else {
  console.log('\nrebuild complete: all profile links resolve.')
}
