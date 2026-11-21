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
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type GalleryTab = 'skill' | 'style' | 'compare'

export interface TopBarProps {
  tab: GalleryTab
  onTab: (tab: GalleryTab) => void
  skillCount: number
  styleCount: number
  search: string
  onSearch: (value: string) => void
  searchRef: Ref<HTMLInputElement>
  stat: string
  immersive: boolean
  onToggleImmersive: () => void
  onReset: () => void
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
  tab, onTab, skillCount, styleCount, search, onSearch, searchRef, stat,
  onToggleImmersive, onReset,
}: TopBarProps): JSX.Element {
  const { t } = useI18n()
  return (
    <header className="flex flex-none items-center gap-3 border-b bg-background px-5 py-2.5">
      <span className="flex-none text-aek-13 font-bold tracking-wide">{t('art.title')}</span>
      <div className="flex items-center gap-1.5">
        <TabPill active={tab === 'skill'} label={t('art.tab.skill')} count={skillCount} onClick={() => { onTab('skill') }} />
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
      <span className="flex-1" />
      <TooltipProvider delayDuration={250}>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <div className="ml-1.5 flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" onClick={onToggleImmersive} aria-label={t('art.immersive')}>
                <Icon name="maximize" size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('art.immersive')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" onClick={onReset} aria-label={t('art.reset')}>
                <Icon name="refresh" size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('art.reset')}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </header>
  )
}
