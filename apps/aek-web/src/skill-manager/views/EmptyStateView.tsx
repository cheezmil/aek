/**
 * The two "not enabled yet" faces (project workspaces / git backup). The
 * engine already ships them — project workspaces, ADR-0020 git-based
 * multi-machine sync — but the panel face lands in a later round, so the
 * view shows an honest empty state: what exists, what is pending, and
 * where the operator can go today (the CLI).
 *
 * BN round: re-voiced as a proper page — the shared ViewHeader plus one
 * left-aligned feature card (icon tile + status + the pending face's story),
 * no centered floating glyph.
 */
import { useI18n } from '../../i18n.tsx'
import { Icon } from '../../Icons.tsx'
import { PanelCard } from '../../ui-kit.tsx'
import { SKILL_VIEW_ICONS, ViewHeader } from './shared.tsx'

/** The two deferred views (everything except the live faces). */
export type EmptyViewId = 'project' | 'backup'

export function EmptyStateView({ view, projectRoot }: { view: EmptyViewId; projectRoot?: string | null }) {
  const { t } = useI18n()
  const icon = SKILL_VIEW_ICONS[view]
  const titleKey = view === 'project' ? 'skills.project.title' : 'skills.backup.title'
  const hintKey = view === 'project' ? 'skills.project.hint' : 'skills.backup.hint'
  return (
    <div className="flex flex-col gap-4">
      <ViewHeader icon={icon} title={t(titleKey)} subtitle={t('skills.empty.tag')} />
      <PanelCard className="p-5">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
            <Icon name={icon} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-text">{t('skills.empty.tag')}</span>
              {view === 'project' && projectRoot !== null && projectRoot !== undefined && (
                <code className="max-w-full truncate rounded bg-secondary px-2 py-0.5 text-2xxs text-muted-foreground">{projectRoot}</code>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t(hintKey)}</p>
          </div>
        </div>
      </PanelCard>
    </div>
  )
}
