/**
 * The two "not enabled yet" faces (project workspaces / git backup). The
 * engine already ships them — project workspaces, ADR-0020 git-based
 * multi-machine sync — but the panel face lands in a later round, so the
 * view shows an honest empty state: what exists, what is pending, and
 * where the operator can go today (the CLI).
 *
 * BM round: house style — the shared ViewHeader plus one quiet card, no
 * centered floating glyph.
 */
import { useI18n } from '../../i18n.tsx'
import { PanelCard } from '../../ui-kit.tsx'
import { Badge } from '@/components/ui/badge'
import { SKILL_VIEW_ICONS, ViewHeader } from './shared.tsx'

/** The two deferred views (everything except the live faces). */
export type EmptyViewId = 'project' | 'backup'

export function EmptyStateView({ view, projectRoot }: { view: EmptyViewId; projectRoot?: string | null }) {
  const { t } = useI18n()
  const titleKey = view === 'project' ? 'skills.project.title' : 'skills.backup.title'
  const hintKey = view === 'project' ? 'skills.project.hint' : 'skills.backup.hint'
  return (
    <div className="flex flex-col gap-3">
      <ViewHeader
        icon={SKILL_VIEW_ICONS[view]}
        title={t(titleKey)}
        subtitle={t('skills.empty.tag')}
      />
      <PanelCard className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        {view === 'project' && projectRoot !== null && projectRoot !== undefined && (
          <code className="max-w-full truncate rounded bg-secondary px-3 py-1 text-xs text-muted-foreground">{projectRoot}</code>
        )}
        <div className="max-w-lg text-xs leading-5 text-muted-foreground">{t(hintKey)}</div>
        <Badge variant="secondary">{t('skills.empty.tag')}</Badge>
      </PanelCard>
    </div>
  )
}
