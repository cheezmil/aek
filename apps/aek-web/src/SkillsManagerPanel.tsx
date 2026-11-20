/**
 * The skill-manager panel — the BH round: the xingkongliang skills-manager
 * front IA re-voiced for the aeksm engine (route A: the reference's UI
 * shapes, our own widgets — P16; the webui + backend stay the center — P15).
 *
 * Plan B (2026-11-20 user ruling, supersedes Plan A): the reference's LEFT
 * SIDEBAR lives inside the panel, 1:1 with the reference app's column —
 * Dashboard / 技能库 / 安装 Skills / 备份, the Preset + 全局工作区 sections
 * (the per-agent drill-through), the optional projects section, and the
 * bottom 设置 row (jumps to the console rail's Skill 设置 page). The panel
 * owns its own nav state (`SkillNav` — view + agent/project drill id); the
 * console rail stays untouched (the family is the single `skills` row again).
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
  SkillViewProvider,
  type SkillNav,
} from './skill-manager/views/shared.tsx'
import { LibraryView } from './skill-manager/views/LibraryView.tsx'
import { AddView } from './skill-manager/views/AddView.tsx'
import { EmptyStateView } from './skill-manager/views/EmptyStateView.tsx'
import { DashboardView } from './skill-manager/views/DashboardView.tsx'
import { AgentWorkspaceView } from './skill-manager/views/AgentWorkspaceView.tsx'
import { SkillSidebar } from './skill-manager/views/SkillSidebar.tsx'
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
 * The loaded body: the reference's in-panel sidebar (220px, 1:1 structure) +
 * the view column (the shared notice line on top, the active view below).
 * The view is panel-local state — Plan B keeps it OUT of the console rail
 * (the family is back to the single `skills` row; only 设置 leaves the panel).
 */
function SkillsPanelBody({ skills }: { skills: ReturnType<typeof useSkills> }) {
  const [, setPanel] = usePref<PanelId>(PREF_KEYS.panel, 'runtime', oneOf([...NAV_IDS, 'plugins'] as readonly PanelId[]))
  const [nav, setNav] = useState<SkillNav>({ view: 'dashboard' })
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

  const goNav = useCallback((next: SkillNav): void => { setNav(next) }, [])
  const openSettings = useCallback((): void => { setPanel('skillsSettings') }, [setPanel])

  return (
    <SkillViewProvider env={{ skills, nav, goNav, notify }}>
      <div className="flex min-h-130 rounded-lg border border-border bg-card/40">
        <SkillSidebar onOpenSettings={openSettings} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The shared notice line (every write's result, single slot, 4s TTL) */}
          {noticeSlot.notice !== null && (
            <div className={cn(
              'mx-4 mt-4 rounded-md border px-3 py-2 text-xs',
              noticeSlot.notice.kind === 'ok'
                ? 'border-border bg-secondary/40 text-text'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}>
              {noticeSlot.notice.text}
            </div>
          )}
          <div className="flex-1 p-4">
            {nav.view === 'dashboard'
              ? <DashboardView />
              : nav.view === 'library'
                ? <LibraryView />
                : nav.view === 'add'
                  ? <AddView />
                  : nav.view === 'workspace'
                    ? <AgentWorkspaceView />
                    : <EmptyStateView view={nav.view} projectRoot={nav.projectRoot} />}
          </div>
        </div>
      </div>
    </SkillViewProvider>
  )
}
