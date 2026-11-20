/**
 * The skill-manager panel — the BH round: the xingkongliang skills-manager
 * front IA re-voiced for the aeksm engine (route A: the reference's UI
 * shapes, our own widgets — P16; the webui + backend stay the center — P15).
 *
 * Plan A (2026-11-20 user ruling): the five views live on the FAMILY rail,
 * not in a panel-local tab bar. The library (the reference's MySkills,
 * implemented) IS the family root row (`skills`); the add-source face
 * (InstallSkills, implemented) plus three honest "not enabled yet" empty
 * states (presets / project workspaces / git backup — the engine already
 * ships all three, the panel faces land in later rounds) are the rail's
 * ANCHOR sub-rows (`skillsAdd` / `skillsPreset` / `skillsProject` /
 * `skillsBackup`; the R2 rail mechanism: the same content tree, positioned
 * in-page via `data-nav-anchor`).
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
  type SkillViewId,
} from './skill-manager/views/shared.tsx'
import { LibraryView } from './skill-manager/views/LibraryView.tsx'
import { AddView } from './skill-manager/views/AddView.tsx'
import { EmptyStateView } from './skill-manager/views/EmptyStateView.tsx'
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
 * The loaded body: the shared notice line + the five rail-driven views.
 * The view is owned by the CONSOLE's panel pref (the family rail rows) —
 * every sub-row shares this content tree (keep-alive render id `skills`),
 * so a panel-local tab state could not see the rail.
 */
function SkillsPanelBody({ skills }: { skills: ReturnType<typeof useSkills> }) {
  const [panel, setPanel] = usePref<PanelId>(PREF_KEYS.panel, 'runtime', oneOf([...NAV_IDS, 'plugins'] as readonly PanelId[]))
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

  const view = skillViewOfPanel(panel)
  const goView = useCallback((next: SkillViewId): void => { setPanel(SKILL_VIEW_PANELS[next]) }, [setPanel])

  return (
    <SkillViewProvider env={{ skills, goView, notify }}>
      <div className="flex flex-col gap-3">
        {/* The shared notice line (every write's result, single slot, 4s TTL) */}
        {noticeSlot.notice !== null && (
          <div className={cn(
            'rounded-md border px-3 py-2 text-xs',
            noticeSlot.notice.kind === 'ok'
              ? 'border-border bg-secondary/40 text-text'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          )}>
            {noticeSlot.notice.text}
          </div>
        )}

        {/* Plan A: the five rail views. The four sub-rows position this
            family page via `data-nav-anchor` (the R2 mechanism;
            verify-plugin-rails greps these sites statically, so each stays
            a literal — no dynamic {view} attribute). */}
        {view === 'library'
          ? <LibraryView />
          : view === 'add'
            ? (
              <div data-nav-anchor="add">
                <AddView />
              </div>
            )
            : view === 'preset'
              ? (
                <div data-nav-anchor="preset">
                  <EmptyStateView view="preset" />
                </div>
              )
              : view === 'project'
                ? (
                  <div data-nav-anchor="project">
                    <EmptyStateView view="project" />
                  </div>
                )
                : (
                  <div data-nav-anchor="backup">
                    <EmptyStateView view="backup" />
                  </div>
                )}
      </div>
    </SkillViewProvider>
  )
}
