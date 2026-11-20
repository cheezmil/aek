/**
 * The skill-manager view tier's shared pieces: the view context (the root
 * panel's data + cross-tab navigation + the shared notice slot), the sheet
 * frame every overlay renders into, and the row-shape helpers the library
 * view and its sheets share.
 *
 * P16: our own shadcn/radix + console primitives — never the reference's
 * component source.
 */
import { createContext, useCallback, useContext } from 'react'
import type { ReactNode } from 'react'
import type { AgentInfo, DistributionBySkill, SkillsState, SkillRow } from '../../useSkills.ts'
import { Icon, type IconName } from '../../Icons.tsx'
import { cn } from '@/lib/utils'
import type { DistributionTarget } from '../domain/distribution.ts'
import type { RowStatus } from '../domain/rowStatus.ts'
import type { PickerAgent } from '../domain/picker.ts'

/** The panel's seven views (the reference's IA, 0-conclusion + m01832
 *  sidebar ruling): dashboard / library / add are live faces; preset /
 *  project / backup are the engine-supported empty states; workspace is
 *  the 全局工作区 (per-agent skill set). */
export type SkillViewId = 'dashboard' | 'library' | 'add' | 'preset' | 'project' | 'backup' | 'workspace'

/** The view ids in the reference's sidebar order. */
export const SKILL_VIEW_IDS: readonly SkillViewId[] = ['dashboard', 'library', 'add', 'backup', 'preset', 'project', 'workspace']

/** The sidebar glyph per view (the app's own icon set, P16). */
export const SKILL_VIEW_ICONS: Record<SkillViewId, IconName> = {
  dashboard: 'layout',
  library: 'layers',
  add: 'save',
  preset: 'layers',
  project: 'puzzle',
  backup: 'restore',
  workspace: 'globe',
}

/** A sidebar navigation target (the view + the drill-down payload). */
export interface SkillNav {
  view: SkillViewId
  /** `workspace` view: the agent to drill into; null/absent = all agents. */
  agentId?: string | null
  /** `project` view: the project root the empty state displays. */
  projectRoot?: string | null
}

export interface SkillViewEnv {
  /** The root-owned skill-hub state (one `useSkills` for every view). */
  skills: SkillsState
  /** The panel-local navigation target (the reference's sidebar owns it). */
  nav: SkillNav
  /** Cross-view navigation (panel-local state, NOT the console rail). */
  goNav: (next: SkillNav) => void
  /** The shared notice slot (single line, 4s TTL, above the active view). */
  notify: (kind: 'ok' | 'error', text: string) => void
}

const SkillViewContext = createContext<SkillViewEnv | null>(null)

export function SkillViewProvider({ env, children }: { env: SkillViewEnv; children: ReactNode }) {
  return <SkillViewContext.Provider value={env}>{children}</SkillViewContext.Provider>
}

/** @throws when a view renders outside the panel root. */
export function useSkillView(): SkillViewEnv {
  const env = useContext(SkillViewContext)
  if (env === null) throw new Error('skill-manager view rendered outside the panel root')
  return env
}

/** Run a write-domain action and announce its result into the shared notice
 *  slot (ok → the label; failure → `${label} ✕`). */
export function useRunWrite(): (label: string, action: () => Promise<boolean>) => Promise<void> {
  const { notify } = useSkillView()
  return useCallback(async (label: string, action: () => Promise<boolean>): Promise<void> => {
    const ok = await action()
    notify(ok ? 'ok' : 'error', ok ? label : `${label} ✕`)
  }, [notify])
}

/** One row's derived state (the registry `SkillRow` spread + the four fields
 *  the row-status / filter / update domains reason about). */
export interface RowState {
  name: string
  title: string
  category: string
  tags: string[]
  categories: string[]
  consumers: string[]
  description: string
  source: SkillRow['source']
  archived: boolean
  hasUpdate: boolean
  warning: string | null
  distributedAgents: string[]
  distribution: DistributionTarget[]
}

/** Read one skill's wiring out of the per-skill map (absent = unlinked). */
export function wiringOf(map: DistributionBySkill, name: string): DistributionBySkill[string] | undefined {
  return map[name]
}

/** A uniform agent row for the picker (the catalog has no families yet). */
export function toPickerAgents(agents: AgentInfo[]): PickerAgent[] {
  return agents.map(agent => ({
    id: agent.id,
    label: agent.label,
    detected: agent.detected,
    familyKey: null,
    invalidReason: null,
  }))
}

/** The status-dot palette: theme chart tokens (danger / neutral / accent / success / muted). */
export function statusDotClass(status: RowStatus): string {
  switch (status.kind) {
    case 'warning': return 'bg-chart-4'
    case 'detectionFailed': return 'bg-chart-3'
    case 'updatable': return 'bg-chart-1'
    case 'distributed': return 'bg-chart-2'
    case 'unlinked': return 'bg-chart-5'
  }
}

/** The top overlay frame: a right-side sheet over a dimmed backdrop. */
export function SheetFrame({ title, onClose, children, wide }: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cn('flex h-full flex-col border-l border-border bg-background shadow-lg', wide ? 'w-full max-w-2xl' : 'w-full max-w-lg')}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-sm font-bold text-text">{title}</div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary" aria-label="close">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
