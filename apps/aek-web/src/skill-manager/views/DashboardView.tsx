/**
 * The reference app's Dashboard — the panel's landing view (greeting,
 * summary line, the agent-setup card, the three stat cards, the two
 * primary actions). The stat values derive from the overview's
 * `distributionBySkill` (the `domain/workspace` tier — coverage/counts),
 * not from a new host face.
 */
import { useState } from 'react'
import { PanelCard } from '../../ui-kit.tsx'
import { useI18n } from '../../i18n.tsx'
import { Icon } from '../../Icons.tsx'
import { Button } from '@/components/ui/button'
import { syncCoverage } from '../domain/workspace.ts'
import { useSkillView } from './shared.tsx'

/** One stat card (the reference's card shape: label + value + icon square). */
function StatCard({ label, value, icon, tone }: { label: string; value: string; icon: 'layers' | 'check' | 'globe'; tone: 'accent' | 'success' | 'primary' }) {
  const toneClass = tone === 'accent' ? 'bg-accent-soft text-accent-ink' : tone === 'success' ? 'bg-secondary text-success' : 'bg-secondary text-primary'
  return (
    <PanelCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
          <div className="mt-2 text-2xl font-bold text-text">{value}</div>
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${toneClass}`}>
          <Icon name={icon} size={15} />
        </span>
      </div>
    </PanelCard>
  )
}

export function DashboardView() {
  const { t, tf } = useI18n()
  const { skills, goNav, notify } = useSkillView()
  const [setupOpen, setSetupOpen] = useState(true)

  const overview = skills.overview
  if (overview === undefined) return null // unreachable: the root guards

  const detected = overview.agents.filter(agent => agent.detected).length
  const { covered, total } = syncCoverage(overview.agents, overview.skills, overview.distributionBySkill)

  return (
    <div className="flex flex-col gap-4">
      {/* Greeting + summary (the reference's header block) */}
      <div>
        <h2 className="text-lg font-bold text-text">{t('skills.dash.greeting')}</h2>
        <p className="mt-1 text-sm text-text-muted">
          {tf('skills.dash.summary', {
            skills: overview.skills.length,
            agents: detected,
            projects: overview.projects.length,
          })}
        </p>
      </div>

      {/* The agent-setup card (the reference's AgentControlSetupCard) */}
      {setupOpen && (
        <PanelCard className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-accent-soft text-accent-ink">
              <Icon name="terminal" size={16} />
            </span>
            <div>
              <div className="text-sm font-semibold text-text">{t('skills.dash.setup.title')}</div>
              <div className="mt-0.5 text-xs text-text-muted">{t('skills.dash.setup.body')}</div>
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { goNav({ view: 'library' }) }}>
              {t('skills.dash.setup.cta')}
            </Button>
            <Button variant="ghost" size="sm" aria-label={t('skills.cancel')} onClick={() => { setSetupOpen(false) }}>
              <Icon name="close" size={14} />
            </Button>
          </div>
        </PanelCard>
      )}

      {/* The three stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t('skills.dash.card.library')} value={String(overview.skills.length)} icon="layers" tone="accent" />
        <StatCard label={t('skills.dash.card.coverage')} value={`${covered}/${total}`} icon="check" tone="success" />
        <StatCard label={t('skills.dash.card.agents')} value={String(detected)} icon="globe" tone="primary" />
      </div>

      {/* The two primary actions (the scan face lands later — its button
          announces that; install goes to the add view). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          className="h-11 text-sm font-semibold"
          onClick={() => { notify('ok', t('skills.dash.scanNote')) }}
        >
          <Icon name="refresh" size={15} />
          {t('skills.dash.btn.scan')}
        </Button>
        <Button variant="secondary" className="h-11 text-sm font-semibold" onClick={() => { goNav({ view: 'add' }) }}>
          <Icon name="plus" size={15} />
          {t('skills.dash.btn.install')}
        </Button>
      </div>

      {/* The workspace drill-through card (the reference's spot for recent
          activity; ours points at the global workspace instead). */}
      <PanelCard className="flex items-center justify-between gap-3 p-4">
        <div className="text-sm font-semibold text-text">{t('skills.nav.globalWorkspace')}</div>
        <Button variant="secondary" size="sm" onClick={() => { goNav({ view: 'workspace', agentId: null }) }}>
          {t('skills.nav.allAgents')}
        </Button>
      </PanelCard>
    </div>
  )
}
