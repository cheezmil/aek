/**
 * The BM round rewrote the panel's home view in the house style — no
 * greeting block, no setup card. One overview band (title + summary line +
 * three stat chips), the two primary action tiles, and the global
 * workspace card whose detected agents render as a chip strip. All
 * values derive from the overview's distribution data (the
 * `domain/workspace` tier), not from a new host face.
 */
import { AgentIcon } from './AgentIcon.tsx'
import { Icon } from '../../Icons.tsx'
import { useI18n } from '../../i18n.tsx'
import { Button } from '@/components/ui/button'
import { PanelCard } from '../../ui-kit.tsx'
import { syncCoverage } from '../domain/workspace.ts'
import { useSkillView } from './shared.tsx'

/** A compact stat chip: label over the value, small icon square on the left. */
function StatChip({ label, value, icon }: { label: string; value: string; icon: 'layers' | 'check' | 'globe' }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2">
      <span className="flex h-7 w-7 items-center justify-center rounded bg-accent-soft text-accent-ink">
        <Icon name={icon} size={14} />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-text">{value}</div>
        <div className="text-2xxs text-muted-foreground">{label}</div>
      </div>
    </div>
  )
}

export function DashboardView() {
  const { t, tf } = useI18n()
  const { skills, goNav, notify } = useSkillView()

  const overview = skills.overview
  if (overview === undefined) return null // unreachable: the root guards

  const detectedAgents = overview.agents.filter(agent => agent.detected)
  const { covered, total } = syncCoverage(overview.agents, overview.skills, overview.distributionBySkill)
  const stripAgents = detectedAgents.slice(0, 8)
  const overflow = detectedAgents.length - stripAgents.length

  return (
    <div className="flex flex-col gap-3">
      {/* The house header band: title + summary on the left, stat chips right */}
      <PanelCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-text">{t('panel.skills')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tf('skills.dash.summary', {
              skills: overview.skills.length,
              agents: detectedAgents.length,
              projects: overview.projects.length,
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label={t('skills.dash.card.library')} value={String(overview.skills.length)} icon="layers" />
          <StatChip label={t('skills.dash.card.coverage')} value={`${covered}/${total}`} icon="check" />
          <StatChip label={t('skills.dash.card.agents')} value={String(detectedAgents.length)} icon="globe" />
        </div>
      </PanelCard>

      {/* The two primary actions as tiles (the scan face lands later — its
          tile says so; install drills into the add view). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => { notify('ok', t('skills.dash.scanNote')) }}
          className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-accent/40 hover:bg-secondary/40"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent-ink transition-colors group-hover:bg-accent/20">
            <Icon name="refresh" size={16} />
          </span>
          <span className="text-sm font-semibold text-text">{t('skills.dash.btn.scan')}</span>
          <span className="text-xs text-muted-foreground">{t('skills.dash.scanNote')}</span>
        </button>
        <button
          type="button"
          onClick={() => { goNav({ view: 'add' }) }}
          className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-accent/40 hover:bg-secondary/40"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <Icon name="plus" size={16} />
          </span>
          <span className="text-sm font-semibold text-text">{t('skills.dash.btn.install')}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {t('skills.dash.installNote')}
            <Icon name="chevronDown" size={12} className="-rotate-90" />
          </span>
        </button>
      </div>

      {/* The global workspace card: the detected agents as a chip strip,
          the "all agents" button drills into the workspace view. */}
      <PanelCard className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-text">{t('skills.nav.globalWorkspace')}</div>
          <Button variant="secondary" size="sm" onClick={() => { goNav({ view: 'workspace', agentId: null }) }}>
            {t('skills.nav.allAgents')}
          </Button>
        </div>
        {detectedAgents.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {stripAgents.map(agent => (
              <span key={agent.id} className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-text">
                <AgentIcon agentId={agent.id} size={16} />
                {agent.label}
              </span>
            ))}
            {overflow > 0 && (
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                +{overflow}
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{t('skills.ws.empty')}</div>
        )}
      </PanelCard>
    </div>
  )
}
