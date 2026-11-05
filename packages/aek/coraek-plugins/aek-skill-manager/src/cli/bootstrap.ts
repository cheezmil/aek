import { createRequire } from 'node:module'
import type { Command } from 'commander'
import { createRuntimeServices, projectRootFromImportMeta } from '../infra/runtime.js'
import { MANAGER_SKILL_NAME, type ManagerSkillBundle } from '../core/index.js'
import { type SystemSkillBundle } from '../core/services/system-skill-service.js'
import { normalizeGitSourceUrl } from '../core/services/source-service.js'
import { SkillsManagerError } from '../shared/errors.js'
import { multiSelect, type SelectOption } from './bootstrap-prompt.js'
import { defaultDistributeAgents } from './shared-pool.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { loadSystemSkillManifest, seedablePackages } from '../shared/system-skill-manifest.js'
import { quarantineUndefinedSystemSkills } from '../core/services/system-skill-guard.js'
import { NodeFileSystem } from '../infra/fs-skill-home.js'

const pkg = createRequire(import.meta.url)('../../package.json') as {
  version: string
  repository?: { url?: string }
}
const projectRoot = projectRootFromImportMeta(import.meta.url)
const ownRepoUrl = normalizeGitSourceUrl((pkg.repository?.url ?? 'shenysun/skills-manager').replace(/^git\+/, ''))

const STARTER_PROMPT_ZH = '帮我看看我的 skills：有哪些、装到哪些 agent 了、有没有能更新的'
const STARTER_PROMPT_EN = 'Take stock of my skills: what I have, which agents they are wired into, and what has updates'
const IMPORT_PROMPT_ZH = '帮我把现有的 skills 导入 aek-skill-manager 并整理好来源'

export function managerSkillBundle(): ManagerSkillBundle {
  return { root: projectRoot, version: pkg.version, repoUrl: ownRepoUrl }
}

/**
 * Locate the pnpm workspace root without assuming any monorepo layout.
 * Dev checkouts may relocate packages; the manifest, not a hardcoded path,
 * decides what counts as an AEK system package.
 */
function findWorkspaceRoot(start: string): string | null {
  let dir = start
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const SCAN_SKIP_DIRS = new Set(['node_modules', '.git', 'lib', 'dist', 'build', 'coverage', '.cache'])

/** Match declared packages by their package.json `name`, independent of depth. */
function findDeclaredPackageRoots(workspaceRoot: string, wanted: Set<string>, out: Map<string, string>): void {
  const stack: { dir: string; depth: number }[] = [{ dir: workspaceRoot, depth: 0 }]
  while (stack.length > 0 && out.size < wanted.size) {
    const { dir, depth } = stack.pop()!
    if (depth > 6) continue
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    if (entries.some(entry => entry.isFile() && entry.name === 'package.json')) {
      try {
        const raw = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name?: string }
        const shortName = raw.name?.replace(/^@cheezmil\//, '')
        if (shortName && wanted.has(shortName)) out.set(shortName, dir)
      } catch { /* unreadable package.json — keep scanning */ }
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SCAN_SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 })
      }
    }
  }
}

/**
 * Installed mode: resolve siblings through Node resolution. A pnpm global
 * install puts all @cheezmil/* packages in one node_modules, so this works
 * whether aeksm was installed alone or from a consumer project.
 */
function resolveInstalledPackageRoot(req: NodeRequire, name: string): string | null {
  const specifier = `@cheezmil/${name}`
  for (const request of [`${specifier}/package.json`, specifier]) {
    try {
      let dir = path.dirname(req.resolve(request))
      for (;;) {
        if (existsSync(path.join(dir, 'package.json'))) return dir
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    } catch { /* exports map may forbid ./package.json — try the entry point */ }
  }
  return null
}

/**
 * Bundled system skills come ONLY from the package-root manifest
 * `system-skills.yml`. An undeclared package is not an AEK system package and
 * is never discovered/seeded — no more scanning every `aek-*` folder.
 *
 * Works in both execution contexts:
 *   dev       — walk up to the workspace root and match package.json names;
 *   installed — Node resolution from this module + legacy sibling node_modules.
 * The manifest itself is found by walking up from THIS module's directory, so
 * `src/cli/` and `lib/cli/` both land on the same package-root file.
 */
export function systemSkillBundles(): SystemSkillBundle[] {
  const manifest = loadSystemSkillManifest(path.dirname(fileURLToPath(import.meta.url)))
  const wanted = seedablePackages(manifest)
  if (wanted.length === 0) return []

  const wantedNames = new Set(wanted.map(entry => entry.name))
  const roots = new Map<string, string>()

  const workspaceRoot = findWorkspaceRoot(projectRoot)
  if (workspaceRoot) findDeclaredPackageRoots(workspaceRoot, wantedNames, roots)

  const requireFromHere = createRequire(import.meta.url)
  for (const name of wantedNames) {
    if (roots.has(name)) continue
    const resolved = resolveInstalledPackageRoot(requireFromHere, name)
    if (resolved) {
      roots.set(name, resolved)
      continue
    }
    const legacy = path.join(projectRoot, 'node_modules', '@cheezmil', name)
    if (existsSync(path.join(legacy, 'package.json'))) roots.set(name, legacy)
  }

  const results: SystemSkillBundle[] = []
  for (const entry of wanted) {
    const pkgDir = roots.get(entry.name)
    if (!pkgDir) continue
    let version = '0.0.0'
    try {
      const raw = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as { version?: string }
      version = raw.version ?? version
    } catch { /* version is only used for the refresh anchor */ }
    for (const skillName of entry.skills) {
      if (!existsSync(path.join(pkgDir, 'skills', skillName, 'SKILL.md'))) continue
      // AEK-owned skills are seeded as `local` sources (see SystemSkillService);
      // no external upstream URL is ever written into the registry/frontmatter.
      results.push({ root: pkgDir, version, skillName, repoUrl: '' })
    }
  }
  return results
}

export type BootstrapOptions = {
  agent?: string[]
  force?: boolean
}

/**
 * The one-time setup, and the product's front door (ADR-0014): create the hub,
 * seed the manager skill and system skills from bundled copies, mount them to
 * the chosen agents, print the starter prompt. It imports nothing — importing
 * existing runtime skills is a conversational act for later, through the manager
 * skill itself.
 */
export async function runBootstrap(opts: BootstrapOptions, cmd: Command): Promise<void> {
  const globalOpts = (cmd.optsWithGlobals() as { home?: string })
  const s = createRuntimeServices({ home: globalOpts.home, ensureDefaultHub: true }, projectRoot)
  const bundle = managerSkillBundle()
  const systemBundles = systemSkillBundles()

  // Undeclared entries in the legacy aek-system-skill/ shelf have no package
  // behind them. Move them into .backups/ (never delete) before seeding.
  const manifest = loadSystemSkillManifest(path.dirname(fileURLToPath(import.meta.url)))
  const quarantined = quarantineUndefinedSystemSkills(new NodeFileSystem(), s.home.root, manifest)
  if (quarantined.moved.length > 0) {
    console.log(`• undeclared system skills backed up: ${quarantined.moved.join(', ')} -> ${quarantined.backupDir}`)
  }

  const seeded = s.managerSkill.seed(bundle)
  const seedNotes: Record<string, string> = {
    seeded: `installed the manager skill (aek-skill-manager v${bundle.version})`,
    refreshed: `updated the manager skill to v${bundle.version}`,
    'up-to-date': `manager skill already current (v${bundle.version})`,
    'user-managed': 'kept the existing aek-skill-manager copy (installed or edited outside bootstrap)',
  }
  console.log(`• skill home: ${s.resolution.root}${s.resolution.created ? ' (created)' : ''}`)
  console.log(`• ${seedNotes[seeded.status]}`)

  // Seed system skills from bundled packages
  if (systemBundles.length > 0) {
    const systemResults = s.systemSkill.seedAll(systemBundles)
    const systemStatuses = new Map<string, string>()
    for (const r of systemResults) {
      if (r.status !== 'up-to-date') {
        systemStatuses.set(r.skill, r.status === 'seeded' ? 'installed' : r.status === 'refreshed' ? 'updated' : 'kept')
      }
    }
    if (systemStatuses.size > 0) {
      console.log(`• system skills: ${[...systemStatuses.entries()].map(([k, v]) => `${k} (${v})`).join(', ')}`)
    }
  } else {
    console.log('• system skills: none bundled (run from workspace or install sibling packages)')
  }

  // Default target set excludes the shared agents pool (reconciled, not linked —
  // see shared-pool.ts). An explicit -a (incl. pool agents) still wins via chooseAgents.
  const detected = defaultDistributeAgents(s.catalog)
  const agents = await chooseAgents(opts, detected, s.catalog.resolveGlobalDir.bind(s.catalog))
  if (agents.length > 0) {
    try {
      // Collect all skills to distribute: manager + system skills
      const allSkills = [MANAGER_SKILL_NAME, ...systemBundles.map(b => b.skillName)]
      const applied = s.distribute.apply({ to: 'user', skills: allSkills, agents, mode: 'symlink', force: Boolean(opts.force) })
      const dirs = [...new Set(applied.entries.map(entry => entry.runtimePath))]
      console.log(`• mounted to: ${dirs.join(', ')}`)
    } catch (error) {
      if (error instanceof SkillsManagerError && error.code === 'distribute_foreign_exists') {
        throw new SkillsManagerError('bootstrap_foreign_runtime', `${error.message} Re-run with --force to replace it, or remove it first.`)
      }
      throw error
    }
  } else {
    console.log('• manager skill mounted nowhere yet.')
    console.log('  To mount later: aeksm bootstrap --agent <id>')
  }

  // Bootstrap never imports — it only reports what the user can bring in later (ADR-0014).
  try {
    const preview = s.init.run({ dryRun: true })
    if (preview.imported.length > 0) {
      const conflicts = preview.conflicts.length > 0 ? ` (+${preview.conflicts.length} needing decisions)` : ''
      console.log(`• found ${preview.imported.length} existing skill(s) in your agent dirs${conflicts}.`)
      console.log(`  Import them later from your agent: "${IMPORT_PROMPT_ZH}"`)
    }
  } catch {
    /* zero detected agents — there is nothing to preview */
  }

  s.activity.record({ action: 'cli-bootstrap', summary: `Bootstrap: ${seeded.status}, mounted to ${agents.join(', ') || 'none'}`, details: { seeded: seeded.status, agents } })
  console.log('\nAll set. Go back to your agent and say:')
  console.log(`  "${STARTER_PROMPT_ZH}"`)
  console.log(`  ("${STARTER_PROMPT_EN}")`)
  console.log('\nAlso try (CLI demos — paste anywhere):')
  console.log('  aeksm cost --share   # privacy-safe resident skill tax card')
  console.log('  aeksm doctor         # health + security.high + residentCost')
}

/** `--agent` wins; one detected agent needs no question; several get the picker in a TTY, all of them otherwise. */
async function chooseAgents(
  opts: BootstrapOptions,
  detected: readonly string[],
  resolveGlobalDir: (id: string) => string | null,
): Promise<readonly string[]> {
  if (opts.agent && opts.agent.length > 0) return opts.agent
  if (detected.length <= 1) return detected
  if (!process.stdin.isTTY || !process.stdout.isTTY) return detected
  const options: SelectOption[] = detected.map(id => ({ id, label: id, detail: resolveGlobalDir(id) ?? undefined }))
  return multiSelect('Install the manager skill into:', options)
}
