import type { CatalogService } from '../core/services/catalog-service.js'

/**
 * AEK policy (user decision 2026-11-04): the default distribution target set
 * EXCLUDES the shared "agents pool" — a global skills dir that several catalog
 * agents share (the Agent Skills convention, e.g. `~/.agents/skills` or its
 * XDG form `<config>/agents/skills`). The pool is not linked; it is reconciled
 * instead (`aeksm pool reconcile`: stray physical skills move into the hub,
 * same-name conflicts resolve by newer mtime). An explicit `-a <id>` always
 * overrides this default.
 *
 * Pool detection is data-driven (no hardcoded paths): a resolved global dir is
 * a pool iff (a) 2+ catalog agents map to it and (b) its last two path segments
 * are `agents/skills` or `.agents/skills` (home or XDG form of the agents
 * convention). This deliberately does NOT pool vendor dirs that two brands
 * happen to share (e.g. a `zencoder` + `zenflow` pair sharing one dir stays a
 * normal distribution target).
 */

function lastSegments(p: string, n: number): string[] {
  return p.split(/[\\/]/).filter(Boolean).slice(-n)
}

export function sharedPoolDirs(catalog: CatalogService): string[] {
  const snapshot = catalog.load()
  const byDir = new Map<string, string[]>()
  for (const agent of snapshot.agents) {
    if (!agent.globalSkillsDir) continue
    const resolved = catalog.resolveGlobalDir(agent.id)
    if (resolved === null) continue
    byDir.set(resolved, [...(byDir.get(resolved) ?? []), agent.id])
  }
  const out: string[] = []
  for (const [dir, ids] of byDir) {
    if (ids.length < 2) continue
    const name = lastSegments(dir, 2)[0]
    if (name === 'agents' || name === '.agents') out.push(dir)
  }
  return [...new Set(out)].sort()
}

export function sharedPoolAgentIds(catalog: CatalogService): Set<string> {
  const pools = new Set(sharedPoolDirs(catalog))
  const out = new Set<string>()
  for (const agent of catalog.load().agents) {
    const resolved = agent.globalSkillsDir ? catalog.resolveGlobalDir(agent.id) : null
    if (resolved !== null && pools.has(resolved)) out.add(agent.id)
  }
  return out
}

/** Default user-target distribution set: detected agents minus shared-pool agents. */
export function defaultDistributeAgents(catalog: CatalogService): string[] {
  const pool = sharedPoolAgentIds(catalog)
  return catalog.detected().filter(id => !pool.has(id))
}
