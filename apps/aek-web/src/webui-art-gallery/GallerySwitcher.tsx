/**
 * The bottom-right quick switcher — aek-web's own port of the
 * style-gallery reference's Switcher IA: a pill with prev / 浅色 / 深色 /
 * next + the current item's name and position, an expandable searchable
 * item list, and the immersive-mode exit button. BP round ⑦ (m02138):
 * the random button is retired — the two tone buttons pick the active
 * pool (prev/next/list move only inside it), and each list row carries
 * a click-mark that overrides the automatic light/dark classification.
 * P16: aek's own widgets only — the reference's ScrollArea becomes a
 * native overflow scroll, its lucide glyphs become aek Icons, and it
 * sits absolutely inside the panel (after the BP round the panel owns
 * the whole window, so it reads the same as the reference's fixed
 * corner widget).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/GallerySwitcher
 */
import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Icon } from '../Icons.tsx'
import { useI18n } from '../i18n.tsx'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { GalleryItem, FavGroup, Tone, ViewSel } from './spec.ts'

export interface GallerySwitcherProps {
  items: GalleryItem[]
  /** Every item in BOTH families — group rows resolve item names cross-family. */
  allItems: GalleryItem[]
  curId: string
  curIdx: number
  immersive: boolean
  onPrev: () => void
  onNext: () => void
  onSelect: (id: string) => void
  onExitImmersive: () => void
  onToggleImmersive: () => void
  onReset: () => void
  /** BQ4 round (m00001): the active chip pool + its sun/moon switcher. */
  viewSel: ViewSel
  onSelectView: (view: ViewSel) => void
  /** BQ4 round: the explicit 浅/深色 mark from the unclass prompt (persisted). */
  onMarkTone: (id: string, tone: Tone) => void
  /** The effective tone of one item (user mark beats auto-classification). */
  toneOf: (id: string) => Tone
  onToggleToneMark: (id: string) => void
  /** BQ7 round: the top bar's shadcn pill is hidden in immersive mode —
   * this button is the always-reachable entry into the component gallery. */
  onOpenShadcn: () => void
  /** BO round ⑦: apply the current spec to the whole webui, or reset. */
  onGlobal: () => void
  globalActive: boolean
  /** BO round ⑪: the groupable-favorites CRUD surface. */
  groups: FavGroup[]
  onAddGroup: (name: string) => void
  onRenameGroup: (id: string, name: string) => void
  onRemoveGroup: (id: string) => void
  onAssignGroup: (groupId: string, itemId: string) => void
  onUnassignGroup: (groupId: string, itemId: string) => void
}

export function GallerySwitcher(p: GallerySwitcherProps): JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState<'list' | 'groups' | false>(false)
  const [q, setQ] = useState('')
  // ⑪ local UI state: new-group input + which group is being renamed /
  // expanded. All persistence goes through the panel's group handlers.
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set())

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return p.items
    return p.items.filter(x => `${x.spec.name} ${x.desc} ${x.spec.mode}`.toLowerCase().includes(s))
  }, [p.items, q])

  const cur = p.items.find(x => x.id === p.curId) ?? null
  const nameOf = (id: string): string => p.allItems.find(x => x.id === id)?.spec.name ?? id

  const toggleOpenGroup = (id: string): void => {
    setOpenGroups((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="absolute right-4 bottom-4 z-40 flex flex-col items-end gap-2">
      {open === 'list' ? (
        <div className="border-border bg-popover text-foreground flex w-78 max-h-95 flex-col overflow-hidden rounded-lg border shadow-xl">
          <div className="border-b p-2">
            <Input autoFocus type="text" value={q} onChange={(e) => { setQ(e.target.value) }} placeholder={t('art.switcherSearch')} />
          </div>
          <div className="max-h-75 overflow-auto p-1.5">
            {list.map((x) => {
              const on = x.id === p.curId
              const mark = p.toneOf(x.id)
              return (
                <div
                  key={x.id}
                  className={cn(
                    'flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs transition-colors',
                    on ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => { p.onSelect(x.id); setOpen(false) }}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 bg-transparent"
                  >
                    <span className="flex shrink-0 gap-0.5">
                      {[x.spec.p[0], x.spec.p[4], x.spec.p[5]].map((c, i) => (
                        <span key={i} className="size-2 rounded-xs" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{x.spec.name}</span>
                    <span className={cn('shrink-0 text-2xxs', on ? 'opacity-85' : 'text-muted-foreground')}>
                      {x.desc || x.spec.mode || ''}
                    </span>
                  </button>
                  {/* BP round ⑦: the click-mark — flip this item's light/dark
                      tone when the automatic classification is wrong. */}
                  <button
                    type="button"
                    onClick={() => { p.onToggleToneMark(x.id) }}
                    title={t('art.toneMark')}
                    aria-label={t('art.toneMark')}
                    className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-xs text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  >
                    <Icon name={mark === 'light' ? 'sun' : 'moon'} size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
      {/* BO round ⑪: the favorites-group CRUD panel — reachable in BOTH
          normal and immersive mode, so grouping never depends on the
          sidebar chrome being visible. */}
      {open === 'groups' ? (
        <div className="border-border bg-popover text-foreground flex w-78 max-h-95 flex-col overflow-hidden rounded-lg border shadow-xl">
          <div className="border-b flex items-center gap-2 p-2">
            <span className="text-xs font-bold">{t('art.favGroups')}</span>
            <span className="text-muted-foreground ml-auto text-2xxs tabular-nums">{p.groups.length}</span>
          </div>
          <div className="flex max-h-75 flex-col gap-1.5 overflow-auto p-2">
            <div className="flex items-center gap-1.5">
              <Input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { p.onAddGroup(newName); setNewName('') }
                }}
                placeholder={t('art.favGroupPlaceholder')}
                className="h-7 min-w-0 flex-1 text-xs"
              />
              <Button variant="outline" size="sm" className="gap-1" onClick={() => { p.onAddGroup(newName); setNewName('') }}>
                <Icon name="plus" size={13} />{t('art.favGroupNew')}
              </Button>
            </div>
            {p.groups.map((g) => {
              const label = g.name || t('art.favGroupDefault')
              const editing = editingId === g.id
              const expanded = openGroups.has(g.id)
              return (
                <div key={g.id} className="border-border rounded-lg border">
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    {editing ? (
                      <Input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => { setEditName(e.target.value) }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { p.onRenameGroup(g.id, editName); setEditingId(null) }
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        onBlur={() => { p.onRenameGroup(g.id, editName); setEditingId(null) }}
                        className="h-6 min-w-0 flex-1 text-xs"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => { toggleOpenGroup(g.id) }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-xs font-semibold"
                      >
                        <Icon
                          name="chevronDown"
                          size={13}
                          className={cn('text-muted-foreground flex-none transition-transform', expanded && 'rotate-180')}
                        />
                        <span className="truncate">{label}</span>
                        <span className="text-muted-foreground text-2xxs tabular-nums">{g.items.length}</span>
                      </button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-6"
                          onClick={() => { p.onAssignGroup(g.id, p.curId) }}
                          aria-label={t('art.favGroupAssign')}
                          disabled={g.items.includes(p.curId)}
                        >
                          <Icon name="plus" size={12} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('art.favGroupAssign')}</TooltipContent>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-6"
                      onClick={() => { setEditingId(g.id); setEditName(g.name) }}
                      aria-label={t('art.favGroupRename')}
                    >
                      <Icon name="edit" size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-danger size-6 hover:text-danger"
                      onClick={() => {
                        p.onRemoveGroup(g.id)
                        setOpenGroups((cur) => { const n = new Set(cur); n.delete(g.id); return n })
                      }}
                      aria-label={t('art.favGroupDelete')}
                    >
                      <Icon name="trash" size={12} />
                    </Button>
                  </div>
                  {expanded ? (
                    <div className="border-border border-t px-2 py-1.5">
                      {g.items.length ? (
                        <ul className="flex flex-col gap-1">
                          {g.items.map(id => (
                            <li key={id} className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => { p.onSelect(id); setOpen(false) }}
                                className="min-w-0 flex-1 cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-xs hover:bg-muted"
                              >
                                {nameOf(id)}
                              </button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-5"
                                onClick={() => { p.onUnassignGroup(g.id, id) }}
                                aria-label={t('art.favGroupUnassign')}
                              >
                                <Icon name="close" size={11} />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-muted-foreground px-1.5 py-1 text-2xxs">{t('art.favGroupEmpty')}</div>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
      {/* BU round (m12968 ⑤): the bare icon buttons read as "dead
          elements" — every one now carries a hover tooltip naming its
          action. */}
      {/* BQ4 round (m00001): the 程序无法分类 view prompts the user to mark
      {/* the current item's style as 浅色 or 深色; the mark is persisted via
      {/* the panel's onMarkTone (writeToneOverride), so it is remembered. */}
      {p.viewSel === 'unclass' && p.items.length ? (
        <div className="border-border bg-background text-foreground flex w-78 flex-col gap-1.5 rounded-lg border p-2.5 shadow-xl">
          <div className="text-xs leading-snug">
            <b>{cur ? cur.spec.name : ''}</b>
            <div className="text-muted-foreground text-2xxs">{t('art.tonePrompt')}</div>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="h-6 flex-1 gap-1 text-2xxs" onClick={() => { p.onMarkTone(p.curId, 'light') }}>
              <Icon name="sun" size={12} />{t('art.toneLight')}
            </Button>
            <Button size="sm" variant="outline" className="h-6 flex-1 gap-1 text-2xxs" onClick={() => { p.onMarkTone(p.curId, 'dark') }}>
              <Icon name="moon" size={12} />{t('art.toneDark')}
            </Button>
          </div>
        </div>
      ) : null}
      <TooltipProvider delayDuration={250}>
        <div className="border-border bg-background flex items-center gap-1 rounded-full border px-2 py-1.5 shadow-xl">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={p.onPrev} aria-label={t('art.switcherPrev')}>
                <Icon name="chevronLeft" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('art.switcherPrev')}</TooltipContent>
          </Tooltip>
          {/* BP round ⑦: the random button is retired — the pill now holds
              the two tone-pool switches (prev/next/list stay inside the
              active pool). The active pool's button reads as filled. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => { p.onSelectView('light') }}
                aria-label={t('art.toneLight')}
                className={cn(p.viewSel === 'light' && 'bg-muted text-foreground')}
              >
                <Icon name="sun" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('art.toneLight')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => { p.onSelectView('dark') }}
                aria-label={t('art.toneDark')}
                className={cn(p.viewSel === 'dark' && 'bg-muted text-foreground')}
              >
                <Icon name="moon" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('art.toneDark')}</TooltipContent>
          </Tooltip>
          {/* BQ7 round: the top bar's shadcn pill is hidden in immersive mode —
              this button is the always-reachable entry into the component gallery. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={p.onOpenShadcn} aria-label={t('art.shadcnEntry')}>
                <Icon name="layout" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('art.shadcnEntry')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={p.onNext} aria-label={t('art.switcherNext')}>
                <Icon name="chevronRight" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('art.switcherNext')}</TooltipContent>
          </Tooltip>
          <span className="max-w-48 truncate text-xs font-bold">{cur ? cur.spec.name : '—'}</span>
          <span className="text-muted-foreground text-2xxs tabular-nums">
            {p.curIdx + 1}/{p.items.length}{cur && cur.spec.mode ? ` · ${cur.spec.mode}` : ''}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => { setOpen(v => (v === 'list' ? false : 'list')) }}
                aria-label={t('art.switcherList')}
                className={cn(open === 'list' && 'bg-muted')}
              >
                <Icon name="list" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{open === 'list' ? t('art.switcherListClose') : t('art.switcherList')}</TooltipContent>
          </Tooltip>
          {/* BO round ⑪: favorites-group CRUD (add / rename / delete / read). */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => { setOpen(v => (v === 'groups' ? false : 'groups')) }}
                aria-label={t('art.favGroups')}
                className={cn(open === 'groups' && 'bg-muted')}
              >
                <Icon name="layers" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{open === 'groups' ? t('art.switcherListClose') : t('art.favGroups')}</TooltipContent>
          </Tooltip>
          {/* BO round ⑦: 恢复默认外观 / 应用到整个 WebUI moved from the Stage
              header into this floating container (the user's requested spot). */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={p.onGlobal}
                aria-label={p.globalActive ? t('art.globalReset') : t('art.globalApply')}
                className={cn(p.globalActive && 'bg-muted')}
              >
                <Icon name={p.globalActive ? 'restore' : 'sparkles'} size={13} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{p.globalActive ? t('art.globalReset') : t('art.globalApply')}</TooltipContent>
          </Tooltip>
          {/* BL round (m05632 任务 A): 沉浸模式 + 重置筛选 moved from the TopBar
              into this pill — the pill is the gallery's floating action cluster. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={p.onToggleImmersive}
                aria-label={t('art.immersive')}
                className={cn(p.immersive && 'bg-muted')}
              >
                <Icon name="maximize" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('art.immersive')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={p.onReset} aria-label={t('art.reset')}>
                <Icon name="refresh" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('art.reset')}</TooltipContent>
          </Tooltip>
          {p.immersive ? (
            <Button variant="destructive" size="sm" onClick={p.onExitImmersive}>
              <Icon name="close" />{t('art.switcherExit')}
            </Button>
          ) : null}
        </div>
      </TooltipProvider>
    </div>
  )
}
