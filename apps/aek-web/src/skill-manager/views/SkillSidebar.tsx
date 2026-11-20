/**
 * The panel's own sidebar — the reference app's left column re-voiced in
 * our console's theme tokens (P16: layout/IA copied, widgets our own):
 * the four nav rows, the two collapsible sections (Presets / 全局工作区),
 * the optional projects section (hidden when empty, the reference's
 * hideWhenEmpty rule), and the bottom settings row (jumps to the console
 * rail's Skill 设置 page).
 *
 * The sidebar owns no data of its own — every count and agent row derives
 * from the panel's `useSkills` overview (the `domain/workspace` tier).
 */
import { useState } from 'react'
import { useI18n } from '../../i18n.tsx'
import { Icon } from '../../Icons.tsx'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { agentSkillCounts } from '../domain/workspace.ts'
import { SKILL_VIEW_ICONS, useSkillView } from './shared.tsx'

/** One collapsible section's state. */
function SectionHead({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-text"
      aria-expanded={open}
    >
      <Icon name="chevronDown" size={12} className={cn('transition-transform', !open && '-rotate-90')} />
      {title}
    </button>
  )
}

/** One sidebar navigation row (the reference's row shape, our tokens).
 * `icon` is optional — the agent rows render their own `AgentMark` instead. */
function NavRow({ active, icon, label, onClick, children }: {
  active: boolean
  icon?: string
  label: string
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.75 text-sm font-medium',
        active ? 'bg-accent-soft text-accent-ink' : 'text-muted-foreground hover:bg-secondary hover:text-text',
      )}
    >
      {icon !== undefined && <Icon name={icon} size={15} className={cn('flex-none', active ? 'text-accent-ink' : 'text-text-muted')} />}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {children}
    </button>
  )
}

/** The agent's own 20×20 mark (first letter — P16, no copied AgentIcon). */
export function AgentMark({ label, detected, size = 20 }: { label: string; detected: boolean; size?: number }) {
  return (
    <span
      className={cn(
        'flex flex-none items-center justify-center rounded-md border border-border bg-secondary text-2xxs font-bold',
        detected ? 'text-text' : 'text-text-muted opacity-60',
      )}
      style={{ width: size, height: size }}
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function SkillSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t, tf } = useI18n()
  const { skills, nav, goNav } = useSkillView()
  const [presetOpen, setPresetOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(false)

  const overview = skills.overview
  if (overview === undefined) return null // unreachable: the root guards

  const counts = agentSkillCounts(overview.agents, overview.skills, overview.distributionBySkill)
  const detectedCount = overview.agents.filter(agent => agent.detected).length
  const allActive = nav.view === 'workspace' && (nav.agentId === null || nav.agentId === undefined)
  const projects = overview.projects

  const go = (view: 'dashboard' | 'library' | 'add' | 'backup') => { goNav({ view }) }

  return (
    <div className="flex h-full w-55 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-card/60 p-2.5">
      {/* App mark (the reference's logo + name block, our house style) */}
      <div className="flex items-center gap-2 px-1 pb-2 pt-1">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-accent-soft text-accent-ink">
          <Icon name="sparkles" size={14} />
        </span>
        <div className="text-sm font-bold text-text">{t('panel.skills')}</div>
      </div>

      {/* The four top-level rows (the reference's NAV_ITEMS) */}
      <NavRow active={nav.view === 'dashboard'} icon={SKILL_VIEW_ICONS.dashboard} label={t('skills.nav.dashboard')} onClick={() => { go('dashboard') }} />
      <NavRow active={nav.view === 'library'} icon={SKILL_VIEW_ICONS.library} label={t('skills.nav.library')} onClick={() => { go('library') }} />
      <NavRow active={nav.view === 'add'} icon={SKILL_VIEW_ICONS.add} label={t('skills.nav.install')} onClick={() => { go('add') }} />
      <NavRow active={nav.view === 'backup'} icon={SKILL_VIEW_ICONS.backup} label={t('skills.nav.backup')} onClick={() => { go('backup') }} />

      <div className="mx-2 my-1 border-t border-border" />

      {/* Preset section (the engine ships ADR-0019 presets; the panel face
          lands later — the section's row points at the honest empty state). */}
      <div className="px-0.5">
        <SectionHead title={t('skills.nav.presets')} open={presetOpen} onToggle={() => { setPresetOpen(v => !v) }} />
        {presetOpen && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            <NavRow active={nav.view === 'preset'} icon="plus" label={t('skills.nav.newPreset')} onClick={() => { goNav({ view: 'preset' }) }} />
          </div>
        )}
      </div>

      <div className="mx-2 my-1 border-t border-border" />

      {/* 全局工作区 section: all-agents row + one row per catalog agent
          (the per-agent installed-skill count is the reference's badge). */}
      <div className="px-0.5">
        <SectionHead title={t('skills.nav.globalWorkspace')} open={workspaceOpen} onToggle={() => { setWorkspaceOpen(v => !v) }} />
        {workspaceOpen && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            <NavRow
              active={allActive}
              icon="globe"
              label={t('skills.nav.allAgents')}
              onClick={() => { goNav({ view: 'workspace', agentId: null }) }}
            >
              <Badge variant="secondary" className="min-w-4.5 rounded-full px-1 text-center text-2xxs">{overview.skills.length}</Badge>
            </NavRow>
            {overview.agents.length === 0
              ? <div className="px-2.5 py-1 text-xs text-text-muted">{t('skills.nav.noAgents')}</div>
              : overview.agents.map(agent => (
                <NavRow
                  key={agent.id}
                  active={nav.view === 'workspace' && nav.agentId === agent.id}
                  label={agent.label}
                  onClick={() => { goNav({ view: 'workspace', agentId: agent.id }) }}
                >
                  <AgentMark label={agent.label} detected={agent.detected} />
                  {(counts.get(agent.id) ?? 0) > 0 && (
                    <Badge variant="secondary" className="min-w-4.5 rounded-full px-1 text-center text-2xxs">{counts.get(agent.id)}</Badge>
                  )}
                </NavRow>
              ))}
            <div className="px-2.5 pt-1 text-2xxs text-text-muted">
              {tf('skills.ws.detectedLine', { detected: detectedCount, total: overview.agents.length })}
            </div>
          </div>
        )}
      </div>

      {/* Projects section — the reference's hideWhenEmpty rule: shown only
          when the engine's knownProjects is non-empty. */}
      {projects.length > 0 && (
        <>
          <div className="mx-2 my-1 border-t border-border" />
          <div className="px-0.5">
            <SectionHead title={t('skills.nav.projects')} open={projectsOpen} onToggle={() => { setProjectsOpen(v => !v) }} />
            {projectsOpen && (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {projects.map(root => (
                  <NavRow
                    key={root}
                    active={nav.view === 'project' && nav.projectRoot === root}
                    icon="puzzle"
                    label={root.split('/').filter(Boolean).pop() ?? root}
                    onClick={() => { goNav({ view: 'project', projectRoot: root }) }}
                  />
                ))}
                <NavRow active={false} icon="plus" label={t('skills.nav.addProject')} onClick={() => { goNav({ view: 'project', projectRoot: null }) }} />
              </div>
            )}
          </div>
        </>
      )}

      {/* Settings pinned to the bottom (jumps to the console rail's page). */}
      <div className="mt-auto border-t border-border p-2.5 pt-2.5">
        <NavRow active={false} icon="settings" label={t('skills.nav.settings')} onClick={onOpenSettings} />
      </div>
    </div>
  )
}
