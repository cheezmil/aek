/**
 * The reference app's Global Workspace — "全部 Agents" (the agent card
 * grid) and the per-agent drill-through (its installed-skill list, the
 * two-step remove, the add-from-library sheet). All state comes from the
 * overview + `domain/workspace`; the writes go through the existing
 * distribute/undistribute host faces.
 */
import { useState } from 'react'
import { PanelCard } from '../../ui-kit.tsx'
import { useI18n } from '../../i18n.tsx'
import { Icon } from '../../Icons.tsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { agentSkillCounts, skillsForAgent, skillsNotForAgent } from '../domain/workspace.ts'
import { AgentMark } from './SkillSidebar.tsx'
import { useRunWrite, useSkillView } from './shared.tsx'

/** The all-agents card grid (the reference's agent card shape). */
function AgentCards() {
  const { t } = useI18n()
  const { skills, goNav } = useSkillView()
  const overview = skills.overview
  if (overview === undefined) return null

  const counts = agentSkillCounts(overview.agents, overview.skills, overview.distributionBySkill)
  if (overview.agents.length === 0) {
    return <PanelCard className="p-6 text-center text-sm text-text-muted">{t('skills.nav.noAgents')}</PanelCard>
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {overview.agents.map(agent => (
        <button
          key={agent.id}
          type="button"
          onClick={() => { goNav({ view: 'workspace', agentId: agent.id }) }}
          className={cn(
            'flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 shadow-sm',
            'transition-colors hover:border-accent/50 hover:bg-card/60',
          )}
        >
          <AgentMark label={agent.label} detected={agent.detected} size={40} />
          <div className="text-center">
            <div className="text-sm font-semibold text-text">{agent.label}</div>
            {agent.detected
              ? <div className="mt-0.5 text-2xxs text-text-muted">{`${counts.get(agent.id) ?? 0} Skills`}</div>
              : <div className="mt-0.5 text-2xxs text-danger">{t('skills.nav.agentUnknown')}</div>}
          </div>
        </button>
      ))}
    </div>
  )
}

/** One installed-skill row with the reference's two-step remove. */
function InstalledRow({ skillName, agentId, agentLabel }: { skillName: string; agentId: string; agentLabel: string }) {
  const { t, tf } = useI18n()
  const { skills } = useSkillView()
  const runWrite = useRunWrite()
  const [confirming, setConfirming] = useState(false)

  const row = skills.overview?.skills.find(item => item.name === skillName)
  const undo = () => {
    void runWrite(
      tf('skills.ws.removeOk', { agent: agentLabel, skill: skillName }),
      () => skills.undistribute({ to: 'user', skills: [skillName], agents: [agentId] }),
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text">{skillName}</div>
        {row?.description ? <div className="truncate text-xs text-text-muted">{row.description}</div> : null}
      </div>
      {confirming ? (
        <div className="flex flex-none items-center gap-2 text-xs text-danger">
          {t('skills.ws.removeConfirm')}
          <Button variant="secondary" size="sm" onClick={undo}>
            {t('skills.ws.remove')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setConfirming(false) }}>
            {t('skills.cancel')}
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => { setConfirming(true) }}>
          <Icon name="trash" size={13} />
          {t('skills.ws.remove')}
        </Button>
      )}
    </div>
  )
}

/** The source-type glyph per row (the reference's row-end icon). */
const SKILL_SOURCE_ICON: Record<string, string> = { local: 'pin', git: 'globe', github: 'globe' }

export function AgentWorkspaceView() {
  const { t, tf } = useI18n()
  const { skills, nav, goNav, notify } = useSkillView()
  const [addOpen, setAddOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  const overview = skills.overview
  if (overview === undefined) return null // unreachable: the root guards

  const agentId = nav.agentId ?? undefined

  // All-agents: the card grid.
  if (agentId === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold text-text">{t('skills.nav.globalWorkspace')}</h2>
          <p className="mt-1 text-sm text-text-muted">{t('skills.ws.subtitle')}</p>
        </div>
        <AgentCards />
      </div>
    )
  }

  const agent = overview.agents.find(item => item.id === agentId)
  const installed = skillsForAgent(overview.skills, overview.distributionBySkill, agentId)
  const available = skillsNotForAgent(overview.skills, overview.distributionBySkill, agentId)

  const toggle = (name: string) => {
    setPicked(current => (current.includes(name) ? current.filter(item => item !== name) : [...current, name]))
  }
  const installPicked = async () => {
    const count = picked.length
    const ok = await skills.distribute({ to: 'user', skills: picked, agents: [agentId] })
    if (ok) {
      setPicked([])
      setAddOpen(false)
      notify('ok', tf('skills.ws.addOk', { agent: agent?.label ?? agentId, n: String(count) }))
    } else {
      notify('error', `${t('skills.ws.addSkills')} ✕`)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="text-xs text-text-muted hover:text-text"
          onClick={() => { goNav({ view: 'workspace', agentId: null }) }}
        >
          {t('skills.nav.allAgents')}
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <AgentMark label={agent?.label ?? agentId} detected={agent?.detected ?? false} size={24} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-text">{agent?.label ?? agentId}</h2>
            <p className="text-xs text-text-muted">{t('skills.ws.subtitle')}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setPicked([]); setAddOpen(true) }}>
          <Icon name="plus" size={13} />
          {t('skills.ws.addSkills')}
        </Button>
      </div>

      {agent === undefined && (
        <PanelCard className="flex items-center gap-2 p-3 text-sm text-danger">
          <Icon name="shield" size={15} />
          {t('skills.nav.agentUnknown')}
        </PanelCard>
      )}

      {installed.length === 0 ? (
        <PanelCard className="p-6 text-center text-sm text-text-muted">{t('skills.ws.empty')}</PanelCard>
      ) : (
        <div className="flex flex-col gap-2">
          {installed.map(row => (
            <InstalledRow key={row.name} skillName={row.name} agentId={agentId} agentLabel={agent?.label ?? agentId} />
          ))}
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setAddOpen(false) }} />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <div className="text-sm font-semibold text-text">{tf('skills.ws.addTitle', { agent: agent?.label ?? agentId })}</div>
              <Button variant="ghost" size="sm" onClick={() => { setAddOpen(false) }}>
                <Icon name="close" size={14} />
              </Button>
            </div>
            {available.length === 0 ? (
              <div className="p-3 text-sm text-text-muted">{t('skills.empty')}</div>
            ) : (
              <div className="flex flex-col gap-1.5 overflow-auto p-3">
                {available.map(row => (
                  <button
                    key={row.name}
                    type="button"
                    onClick={() => { toggle(row.name) }}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm',
                      picked.includes(row.name) ? 'border-accent/60 bg-accent-soft/50 text-text' : 'border-border bg-card text-text hover:bg-secondary/50',
                    )}
                  >
                    <span className="flex h-4 w-4 flex-none items-center justify-center rounded border border-border bg-secondary">
                      {picked.includes(row.name) && <Icon name="check" size={10} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <Icon name={SKILL_SOURCE_ICON[row.source?.type ?? 'local'] ?? 'pin'} size={13} className="text-text-muted" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-border p-3">
              <Badge variant="ghost">{picked.length}</Badge>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setAddOpen(false) }}>
                  {t('skills.cancel')}
                </Button>
                <Button size="sm" disabled={picked.length === 0} onClick={() => { void installPicked() }}>
                  {t('skills.addInstall')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
