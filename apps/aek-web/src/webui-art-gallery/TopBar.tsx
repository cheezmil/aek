/**
 * The gallery's neutral chrome bar — mirrors the style-gallery reference's
 * TopBar IA (title + 3 tab pills + search + visible/total stat + actions).
 * It never re-skins: the skins apply to the stage/compare surfaces below it.
 * P16: aek-web's own widgets (self-drawn pill tabs — the reference's
 * ToggleGroup has no aek counterpart).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/TopBar
 */
import type { JSX, Ref } from 'react'
import { Icon } from '../Icons.tsx'
import { useI18n } from '../i18n.tsx'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type GalleryTab = 'style' | 'compare'

export interface TopBarProps {
  tab: GalleryTab
  onTab: (tab: GalleryTab) => void
  styleCount: number
  search: string
  onSearch: (value: string) => void
  searchRef: Ref<HTMLInputElement>
  stat: string
}

const TabPill = ({
  active, label, count, icon, onClick,
}: { active: boolean; label: string; count?: number; icon?: 'columns'; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
      active
        ? 'border-primary/40 bg-primary/10 text-primary'
        : 'border-border text-muted-foreground hover:bg-muted',
    )}
  >
    {icon && <Icon name={icon} size={14} />}
    {label}
    {typeof count === 'number' && (
      <span className="rounded-md bg-muted px-1.5 text-2xxs font-extrabold tabular-nums">{count}</span>
    )}
  </button>
)

export function TopBar({
  tab, onTab, styleCount, search, onSearch, searchRef, stat,
}: TopBarProps): JSX.Element {
  const { t } = useI18n()
  return (
    <header className="flex flex-none items-center gap-3 border-b bg-background px-5 py-2.5">
      {/* BP round ⑩: the gallery title span is retired — the tab pills lead.
          BQ4 round (m00001): the skill pill is BANNED — the user ruled
          「按 Skill 是错误的，禁止再有这个元素可以选择」, so the top bar is
          now 2 pills (style + compare) only; the skill family stays
          reachable via the sidebar's 收藏 chip and the compare grid. */}
      <div className="flex items-center gap-1.5">
        <TabPill active={tab === 'style'} label={t('art.tab.style')} count={styleCount} onClick={() => { onTab('style') }} />
        <TabPill active={tab === 'compare'} label={t('art.tab.compare')} onClick={() => { onTab('compare') }} />
      </div>
      <div className="relative">
        <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => { onSearch(e.target.value) }}
          placeholder={t('art.search')}
          className="w-60 pl-9"
        />
      </div>
      <span className="flex-none text-xs text-muted-foreground tabular-nums">{stat}</span>
    </header>
  )
}
