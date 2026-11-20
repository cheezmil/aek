/**
 * The skill-manager panel — the BH round: the xingkongliang skills-manager
 * front IA re-voiced for the aeksm engine (route A: the reference's UI
 * shapes, our own widgets — P16; the webui + backend stay the center — P15).
 *
 * Plan C (2026-11-20 user ruling m02462, supersedes Plan B's in-panel
 * sidebar): the reference's LEFT COLUMN lives in the HOST's secondary rail
 * (`PluginSubNav`) — the flat skills-family routes (技能库 / 安装 Skills /
 * 备份 / Skill 设置) plus the plugin-filled extras sections (the Preset /
 * 全局工作区 agent sub-list, each agent row with its brand icon, the
 * optional Projects group), published through the `rail-extras` store. The
 * panel renders the single view column: the base view is derived from the
 * host's active panel (`skillViewOfPanel`); the preset / workspace /
 * project drill-throughs are panel-local state the extras rows drive.
 *
 * Data: one `useSkills` for the whole panel (the host's `/api/aek/skills/*`,
 * the SAME in-process engine the `aeksm` CLI drives); the shared notice slot
 * (single line, 4s TTL) is owned here. When the host predates the API
 * (404 = `unsupported`), the panel degrades to the thin CLI-bridge surface
 * (the `SkillsPanel`) instead of a dead page.
 *
 * @module @cheezmil/aek-web/src/SkillsManagerPanel
 */
import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { PanelCard, Spinner } from './ui-kit.tsx'
import { useSkills } from './useSkills.ts'
import {
  expireNotice,
  idleNotice,
  showNotice,
  type NoticeSlot,
} from './skill-manager/domain/noticeSlot.ts'
import {
  SKILL_VIEW_PANELS,
  SkillViewProvider,
  skillViewOfPanel,
  type SkillNav,
} from './skill-manager/views/shared.tsx'
import { LibraryView } from './skill-manager/views/LibraryView.tsx'
import { AddView } from './skill-manager/views/AddView.tsx'
import { EmptyStateView } from './skill-manager/views/EmptyStateView.tsx'
import { DashboardView } from './skill-manager/views/DashboardView.tsx'
import { AgentWorkspaceView } from './skill-manager/views/AgentWorkspaceView.tsx'
import { AgentIcon } from './skill-manager/views/AgentIcon.tsx'
import { agentSkillCounts } from './skill-manager/domain/workspace.ts'
import { setRailExtras, type RailExtraSection } from './rail-extras.ts'
import { SkillsPanel } from './ConsolePanels.tsx'
import { NAV_IDS, type PanelId } from './nav-model.ts'
import { oneOf, PREF_KEYS, usePref } from './preferences.tsx'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The skill-manager panel.
 * @param refreshSignal - a number bump re-fetches the overview.
 */
export function SkillsManagerPanel({ refreshSignal }: { refreshSignal: number }) {
  const { t } = useI18n()
  const skills = useSkills(refreshSignal)
  // Older host (no skill-hub API): degrade to the CLI-bridge console, never
  // render a dead page.
  if (skills.unsupported) return <SkillsPanel refreshSignal={refreshSignal} />

  if (skills.error !== undefined && skills.overview === undefined) {
    return (
      <PanelCard>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon name="alert" size={20} />
          <div className="text-sm text-muted-foreground">{t('skills.error')}: {skills.error}</div>
          <Button variant="secondary" size="sm" onClick={skills.refresh}>{t('skills.retry')}</Button>
        </div>
      </PanelCard>
    )
  }

  if (skills.overview === undefined) {
    return (
      <PanelCard>
        <div className="flex items-center justify-center gap-3 py-16"><Spinner /><span className="text-sm text-muted-foreground">{t('skills.loading')}</span></div>
      </PanelCard>
    )
  }

  return <SkillsPanelBody skills={skills} />
}

/**
 * The loaded body — Plan C: the reference's left column lives in the HOST
 * rail (the flat skills-family routes + the plugin-filled extras sections
 * below them); the panel renders the single view column. The base view is
 * derived from the host's active panel (`skillViewOfPanel`); the preset /
 * workspace / project drill-throughs are panel-local state the extras rows
 * (and the views' own buttons) drive.
 */
function SkillsPanelBody({ skills }: { skills: ReturnType<typeof useSkills> }) {
  const { t } = useI18n()
  const [panel, setPanel] = usePref<PanelId>(PREF_KEYS.panel, 'runtime', oneOf([...NAV_IDS, 'plugins'] as readonly PanelId[]))
  const [drill, setDrill] = useState<SkillNav | null>(null)
  const [noticeSlot, setNoticeSlot] = useState<NoticeSlot>(idleNotice)

  const notify = useCallback((kind: 'ok' | 'error', text: string): void => {
    setNoticeSlot(previous => showNotice(previous, kind, text, Date.now()))
  }, [])

  // The single notice line expires on its own (the domain's 4s TTL).
  useEffect(() => {
    if (noticeSlot.dismissAt === null) return
    const remaining = noticeSlot.dismissAt - Date.now()
    if (remaining <= 0) {
      setNoticeSlot(current => expireNotice(current, Date.now()))
      return
    }
    const timer = setTimeout(() => { setNoticeSlot(current => expireNotice(current, Date.now())) }, remaining)
    return () => { clearTimeout(timer) }
  }, [noticeSlot])

  const goNav = useCallback((next: SkillNav): void => {
    if (next.view === 'workspace' || next.view === 'preset' || next.view === 'project') {
      setDrill(next)
      return
    }
    setDrill(null)
    setPanel(SKILL_VIEW_PANELS[next.view])
  }, [setPanel])

  // A host rail click (or a deep link) into the family's flat routes
  // resets the panel-local drill-through: the base view is rail-owned.
  useEffect(() => { setDrill(null) }, [panel])

  const nav: SkillNav = drill !== null ? drill : { view: skillViewOfPanel(panel) }

  // Plan C: fill the host rail's extras sections — the reference's Preset /
  // 全局工作区 (the agent sub-list with brand icons) + optional Projects
  // groups (the agentSkillCounts badges, the active-row highlight).
  const overview = skills.overview
  useEffect(() => {
    if (overview === undefined) return
    const counts = agentSkillCounts(overview.agents, overview.skills, overview.distributionBySkill)
    const sections: RailExtraSection[] = [
      {
        key: 'preset',
        title: t('skills.nav.presets'),
        rows: [{
          id: 'newPreset',
          label: t('skills.nav.newPreset'),
          icon: <Icon name="plus" size={14} />,
          active: nav.view === 'preset',
          onClick: () => { goNav({ view: 'preset' }) },
        }],
      },
      {
        key: 'workspace',
        title: t('skills.nav.globalWorkspace'),
        rows: [
          {
            id: 'allAgents',
            label: t('skills.nav.allAgents'),
            icon: <AgentIcon agentId="all" label={t('skills.nav.allAgents')} />,
            badge: overview.skills.length,
            active: nav.view === 'workspace' && (nav.agentId === null || nav.agentId === undefined),
            onClick: () => { goNav({ view: 'workspace', agentId: null }) },
          },
          ...overview.agents.map(agent => ({
            id: agent.id,
            label: agent.label,
            icon: <AgentIcon agentId={agent.id} label={agent.label} />,
            badge: counts.get(agent.id) ?? null,
            active: nav.view === 'workspace' && nav.agentId === agent.id,
            onClick: () => { goNav({ view: 'workspace', agentId: agent.id }) },
            className: agent.detected ? undefined : 'opacity-60',
          })),
        ],
      },
    ]
    if (overview.projects.length > 0) {
      sections.push({
        key: 'projects',
        title: t('skills.nav.projects'),
        rows: [
          ...overview.projects.map(root => ({
            id: `project:${root}`,
            label: root,
            icon: <Icon name="puzzle" size={14} />,
            active: nav.view === 'project' && nav.projectRoot === root,
            onClick: () => { goNav({ view: 'project', projectRoot: root }) },
          })),
          {
            id: 'addProject',
            label: t('skills.nav.addProject'),
            icon: <Icon name="plus" size={14} />,
            active: nav.view === 'project' && (nav.projectRoot === null || nav.projectRoot === undefined),
            onClick: () => { goNav({ view: 'project', projectRoot: null }) },
          },
        ],
      })
    }
    setRailExtras('skills', sections)
  }, [overview, nav, t, goNav])

  // Unmount: hand the host rail back its flat routes only.
  useEffect(() => () => { setRailExtras('skills', []) }, [])

  return (
    <SkillViewProvider env={{ skills, nav, goNav, notify }}>
      <div className="min-h-130 rounded-lg border border-border bg-card/40 p-4">
        {/* The shared notice line (every write's result, single slot, 4s TTL) */}
        {noticeSlot.notice !== null && (
          <div className={cn(
            'mb-4 rounded-md border px-3 py-2 text-xs',
            noticeSlot.notice.kind === 'ok'
              ? 'border-border bg-secondary/40 text-text'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          )}>
            {noticeSlot.notice.text}
          </div>
        )}
        {/* The ANCHOR sites: the host's anchor-scroll effect (and the
            verify-plugin-rails gate) greps these STATIC containers. */}
        {nav.view === 'dashboard'
          ? <DashboardView />
          : nav.view === 'library'
            ? <div data-nav-anchor="library"><LibraryView /></div>
            : nav.view === 'add'
              ? <div data-nav-anchor="add"><AddView /></div>
              : nav.view === 'backup'
                ? <div data-nav-anchor="backup"><EmptyStateView view="backup" /></div>
                : nav.view === 'workspace'
                  ? <AgentWorkspaceView />
                  : <EmptyStateView view={nav.view} projectRoot={nav.projectRoot} />}
      </div>
    </SkillViewProvider>
  )
}
