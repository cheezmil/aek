/**
 * The gallery's grouped filter sidebar — mirrors the style-gallery reference's
 * Sidebar IA (fav/all chips row + repo-colored chips + grouped list with
 * sticky group headers and 3-swatch preview rows). P16: aek-web's own
 * widgets; native overflow instead of the reference's ScrollArea.
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/GallerySidebar
 */
import type { JSX } from 'react'
import { Icon } from '../Icons.tsx'
import { useI18n } from '../i18n.tsx'
import type { GalleryItem } from './spec.ts'
import { cn } from '@/lib/utils'

export interface RepoGroup {
  id: string
  name: string
  color: string
  count: number
}

export interface GallerySidebarProps {
  tab: 'skill' | 'style'
  repos: RepoGroup[]
  repoFilter: string | null
  onRepoFilter: (id: string | null) => void
  kindFilter: string | null
  onKindFilter: (id: string | null) => void
  kindGroups: RepoGroup[]
  favOnly: boolean
  favCount: number
  onFavOnly: (value: boolean) => void
  favs: ReadonlySet<string>
  visible: GalleryItem[]
  curId: string
  onSelect: (id: string) => void
}

const groupOf = (item: GalleryItem, tab: 'skill' | 'style'): string =>
  tab === 'skill' ? item.repoId ?? '' : item.kindId ?? ''

const groupName = (item: GalleryItem, tab: 'skill' | 'style'): string =>
  tab === 'skill' ? item.repoName ?? item.repoId ?? '' : item.kindName ?? ''

const groupColor = (
  item: GalleryItem,
  tab: 'skill' | 'style',
  kindGroups: RepoGroup[],
): string =>
  tab === 'skill'
    ? item.repoColor ?? '#6366F1'
    : (kindGroups.find(k => k.id === item.kindId)?.color ?? item.srcColor ?? '#6366F1')

function FilterChip({
  active, color, label, count, onClick,
}: { active: boolean; color?: string; label: string; count?: number; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-none cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
        active ? 'border-transparent text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted',
      )}
      style={active ? { background: color ?? 'var(--primary)' } : color ? { color } : undefined}
    >
      {color && <span className="size-2 flex-none rounded-full bg-current" />}
      {label}
      {typeof count === 'number' && <span className="tabular-nums opacity-70">{count}</span>}
    </button>
  )
}

export function GallerySidebar(p: GallerySidebarProps): JSX.Element {
  const { t } = useI18n()
  const chips: JSX.Element[] = []
  chips.push(
    <FilterChip
      key="all"
      active={p.tab === 'skill' ? p.repoFilter === null : p.kindFilter === null}
      label={t('art.all')}
      onClick={() => {
        p.onRepoFilter(null)
        p.onKindFilter(null)
      }}
    />,
  )
  if (p.tab === 'skill') {
    for (const r of p.repos) {
      const on = p.repoFilter === r.id
      chips.push(
        <FilterChip
          key={r.id}
          active={on}
          color={r.color}
          label={r.name}
          count={r.count}
          onClick={() => { p.onRepoFilter(on ? null : r.id) }}
        />,
      )
    }
  } else {
    for (const k of p.kindGroups) {
      const on = p.kindFilter === k.id
      chips.push(
        <FilterChip
          key={k.id}
          active={on}
          color={k.color}
          label={k.name}
          count={k.count}
          onClick={() => { p.onKindFilter(on ? null : k.id) }}
        />,
      )
    }
  }

  const rows: JSX.Element[] = []
  let lastGroup: string | null = null
  for (const x of p.visible) {
    const groupKey = groupOf(x, p.tab)
    if (groupKey !== lastGroup) {
      lastGroup = groupKey
      const n = p.visible.filter(v => groupOf(v, p.tab) === groupKey).length
      rows.push(
        <div
          key={`g${groupKey}`}
          className="bg-background sticky top-0 z-10 flex items-center gap-1.5 px-2 pt-2.5 pb-1 text-2xxs font-extrabold tracking-wider text-muted-foreground uppercase"
        >
          <span className="size-2 flex-none rounded-full" style={{ background: groupColor(x, p.tab, p.kindGroups) }} />
          <b className="text-foreground">{groupName(x, p.tab)}</b>
          <span className="ml-auto tabular-nums">{n}</span>
          {p.tab === 'style' && (
            <span className="max-w-23 truncate text-2xxs font-semibold tracking-normal normal-case opacity-75">
              {x.src}
            </span>
          )}
        </div>,
      )
    }
    const on = x.id === p.curId
    const faved = p.favs.has(x.id)
    rows.push(
      <button
        key={x.id}
        type="button"
        data-state={on ? 'on' : 'off'}
        onClick={() => { p.onSelect(x.id) }}
        className={cn(
          'hover:bg-muted/60 flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors',
          on && 'border-primary/35 bg-primary/10',
        )}
      >
        <span className="flex w-8.5 flex-none gap-1">
          {[x.spec.p[0], x.spec.p[4], x.spec.p[5]].map((c, i) => (
            <span
              key={i}
              className="h-6 w-2.5 rounded-xs border border-border"
              style={{ background: c }}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs leading-snug font-semibold">{x.spec.name}</span>
          <span className="text-muted-foreground mt-0.5 block truncate text-xs leading-snug">{x.desc}</span>
        </span>
        {faved && <Icon name="star" size={14} className="flex-none text-primary fill-current" />}
        <span className="text-muted-foreground flex-none font-mono text-2xxs">{x.spec.mode}</span>
      </button>,
    )
  }

  return (
    <aside className="bg-background flex w-75 flex-none flex-col border-r">
      <div className="flex flex-none items-center gap-2 overflow-x-auto border-b px-3 py-2.5">
        <button
          type="button"
          onClick={() => { p.onFavOnly(!p.favOnly) }}
          className={cn(
            'flex h-7 flex-none items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors',
            p.favOnly
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          <Icon name="star" size={14} className={cn(p.favOnly && 'fill-current')} />
          {t('art.fav')} {p.favCount}
        </button>
        <span className="bg-border h-5 w-px flex-none" />
        {chips}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-2 pt-1.5 pb-6">
          {rows.length ? rows : (
            <div className="text-muted-foreground px-5 py-11 text-center text-xs">
              {p.favOnly ? t('art.favHint') : t('art.empty')}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
