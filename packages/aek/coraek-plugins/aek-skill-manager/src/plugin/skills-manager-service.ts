import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@cheezmil/coraek/types'
import { resolveConfig, snapshotsOf, type AeksmPluginConfig } from '../config.js'
import { createRuntimeServices, projectRootFromImportMeta, type RuntimeServices } from '../infra/runtime.js'
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
 * Engine construction is lazy and cached on the instance: host startup must
 * never fail on hub state (the hub may not be bootstrapped yet — `aeksm
 * bootstrap` owns creation). The config's `home` is a volatile live reference
 * (a settings commit replaces it in place), so the cache is keyed by the
 * current hub root and rebuilt when it changes. Per-operation
 * `SkillsManagerError`s carry a machine-readable `code` and travel over the
 * typert remote intact.
 */
export class SkillsManagerService extends Service {
  readonly #config: AeksmPluginConfig
  #engine: RuntimeServices | null = null
  #engineHome: string | undefined = undefined

  constructor(ctx: Context, config: AeksmPluginConfig) {
    super(ctx, 'skillsManager')
    this.#config = config
  }

  /** The current hub root the engine should target (resolved, may be undefined). */
  #home(): string | undefined {
    return resolveConfig(snapshotsOf(this.#config)).home
  }

  /** Build (and cache) the engine composition; rebuild when the hub root changes. */
  #services(): RuntimeServices {
    const home = this.#home()
    if (!this.#engine || this.#engineHome !== home) {
      this.#engine = createRuntimeServices(home ? { home } : {}, projectRootFromImportMeta(import.meta.url))
      this.#engineHome = home
    }
    return this.#engine
  }

  /** The resolved hub root (may not exist yet). */
  home(): string {
    return this.#services().resolution.root
  }

  /** True when the hub exists with a valid layout (`skills/` + `registry.yaml`). */
  isBootstrapped(): boolean {
    return this.#services().resolution.exists
  }

  /** `aeksm list` — installed hub skills. */
  list(options?: { category?: string; includeArchived?: boolean }) {
    return this.#services().registry.listSkills(options ?? {})
  }

  /** `aeksm get <skill>` — zero-retention read of a hub skill's SKILL.md. */
  get(skill: string) {
    const s = this.#services()
    const target = s.get.resolve(skill)
    return { skill, dir: target.dir, archived: target.archived, body: s.get.read(target) }
  }

  /** `aeksm status` — distribution health plus errored managed entries. */
  status() {
    const s = this.#services()
    const errored = s.distribute.listIndex().flatMap(record => record.entries.filter(entry => entry.error))
    return {
      status: s.distribute.status(),
      errored: errored.map(entry => ({ skill: entry.skill, runtimePath: entry.runtimePath, error: entry.error?.message })),
    }
  }

  /** `aeksm doctor` — health checks (read-only). */
  doctor() {
    return this.#services().doctor.check()
  }

  /** `aeksm cost` — resident context-cost ledger. */
  cost(options?: { top?: number; budget?: number }) {
    const s = this.#services()
    const ledger = s.cost.ledger(options?.top)
    return options?.budget != null
      ? { ...ledger, overBudget: ledger.totalTokens > options.budget }
      : ledger
  }

  /** `aeksm audit security` — report-only scan; omitted skills = every non-archived hub skill. */
  auditSecurity(skills?: readonly string[]) {
    const s = this.#services()
    const names = skills?.length ? skills : s.registry.listSkills({ includeArchived: false }).map(row => row.name)
    return s.security.scanSkills(names)
  }

  /** `aeksm distribute` — apply one distribution request (symlink/copy, user/project). */
  distribute(request: DistributeRequest) {
    return this.#services().distribute.apply(request)
  }

  /** `aeksm undistribute` — remove managed runtime entries without deleting hub skills. */
  undistribute(request: Omit<DistributeRequest, 'mode' | 'force'>) {
    return this.#services().distribute.undistribute(request)
  }

  /** `aeksm add <source>` — discover + install; `all` = empty selector list = everything discovered. */
  add(source: string, options?: { all?: boolean; skills?: string[]; overwrite?: boolean; allowInsecureHttp?: boolean }) {
    const s = this.#services()
    return s.install.installFromSourceSelection({
      source,
      selectors: options?.all ? [] : (options?.skills ?? []),
      overwrite: Boolean(options?.overwrite),
      allowInsecureHttp: Boolean(options?.allowInsecureHttp),
    })
  }

  /** `aeksm update --plan` — candidates grouped by source. */
  updatePlan() {
    return this.#services().update.plan()
  }

  /** `aeksm update` — one source group (`source`) or selected skills (`skills`). */
  update(options: { skills?: string[]; source?: string }) {
    const s = this.#services()
    return options.source ? s.update.updateSource(options.source) : s.update.updateSkills(options.skills ?? [])
  }
}
