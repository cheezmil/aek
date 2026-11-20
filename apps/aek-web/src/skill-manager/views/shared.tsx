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
import type { PanelId } from '../../nav-model.ts'
import { cn } from '@/lib/utils'
import type { DistributionTarget } from '../domain/distribution.ts'
import type { RowStatus } from '../domain/rowStatus.ts'
import type { PickerAgent } from '../domain/picker.ts'

/** The panel's five views (the reference's 7-page IA folded; 0 conclusion). */
export type SkillViewId = 'library' | 'add' | 'preset' | 'project' | 'backup'

/** The five view ids in rail order. */
export const SKILL_VIEW_IDS: readonly SkillViewId[] = ['library', 'add', 'preset', 'project', 'backup']

/** The rail glyph per view (the app's own icon set, P16). */
export const SKILL_VIEW_ICONS: Record<SkillViewId, IconName> = {
  library: 'book',
  add: 'plus',
  preset: 'layers',
  project: 'puzzle',
  backup: 'restore',
}

/**
 * The rail row (PanelId) that carries each view: `library` is the family
 * root row itself; the other four are its ANCHOR sub-rows (the R2 rail
 * mechanism — same content tree, in-page position).
 */
export const SKILL_VIEW_PANELS: Record<SkillViewId, PanelId> = {
  library: 'skills',
  add: 'skillsAdd',
  preset: 'skillsPreset',
  project: 'skillsProject',
  backup: 'skillsBackup',
}

/** The view a rail row carries (the family root is the library). */
export function skillViewOfPanel(panel: PanelId): SkillViewId {
  switch (panel) {
    case 'skills': return 'library'
    case 'skillsAdd': return 'add'
    case 'skillsPreset': return 'preset'
    case 'skillsProject': return 'project'
    case 'skillsBackup': return 'backup'
    default: return 'library'
  }
}

export interface SkillViewEnv {
  /** The root-owned skill-hub state (one `useSkills` for every view). */
  skills: SkillsState
  /** Cross-view navigation (the family rail row, owned by the console root). */
  goView: (view: SkillViewId) => void
  /** The shared notice slot (single line, 4s TTL, below the active view). */
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
