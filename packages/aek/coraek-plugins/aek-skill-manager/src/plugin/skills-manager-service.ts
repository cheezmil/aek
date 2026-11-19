import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@cheezmil/coraek/types'
import { resolveConfig, snapshotsOf, type AeksmPluginConfig } from '../config.js'
import { createRuntimeServices, projectRootFromImportMeta, type RuntimeServices } from '../infra/runtime.js'
import { MANAGER_SKILL_NAME } from '../core/services/manager-skill-service.js'
import type { DistributeRequest } from '../core/services/distribute-service.js'

export type { AeksmPluginConfig }
export type { DistributeRequest }

/**
 * `ctx.skillsManager` — the in-process face of the aeksm command catalog.
 *
 * The webui remote and the agent model tools call these methods directly;
 * nothing here spawns the CLI (the CLI stays the primary human/script face,
 * this service is the host face of the SAME operations — same engine, same
 * errors, same results).
 *
 * Engine construction is lazy and cached in module scope, keyed by the
 * resolved hub root, and rebuilt when it changes. The cache is deliberately
 * module-level (not an instance field): cordis delivers traceable services
 * across fibers as a `Proxy` that re-binds `this` for every method call, so
 * ES `#` private members throw "Receiver must be an instance of class …".
 * Plain members + a module cache survive that re-binding. Per-operation
 * `SkillsManagerError`s carry a machine-readable `code` and travel over the
 * typert remote intact.
 */

// Module-scope engine cache: one engine per resolved hub root, shared across
// every instance/proxy of this service. Survives the cordis traceable-Proxy
// wrap (which re-binds `this`); an instance `#` field would not.
let cachedEngine: RuntimeServices | null = null
let cachedEngineHome: string | undefined

function engineFor(home: string | undefined): RuntimeServices {
  if (!cachedEngine || cachedEngineHome !== home) {
    cachedEngine = createRuntimeServices(home ? { home } : {}, projectRootFromImportMeta(import.meta.url))
    cachedEngineHome = home
  }
  return cachedEngine
}

export class SkillsManagerService extends Service {
  readonly config: AeksmPluginConfig

  constructor(ctx: Context, config: AeksmPluginConfig) {
    super(ctx, 'skillsManager')
    this.config = config
  }

  /** The current hub root the engine should target (resolved, may be undefined). */
  resolveHome(): string | undefined {
    return resolveConfig(snapshotsOf(this.config)).home
  }

  /** Build (and cache) the engine composition; rebuild when the hub root changes. */
  services(): RuntimeServices {
    return engineFor(this.resolveHome())
  }

  /** The resolved hub root (may not exist yet). */
  home(): string {
    return this.services().resolution.root
  }

  /** True when the hub exists with a valid layout (`skills/` + `registry.yaml`). */
  isBootstrapped(): boolean {
    return this.services().resolution.exists
  }

  /** `aeksm list` — installed hub skills. */
  list(options?: { category?: string; includeArchived?: boolean }) {
    return this.services().registry.listSkills(options ?? {})
  }

  /** `aeksm get <skill>` — zero-retention read of a hub skill's SKILL.md. */
  get(skill: string) {
    const s = this.services()
    const target = s.get.resolve(skill)
    return { skill, dir: target.dir, archived: target.archived, body: s.get.read(target) }
  }

  /** `aeksm status` — distribution health plus errored managed entries. */
  status() {
    const s = this.services()
    const errored = s.distribute.listIndex().flatMap(record => record.entries.filter(entry => entry.error))
    return {
      status: s.distribute.status(),
      errored: errored.map(entry => ({ skill: entry.skill, runtimePath: entry.runtimePath, error: entry.error?.message })),
    }
  }

  /**
   * The agent picker face: every catalog agent with its label and whether it
   * is DETECTED on this machine (the catalog's own install/env probes — the
   * same set `distribute` defaults to when the request omits `agents`).
   */
  agents() {
    const s = this.services()
    const snapshot = s.catalog.load()
    const detected = new Set(s.catalog.detected())
    return snapshot.agents
      .filter(agent => agent.id !== MANAGER_SKILL_NAME)
      .map(agent => ({
        id: agent.id,
        label: agent.label,
        detected: detected.has(agent.id),
      }))
  }

  /** Known project roots, newest distribution record first (the picker's prefill). */
  knownProjects() {
    const s = this.services()
    const records = s.distribute.listIndex().filter(record => record.kind === 'project')
    records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return [...new Set(records.map(record => record.targetRoot))]
  }

  /**
   * Per-skill distribution wiring, as the console rows derive their
   * `N agents · M projects` label: one entry per skill name carrying the
   * union of agents and the physical targets (the dashboard's
   * `DistributionTarget[]` wire shape). Skills with no managed entry are
   * absent from the map — the console treats that as "unlinked".
   */
  distributionBySkill(): Record<string, { agents: string[]; targets: Array<{ kind: 'user' | 'project'; targetRoot: string; entries: Array<{ runtimePath: string; agents: string[] }> }> }> {
    const s = this.services()
    const out: Record<string, { agents: Set<string>; targets: Array<{ kind: 'user' | 'project'; targetRoot: string; entries: Array<{ runtimePath: string; agents: string[] }> }> }> = {}
    for (const record of s.distribute.listIndex()) {
      const bySkill = new Map<string, Array<{ runtimePath: string; agents: string[] }>>()
      for (const entry of record.entries) {
        const list = bySkill.get(entry.skill) || []
        list.push({ runtimePath: entry.runtimePath, agents: entry.agents })
        bySkill.set(entry.skill, list)
      }
      for (const [skill, entries] of bySkill) {
        const row = out[skill] || { agents: new Set<string>(), targets: [] }
        row.targets.push({ kind: record.kind, targetRoot: record.targetRoot, entries })
        for (const entry of entries) for (const agent of entry.agents) row.agents.add(agent)
        out[skill] = row
      }
    }
    const settled: Record<string, { agents: string[]; targets: Array<{ kind: 'user' | 'project'; targetRoot: string; entries: Array<{ runtimePath: string; agents: string[] }> }> }> = {}
    for (const [skill, row] of Object.entries(out)) {
      settled[skill] = { agents: [...row.agents].sort(), targets: row.targets }
    }
    return settled
  }

  /** `aeksm doctor` — health checks (read-only). */
  doctor() {
    return this.services().doctor.check()
  }

  /** `aeksm cost` — resident context-cost ledger. */
  cost(options?: { top?: number; budget?: number }) {
    const s = this.services()
    const ledger = s.cost.ledger(options?.top)
    return options?.budget != null
      ? { ...ledger, overBudget: ledger.totalTokens > options.budget }
      : ledger
  }

  /** `aeksm audit security` — report-only scan; omitted skills = every non-archived hub skill. */
  auditSecurity(skills?: readonly string[]) {
    const s = this.services()
    const names = skills?.length ? skills : s.registry.listSkills({ includeArchived: false }).map(row => row.name)
    return s.security.scanSkills(names)
  }

  /** `aeksm distribute` — apply one distribution request (symlink/copy, user/project). */
  distribute(request: DistributeRequest) {
    return this.services().distribute.apply(request)
  }

  /** `aeksm undistribute` — remove managed runtime entries without deleting hub skills. */
  undistribute(request: Omit<DistributeRequest, 'mode' | 'force'>) {
    return this.services().distribute.undistribute(request)
  }

  /** `aeksm add <source>` — discover + install; `all` = empty selector list = everything discovered. */
  add(source: string, options?: { all?: boolean; skills?: string[]; overwrite?: boolean; allowInsecureHttp?: boolean }) {
    const s = this.services()
    return s.install.installFromSourceSelection({
      source,
      selectors: options?.all ? [] : (options?.skills ?? []),
      overwrite: Boolean(options?.overwrite),
      allowInsecureHttp: Boolean(options?.allowInsecureHttp),
    })
  }

  /** `aeksm update --plan` — candidates grouped by source. */
  updatePlan() {
    return this.services().update.plan()
  }

  /** `aeksm update` — one source group (`source`) or selected skills (`skills`). */
  update(options: { skills?: string[]; source?: string }) {
    const s = this.services()
    return options.source ? s.update.updateSource(options.source) : s.update.updateSkills(options.skills ?? [])
  }
}
