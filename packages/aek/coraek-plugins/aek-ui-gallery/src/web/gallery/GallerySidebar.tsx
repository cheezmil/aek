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
import type { GalleryItem, ViewSel } from './spec.ts'
import { cn } from '@/lib/utils'

export interface RepoGroup {
  id: string
  name: string
  color: string
  count: number
}

export interface GallerySidebarProps {
  /** BQ4 round (m00001): the chip row is the 4-way pool selector. */
  viewSel: ViewSel
  onViewSel: (view: ViewSel) => void
  /** Per-pool counts shown on each chip. */
  counts: { fav: number; light: number; dark: number; unclass: number }
  /** Kind groups still feed the row group-header colors. */
  kindGroups: RepoGroup[]
  favs: ReadonlySet<string>
  visible: GalleryItem[]
  curId: string
  onSelect: (id: string) => void
}

// BP-16 (m03167②): group by the item's OWN family fields — skill items carry
// repoId/repoName, style items carry kindId/kindName — so a cross-family
// favorites list groups cleanly instead of collapsing under one empty group.
const groupOf = (item: GalleryItem): string => item.repoId ?? item.kindId ?? ''

const groupName = (item: GalleryItem): string => item.repoName ?? item.kindName ?? ''

const groupColor = (item: GalleryItem, kindGroups: RepoGroup[]): string =>
  item.repoColor ??
  (kindGroups.find(k => k.id === item.kindId)?.color ?? item.srcColor ?? '#6366F1')

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
  // BQ4 round (m00001): the chip row holds ONLY the 4-way pool selector —
  // 收藏 / 浅色 / 深色 / 程序无法分类. The repo/kind filter chips and the
  // 全部 chip are retired; each pool's count rides on its chip.
  const chips: JSX.Element[] = [
    <FilterChip
      key="fav"
      active={p.viewSel === 'fav'}
      label={t('art.fav')}
      count={p.counts.fav}
      onClick={() => { p.onViewSel('fav') }}
    />,
    <FilterChip
      key="light"
      active={p.viewSel === 'light'}
      label={t('art.chipLight')}
      count={p.counts.light}
      onClick={() => { p.onViewSel('light') }}
    />,
    <FilterChip
      key="dark"
      active={p.viewSel === 'dark'}
      label={t('art.chipDark')}
      count={p.counts.dark}
      onClick={() => { p.onViewSel('dark') }}
    />,
    <FilterChip
      key="unclass"
      active={p.viewSel === 'unclass'}
      label={t('art.chipUnclass')}
      count={p.counts.unclass}
      onClick={() => { p.onViewSel('unclass') }}
    />,
  ]

  // BQ3-1 (m00576): visible follows the catalog's KIND order, so one repo's
  // items can be split across distant sections (anthropics = 10 palette rows
  // up front + 11 iskill rows far later) while each group header still shows
  // the group TOTAL — the first "ANTHROPIC 官方 21" block then lists only 10.
  // Render rows contiguously per group (stable: first-seen group order,
  // original order inside each group); keyboard prev/next still walks `pool`.
  const groupOrder = new Map<string, number>()
  for (let i = 0; i < p.visible.length; i++) {
    const k = groupOf(p.visible[i])
    if (!groupOrder.has(k)) groupOrder.set(k, i)
  }
  const ordered = [...p.visible].sort(
    (a, b) => (groupOrder.get(groupOf(a)) ?? 0) - (groupOrder.get(groupOf(b)) ?? 0),
  )

  const rows: JSX.Element[] = []
  let lastGroup: string | null = null
  for (const x of ordered) {
    const groupKey = groupOf(x)
    if (groupKey !== lastGroup) {
      lastGroup = groupKey
      const n = p.visible.filter(v => groupOf(v) === groupKey).length
      rows.push(
        <div
          key={`g${groupKey}`}
          className="bg-background sticky top-0 z-10 flex items-center gap-1.5 px-2 pt-2.5 pb-1 text-2xxs font-extrabold text-muted-foreground uppercase"
        >
          <span className="size-2 flex-none rounded-full" style={{ background: groupColor(x, p.kindGroups) }} />
          <b className="text-foreground">{groupName(x)}</b>
          <span className="ml-auto tabular-nums">{n}</span>
          {x.src ? (
            <span className="max-w-23 truncate text-2xxs font-semibold tracking-normal normal-case opacity-75">
              {x.src}
            </span>
          ) : null}
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
          'hover:bg-muted/60 flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-1.75 text-left transition-colors',
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
      {/* BQ4 round (m00001): the chip container holds ONLY the 4 pool tabs. */}
      <div className="flex flex-none items-center gap-2 overflow-x-auto border-b px-3 py-2.5">
        {chips}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-2 pt-1.5 pb-6">
          {rows.length ? rows : (
            <div className="text-muted-foreground px-5 py-11 text-center text-xs">
              {p.viewSel === 'fav'
                ? t('art.favHint')
                : p.viewSel === 'unclass'
                  ? t('art.chipUnclassEmpty')
                  : t('art.empty')}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
