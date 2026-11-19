/**
 * The skill-hub (skill manager) data hook.
 *
 * The browser face of the `@cheezmil/aek-skill-manager` host half (the
 * `ctx.skillsManager` service mounted by the coraek-profile web profile). One
 * in-process engine powers BOTH the `aeksm` CLI and these routes, so the
 * panel shows exactly what the CLI would.
 *
 * `unsupported` is a 404: a host built before the skill-hub API (or a headless
 * composition that never registered it) still serves the console — the panel
 * degrades to the thin CLI-bridge surface instead of a dead page.
 *
 * Write calls mirror the console's write-confirm rule: the host answers
 * `428 confirm-required` without `confirm: true`, and every write method here
 * sends it (the panel owns the in-UI confirmation, never a native dialog).
 *
 * @module @cheezmil/aek-web/src/useSkills
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CostLedger as DomainCostLedger } from './skill-manager/domain/costLedger.ts'

/** The host route publishing the skill-hub overview. */
export const SKILLS_API = '/api/aek/skills'

/** One hub skill, as `registry.listSkills` returns it. */
export interface SkillRow {
  name: string
  title: string
  category: string
  tags: string[]
  categories: string[]
  consumers: string[]
  description: string
  source: {
    type?: string
    url?: string | null
    subpath?: string | null
    ref?: string | null
  } | null
  archived: boolean
}

/** One catalog agent: the picker's row. */
export interface AgentInfo {
  id: string
  label: string
  detected: boolean
}

/** One physical distribution target for a skill (the `DistributionTarget` wire shape). */
export interface SkillDistributionTarget {
  kind: 'user' | 'project'
  targetRoot: string
  entries: Array<{ runtimePath: string; agents: string[] }>
}

/** Per-skill wiring, keyed by skill name (absent = unlinked). */
export type DistributionBySkill = Record<string, { agents: string[]; targets: SkillDistributionTarget[] }>

/** Hub-level distribution health. */
export interface DistributionHealth {
  managedEntries: number
  agentCoverage: number
  outdated: number
  foreign: number
  leftoverViews: boolean
}

/** The doctor report (read-only hub health). */
export interface DoctorReport {
  skillHome: string
  skillCount: number
  warnings: string[]
  gitStatus: string
  catalog: { source: string; commit: string; date: string; ageDays: number }
}

/** One errored managed entry (a failed refresh). */
export interface ErroredEntry {
  skill: string
  runtimePath: string
  error: string | null
}

/** The overview document (`GET /api/aek/skills`). */
export interface SkillsOverview {
  home: string
  bootstrapped: boolean
  skills: SkillRow[]
  agents: AgentInfo[]
  projects: string[]
  /** The host `status()` face: hub health + the errored managed entries. */
  distribution: { status: DistributionHealth; errored: ErroredEntry[] }
  distributionBySkill: DistributionBySkill
  doctor: DoctorReport
}

/** One update candidate group, as `updatePlan` returns it. */
export interface UpdatePlanGroup {
  key: string
  url: string
  ref?: string
  skills: Array<{ skill: string; title: string; description: string }>
}

/** The resident-cost ledger (the ADR-0018 wire shape; the domain tier's
 *  canonical form, re-exported so the panel and the hook agree). */
export type CostLedger = DomainCostLedger

/** One hub skill's SKILL.md read (`GET /api/aek/skills/get?skill=`). */
export interface SkillDetail {
  skill: string
  dir: string
  archived: boolean
  body: string
}

/** The live skill-hub state. */
export interface SkillsState {
  overview: SkillsOverview | undefined
  cost: CostLedger | undefined
  updatePlan: UpdatePlanGroup[] | undefined
  error: string | undefined
  /** True when the host has no route (an older build): fall back to the CLI bridge. */
  unsupported: boolean
  /** In-flight write, or undefined. */
  busy: boolean
  lastWrite: { ok: boolean; message: string } | undefined
  refresh: () => void
  refreshDetail: (skill: string) => Promise<SkillDetail | undefined>
  distribute: (request: { to: 'user' | 'project'; skills: string[]; agents?: string[]; projectRoot?: string; mode?: 'symlink' | 'copy'; force?: boolean }) => Promise<boolean>
  undistribute: (request: { to: 'user' | 'project'; skills: string[]; agents?: string[]; projectRoot?: string }) => Promise<boolean>
  add: (source: string, options?: { all?: boolean; skills?: string[]; overwrite?: boolean }) => Promise<boolean>
  update: (options: { skills?: string[]; source?: string }) => Promise<boolean>
}

/**
 * The live skill-hub hook.
 * @param refreshSignal - a number bump re-reads the overview + lazy faces.
 * @returns the state.
 */
export function useSkills(refreshSignal = 0): SkillsState {
  const [overview, setOverview] = useState<SkillsOverview | undefined>(undefined)
  const [cost, setCost] = useState<CostLedger | undefined>(undefined)
  const [updatePlan, setUpdatePlan] = useState<UpdatePlanGroup[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [unsupported, setUnsupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastWrite, setLastWrite] = useState<{ ok: boolean; message: string } | undefined>(undefined)
  const seq = useRef(0)

  const refresh = useCallback((): void => {
    const mySeq = ++seq.current
    setUnsupported(false)
    void fetch(SKILLS_API).then(async (response) => {
      if (mySeq !== seq.current) return
      if (response.status === 404) {
        setUnsupported(true)
        return
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined
        setError(body?.message ?? `HTTP ${response.status}`)
        return
      }
      const doc = (await response.json()) as SkillsOverview & { code?: string; message?: string }
      if (mySeq !== seq.current) return
      setOverview(doc)
      setError(undefined)
      // Lazy faces: the cost strip + update strip load on demand (US24 —
      // the ledger never rides /api/state; the panel's top lines do).
      void fetch(`${SKILLS_API}/cost`).then(async (response) => {
        if (mySeq !== seq.current) return
        if (response.ok) setCost((await response.json()) as CostLedger)
      }).catch(() => undefined)
      void fetch(`${SKILLS_API}/update-plan`).then(async (response) => {
        if (mySeq !== seq.current) return
        if (response.ok) setUpdatePlan(((await response.json()) as { plan?: { groups: UpdatePlanGroup[] } }).plan?.groups)
      }).catch(() => undefined)
    }).catch(() => {
      if (mySeq !== seq.current) return
      setError('network')
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, refreshSignal])

  const refreshDetail = useCallback(async (skill: string): Promise<SkillDetail | undefined> => {
    const response = await fetch(`${SKILLS_API}/get?skill=${encodeURIComponent(skill)}`)
    if (!response.ok) return undefined
    return (await response.json()) as SkillDetail
  }, [])

  const write = useCallback(async (action: string, body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true)
    setLastWrite(undefined)
    try {
      const response = await fetch(`${SKILLS_API}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, confirm: true }),
      })
      const doc = (await response.json().catch(() => undefined)) as { ok?: boolean; message?: string; code?: string } | undefined
      const ok = response.ok && doc?.ok !== false
      setLastWrite({ ok, message: ok ? doc?.message ?? 'done' : doc?.message ?? doc?.code ?? `HTTP ${response.status}` })
      if (ok) refresh()
      return ok
    } catch {
      setLastWrite({ ok: false, message: 'network' })
      return false
    } finally {
      setBusy(false)
    }
  }, [refresh])

  return {
    overview,
    cost,
    updatePlan,
    error,
    unsupported,
    busy,
    lastWrite,
    refresh,
    refreshDetail,
    distribute: request => write('distribute', request),
    undistribute: request => write('undistribute', request),
    add: (source, options = {}) => write('add', { source, ...options }),
    update: options => write('update', options),
  }
}
