import { createRequire } from 'node:module'
import type { Command } from 'commander'
import { createRuntimeServices, projectRootFromImportMeta } from '../infra/runtime.js'
import { MANAGER_SKILL_NAME, type ManagerSkillBundle } from '../core/index.js'
import { type SystemSkillBundle } from '../core/services/system-skill-service.js'
import { normalizeGitSourceUrl } from '../core/services/source-service.js'
import { SkillsManagerError } from '../shared/errors.js'
import { multiSelect, type SelectOption } from './bootstrap-prompt.js'
import { defaultDistributeAgents } from './shared-pool.js'
import { resolve, dirname, join } from 'node:path'
import { readFileSync, existsSync, readdirSync } from 'node:fs'

const pkg = createRequire(import.meta.url)('../../package.json') as {
  version: string
  repository?: { url?: string }
  aek?: { systemSkills?: string[] }
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
 * Discover bundled system skills from any installed @cheezmil/* package.
 *
 * Each AEK package declares its system skills via `package.json.aek.systemSkills`.
 * This function finds all installed @cheezmil/* packages (workspace or npm),
 * reads their declarations, and returns a flat list of SystemSkillBundle entries.
 *
 * No hardcoded paths or package names — fully extensible.
 */
export function systemSkillBundles(): SystemSkillBundle[] {
  const results: SystemSkillBundle[] = []

  // Resolve the skill-manager package root (works in both dev and installed modes)
  const scriptPath = resolve(import.meta.url.replace('file://', ''))
  const pkgRoot = dirname(dirname(scriptPath))

  // Discover candidate package.json paths
  const discovered = new Set<string>()

  // Strategy 1: workspace root (dev mode)
  let dir = pkgRoot
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      // Scan both packages/aek/* and packages/aek/coraek-plugins/*
      for (const sub of ['packages', 'packages/aek', 'packages/aek/coraek-plugins']) {
        const dirToScan = join(dir, sub)
        if (existsSync(dirToScan)) {
          for (const entry of readdirSync(dirToScan)) {
            const candidate = join(dirToScan, entry, 'package.json')
            if (entry.startsWith('aek-')) discovered.add(candidate)
          }
        }
      }
      break
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  // Strategy 2: node_modules/@cheezmil/* (installed mode)
  const nmDir = join(pkgRoot, 'node_modules', '@cheezmil')
  if (existsSync(nmDir)) {
    for (const entry of readdirSync(nmDir)) {
      if (entry.startsWith('aek-')) discovered.add(join(nmDir, entry, 'package.json'))
    }
  }

  // Always include skill-manager itself
  discovered.add(join(pkgRoot, 'package.json'))

  for (const pkgPath of discovered) {
    try {
      const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        version?: string
        repository?: { url?: string }
        aek?: { systemSkills?: string[] }
      }
      if (!raw.aek?.systemSkills?.length) continue
      const pkgDir = dirname(pkgPath)
      const repoUrl = normalizeGitSourceUrl((raw.repository?.url ?? ownRepoUrl).replace(/^git\+/, ''))
      for (const skillName of raw.aek.systemSkills) {
        const skillDir = join(pkgDir, 'skills', skillName)
        if (existsSync(join(skillDir, 'SKILL.md'))) {
          results.push({ root: pkgDir, version: raw.version ?? '0.0.0', skillName, repoUrl })
        }
      }
    } catch {
      // Skip unreadable package.json files
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
