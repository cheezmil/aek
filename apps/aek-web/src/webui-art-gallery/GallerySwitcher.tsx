/**
 * The bottom-right quick switcher — aek-web's own port of the
 * style-gallery reference's Switcher IA: a pill with prev / random /
 * next + the current item's name and position, an expandable searchable
 * item list, and the immersive-mode exit button. P16: aek's own widgets
 * only — the reference's ScrollArea becomes a native overflow scroll,
 * its lucide glyphs become aek Icons, and it sits absolutely inside the
 * panel (after the BP round the panel owns the whole window, so it
 * reads the same as the reference's fixed corner widget).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/GallerySwitcher
 */
import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Icon } from '../Icons.tsx'
import { useI18n } from '../i18n.tsx'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GalleryItem } from './spec.ts'

export interface GallerySwitcherProps {
  items: GalleryItem[]
  curId: string
  curIdx: number
  immersive: boolean
  onPrev: () => void
  onNext: () => void
  onRandom: () => void
  onSelect: (id: string) => void
  onExitImmersive: () => void
}

export function GallerySwitcher(p: GallerySwitcherProps): JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return p.items
    return p.items.filter(x => `${x.spec.name} ${x.desc} ${x.spec.mode}`.toLowerCase().includes(s))
  }, [p.items, q])

  const cur = p.items.find(x => x.id === p.curId) ?? null

  return (
    <div className="absolute right-4 bottom-4 z-40 flex flex-col items-end gap-2">
      {open ? (
        <div className="border-border bg-popover text-foreground flex w-78 max-h-95 flex-col overflow-hidden rounded-lg border shadow-xl">
          <div className="border-b p-2">
            <Input autoFocus type="text" value={q} onChange={(e) => { setQ(e.target.value) }} placeholder={t('art.switcherSearch')} />
          </div>
          <div className="max-h-75 overflow-auto p-1.5">
            {list.map((x) => {
              const on = x.id === p.curId
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => { p.onSelect(x.id); setOpen(false) }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors',
                    on ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
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
              )
            })}
          </div>
        </div>
      ) : null}
      <div className="border-border bg-background flex items-center gap-1 rounded-full border px-2 py-1.5 shadow-xl">
        <Button variant="ghost" size="icon-sm" onClick={p.onPrev} aria-label={t('art.switcherPrev')}>
          <Icon name="chevronLeft" />
        </Button>
        <Button variant="ghost" size="sm" onClick={p.onRandom}>
          <Icon name="shuffle" />{t('art.switcherRandom')}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={p.onNext} aria-label={t('art.switcherNext')}>
          <Icon name="chevronRight" />
        </Button>
        <span className="max-w-48 truncate text-xs font-bold">{cur ? cur.spec.name : '—'}</span>
        <span className="text-muted-foreground text-2xxs tabular-nums">
          {p.curIdx + 1}/{p.items.length}{cur && cur.spec.mode ? ` · ${cur.spec.mode}` : ''}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={() => { setOpen(v => !v) }} aria-label={t('art.switcherList')}>
          <Icon name="list" />
        </Button>
        {p.immersive ? (
          <Button variant="destructive" size="sm" onClick={p.onExitImmersive}>
            <Icon name="close" />{t('art.switcherExit')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
