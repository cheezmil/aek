/**
 * The compare surface — mirrors the style-gallery reference's CompareGrid IA:
 * one screen, every entry rendered in its own real skin. P16: aek-web's own
 * widgets (self-drawn progress bar; the reference's shadcn Progress has no
 * aek counterpart).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/CompareGrid
 */
import type { JSX } from 'react'
import { Icon } from '../Icons.tsx'
import { useI18n } from '../i18n.tsx'
import { specStyle, type GalleryItem } from './spec.ts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export interface CompareGridProps {
  visible: GalleryItem[]
  curId: string
  counts: { styles: number; skills: number; modes: number }
  favs: ReadonlySet<string>
  onPick: (id: string) => void
  onToggleFav: (id: string) => void
}

export function CompareGrid({
  visible, curId, counts, favs, onPick, onToggleFav,
}: CompareGridProps): JSX.Element {
  const { t } = useI18n()
  if (!visible.length) {
    return (
      <div className="text-muted-foreground px-5 py-11 text-center text-xs">
        {t('art.empty')}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3.5 p-4 pb-10 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {visible.map((x) => {
        const spec = x.spec
        const isSkill = x.kind === 'skill'
        const faved = favs.has(x.id)
        return (
          <div
            key={x.id}
            onClick={() => { onPick(x.id) }}
            className={cn(
              'aek-stage group bg-card relative flex cursor-pointer flex-col gap-2.5 rounded-lg border p-3.5 transition-all',
              'hover:-translate-y-0.5 hover:shadow-lg',
              x.id === curId && 'ring-2 ring-primary/45',
            )}
            style={specStyle(spec)}
            data-mode={spec.mode}
            data-font={spec.font}
          >
            <div className="flex items-center gap-2">
              <span
                className="size-6 flex-none rounded-md"
                style={{ background: `linear-gradient(135deg, ${spec.p[4]}, ${spec.p[5]})` }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold">{x.spec.name}</div>
                <div className="text-muted-foreground truncate text-2xxs">
                  {isSkill ? (x.repoName ?? spec.sub) : `${spec.sub} · ${x.src ?? ''}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                className="flex-none opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFav(x.id)
                }}
                aria-label={faved ? t('art.favRemove') : t('art.favAdd')}
              >
                <Icon name="star" size={14} className={cn(faved && 'fill-current text-primary')} />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/60 flex flex-col gap-1 rounded-md px-2 py-1.5">
                <span className="text-muted-foreground text-2xxs font-bold uppercase">
                  {isSkill ? t('art.card.skills') : t('art.card.styles')}
                </span>
                <span className="text-sm-plus font-extrabold tracking-tight">
                  {isSkill ? counts.skills : counts.styles}
                </span>
              </div>
              <div className="bg-muted/60 flex flex-col gap-1 rounded-md px-2 py-1.5">
                <span className="text-muted-foreground text-2xxs font-bold uppercase">
                  {t('art.card.modes')}
                </span>
                <span className="text-sm-plus font-extrabold tracking-tight">{counts.modes}</span>
              </div>
            </div>

            <div className="bg-muted/60 flex flex-col gap-2 rounded-md p-2.5">
              <div className="text-xs font-bold">{x.spec.name}</div>
              <div className="text-muted-foreground text-2xxs">
                {isSkill ? t('art.card.noteSkill') : spec.mode}
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-5.5 flex-1 px-1 text-2xxs">{t('art.start')}</Button>
                <Button variant="outline" size="sm" className="h-5.5 flex-1 px-1 text-2xxs">
                  {t('art.stop')}
                </Button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${35 + ((x.spec.name.length * 7) % 55)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Badge variant="outline" className="font-mono text-2xxs">{spec.mode}</Badge>
              <span className="text-muted-foreground font-mono text-2xxs">{spec.radius}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
