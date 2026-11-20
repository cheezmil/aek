/**
 * The three "not enabled yet" faces (presets / project workspaces / git
 * backup). The engine already ships them — ADR-0019 presets, project
 * workspaces, ADR-0020 git-based multi-machine sync — but the panel face
 * lands in a later round, so the tab shows an honest empty state: what
 * exists, what is pending, and where the operator can go today (the CLI).
 */
import { useI18n } from '../../i18n.tsx'
import { Icon } from '../../Icons.tsx'
import { PanelCard } from '../../ui-kit.tsx'
import { Badge } from '@/components/ui/badge'
import { SKILL_VIEW_ICONS, type SkillViewId } from './shared.tsx'

/** The three deferred views (everything except library + add). */
export type EmptyViewId = Exclude<SkillViewId, 'library' | 'add'>

export function EmptyStateView({ view }: { view: EmptyViewId }) {
  const { t } = useI18n()
  const titleKey = view === 'preset' ? 'skills.preset.title' : view === 'project' ? 'skills.project.title' : 'skills.backup.title'
  const hintKey = view === 'preset' ? 'skills.preset.hint' : view === 'project' ? 'skills.project.hint' : 'skills.backup.hint'
  return (
    <PanelCard>
      <div className="flex flex-col items-center gap-3 py-14 text-center">
        <Icon name={SKILL_VIEW_ICONS[view]} size={24} />
        <div className="flex items-center gap-2">
          <div className="text-sm font-bold text-text">{t(titleKey)}</div>
          <Badge variant="secondary">{t('skills.empty.tag')}</Badge>
        </div>
        <div className="max-w-lg text-xs leading-5 text-muted-foreground">{t(hintKey)}</div>
      </div>
    </PanelCard>
  )
}
