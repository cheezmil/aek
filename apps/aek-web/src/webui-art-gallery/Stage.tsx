/**
 * The live re-skin stage — mirrors the style-gallery reference's Stage IA:
 * name header + spec strip + 4 real-content tabs (overview / components /
 * motion / logs). Everything inside .aek-stage re-skins with the selected
 * spec; the neutral chrome above never does. P16: aek-web's own widgets
 * (self-drawn pills, progress bars, accordion — the reference's ToggleGroup
 * / Progress / Accordion have no aek counterparts).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/Stage
 */
import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { Icon } from '../Icons.tsx'
import { useI18n } from '../i18n.tsx'
import { cssSnippet, normRadius, type GalleryItem, type StageSpec, galleryItems, ALL_STYLE_KINDS } from './spec.ts'
import { copyToClipboard } from '../clipboard.ts'
import { ComponentsPanel, MotionPanel } from './StagePanels.tsx'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface StageCounts {
  styles: number
  skills: number
  repos: number
  kinds: number
  modes: number
}

export interface StageProps {
  item: GalleryItem
  counts: StageCounts
  faved: boolean
  onToggleFav: () => void
  onNotify: (msg: string) => void
  /** BP round: is this spec the one currently applied to the whole webui. */
  globalActive: boolean
  /** Apply this spec to the whole webui, or reset when already active. */
  onGlobal: () => void
}

const NAVS: { key: string; icon: 'layout' | 'plugins' | 'zap' | 'terminal' }[] = [
  { key: 'overview', icon: 'layout' },
  { key: 'components', icon: 'plugins' },
  { key: 'motion', icon: 'zap' },
  { key: 'logs', icon: 'terminal' },
]

const CHART = [38, 62, 47, 88, 56, 73, 34, 91]

/** Composition-table rows: one per style kind (incl. AEK base) + the colored-entry count. */
const KIND_STYLE_ITEMS = galleryItems().styles
const KIND_ROWS = ALL_STYLE_KINDS.map(({ id, name, src, color, count }) => ({
  id, name, src, color, count,
  colored: KIND_STYLE_ITEMS.filter(s => s.kindId === id && (s.colors?.length ?? 0) > 0).length,
}))

const Bar = ({ value, tone = 'default' }: { value: number; tone?: 'default' | 'ok' | 'bad' }): JSX.Element => (
  <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
    <div
      className={cn(
        'h-full rounded-full',
        tone === 'ok' ? 'bg-success' : tone === 'bad' ? 'bg-destructive' : 'bg-primary',
      )}
      style={{ width: `${value}%` }}
    />
  </div>
)

const SpecItem = ({ k, children }: { k: string; children: ReactNode }): JSX.Element => (
  <div className="flex min-w-0 flex-col gap-1">
    <span className="text-muted-foreground text-2xxs leading-none font-bold uppercase">{k}</span>
    <span className="truncate font-mono text-xs leading-none font-bold">{children}</span>
  </div>
)

export function Stage({ item, counts, faved, onToggleFav, onNotify, globalActive, onGlobal }: StageProps): JSX.Element {
  const { t, tf } = useI18n()
  const spec = item.spec
  const [nav, setNav] = useState('overview')
  const [tg1, setTg1] = useState(true)
  const [tg2, setTg2] = useState(false)
  const [copied, setCopied] = useState(false)

  const isSkill = item.kind === 'skill'
  const swatches = [spec.p[0], spec.p[1], spec.p[3], spec.p[4]]

  const doCopy = async (): Promise<void> => {
    const ok = await copyToClipboard(cssSnippet(spec))
    if (ok) {
      onNotify(t('art.copied'))
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 1400)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      {/* ---- header: name + copy + favorite + status badges ---- */}
      <header className="flex items-start gap-4">
        <div
          className="size-11 flex-none rounded-xl"
          style={{ background: `linear-gradient(135deg, ${spec.p[4]}, ${spec.p[5]})` }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1 className="truncate text-xl leading-tight font-bold tracking-tight">{spec.name}</h1>
            <div className="flex flex-none items-center gap-0.5">
              <TooltipProvider delayDuration={250}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => { void doCopy() }}
                      aria-label={t('art.copyName')}
                      className="size-7"
                    >
                      {copied ? <Icon name="check" size={14} className="text-success" /> : <Icon name="copy" size={14} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{copied ? t('art.copied') : t('art.copyName')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onToggleFav}
                      aria-label={faved ? t('art.favRemove') : t('art.favAdd')}
                      className={cn('size-7', faved && 'text-primary hover:text-primary')}
                    >
                      <Icon name="star" size={14} className={cn(faved && 'fill-current')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{faved ? t('art.favRemove') : t('art.favAdd')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {isSkill && item.repoName && (
              <span className="bg-secondary text-secondary-foreground rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                {item.repoName}
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1.5 line-clamp-1 text-xs leading-relaxed">{item.desc}</p>
        </div>
        <div className="flex flex-none flex-wrap justify-end gap-1.5">
          <span className="border-success/30 bg-success/10 text-success rounded-full border px-2.5 py-0.5 text-xs font-semibold">
            {t('art.ready')}
          </span>
          <span className="border-destructive/30 bg-destructive/10 text-destructive rounded-full border px-2.5 py-0.5 text-xs font-semibold">
            {t('art.missing')}
          </span>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold">{spec.sub}</span>
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={globalActive ? 'outline' : 'secondary'}
                  size="sm"
                  onClick={onGlobal}
                  aria-label={globalActive ? t('art.globalReset') : t('art.globalApply')}
                  className="h-6 gap-1.5 px-2.5 text-xs"
                >
                  <Icon name={globalActive ? 'restore' : 'maximize'} size={13} />
                  {globalActive ? t('art.globalReset') : t('art.globalApply')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{globalActive ? t('art.globalReset') : t('art.globalApply')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {/* ---- spec strip: texture / radius / font / palette ---- */}
      <div className="bg-card grid grid-cols-2 items-center gap-x-6 gap-y-4 rounded-lg border px-5 py-4 sm:grid-cols-4">
        <SpecItem k={t('art.texture')}>{spec.mode}</SpecItem>
        <SpecItem k={t('art.radius')}>{normRadius(spec.radius)}</SpecItem>
        <SpecItem k={t('art.font')}>{spec.font}</SpecItem>
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-2xxs leading-none font-bold uppercase">
            {t('art.palette')}
          </span>
          <div className="flex gap-1.5">
            {swatches.map((c, i) => (
              <span key={i} className="size-5 rounded-md border border-border" style={{ background: c }} title={c} />
            ))}
          </div>
        </div>
        <span className="text-muted-foreground col-span-2 font-mono text-xs leading-relaxed break-all sm:col-span-4">
          {spec.p.join('  ')}
        </span>
      </div>

      {/* ---- demo tabs: real content switches, not just the highlight ---- */}
      <div className="inline-flex items-center gap-1 rounded-lg bg-secondary p-1">
        {NAVS.map(n => (
          <button
            key={n.key}
            type="button"
            onClick={() => { setNav(n.key) }}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              nav === n.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon name={n.icon} size={13} />
            {t(`art.stage.${n.key}`)}
          </button>
        ))}
      </div>

      {nav === 'components' ? (
        <div data-panel="components"><ComponentsPanel /></div>
      ) : nav === 'motion' ? (
        <div data-panel="motion"><MotionPanel /></div>
      ) : nav === 'logs' ? (
        <div data-panel="logs" className="flex flex-col gap-4"><LogPanel item={item} spec={spec} counts={counts} /></div>
      ) : (
        <div data-panel="overview" className="flex flex-col gap-6">
          {/* ---- stats ---- */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { lb: t('art.stat.uiStyles'), vl: counts.styles, dl: tf('art.stat.uiStylesSub', { n: counts.kinds }) },
              { lb: t('art.stat.skill'), vl: counts.skills, dl: tf('art.stat.skillSub', { n: counts.repos }) },
              { lb: t('art.stat.mode'), vl: counts.modes, dl: spec.mode },
            ].map(({ lb, vl, dl }) => (
              <div key={lb} className="bg-card flex flex-col gap-1.5 rounded-lg border px-4 py-3.5">
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
                  <Icon name="layers" size={14} />{lb}
                </span>
                <span className="text-2xl leading-none font-extrabold tracking-tight">{vl}</span>
                <span className="text-primary text-xs font-bold">{dl}</span>
              </div>
            ))}
          </div>

          {/* ---- two columns: demo card + diagnostics ---- */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="size-2 flex-none animate-pulse rounded-full bg-success" />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-aek-135">{spec.name}</CardTitle>
                    <CardDescription className="truncate">{isSkill ? item.repoName : item.kindName}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardDescription className="leading-relaxed px-(--card-spacing)">{t('art.demoCardDesc')}</CardDescription>
              {/* BV round (m13340, 3rd reject of the demo card layout): kill the
                  dead elements — 更新 buttons (no onClick), version chips, the
                  "状态：关" state-echo line and the nested bordered row boxes.
                  Standard settings rows: title + natural-wrap description left,
                  switch right, hairline dividers. */}
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="destructive" size="sm">{t('art.stop')}</Button>
                  <Button size="sm">{t('art.start')}</Button>
                  <Button variant="outline" size="sm" className="gap-1">
                    {t('art.open')} <Icon name="externalLink" size={12} />
                  </Button>
                </div>
                <Separator />
                <div className="bg-background flex items-center gap-3 rounded-lg border border-border px-3.5 py-2.5">
                  <Switch checked={tg1} onCheckedChange={setTg1} className="flex-none" />
                  <div className="min-w-0 flex-1">
                    <div className="text-aek-13 font-medium">{t('art.injectOn')}</div>
                    <div className="mt-0.5 text-aek-12 leading-snug text-muted-foreground">
                      {t('art.injectDesc')}
                    </div>
                  </div>
                </div>
                <div className="bg-background flex items-center gap-3 rounded-lg border border-border px-3.5 py-2.5">
                  <Switch checked={tg2} onCheckedChange={setTg2} className="flex-none" />
                  <div className="min-w-0 flex-1">
                    <div className="text-aek-13 font-medium">{t('art.disabledEx')}</div>
                    <div className="mt-0.5 text-aek-12 leading-snug text-muted-foreground">
                      {t('art.disabledExDesc')}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-aek-135">{t('art.diag')}</CardTitle>
                <CardDescription>{t('art.diagDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Input type="text" placeholder={t('art.installPh')} />
                  <Button className="flex-none">{t('art.install')}</Button>
                </div>
                {[
                  { ok: true, name: 'Node.js', meta: t('art.nodeMeta') },
                  { ok: false, name: 'dsh CLI', meta: t('art.notInstalled') },
                ].map(c => (
                  <div
                    key={c.name}
                    className="bg-background flex items-center gap-3 rounded-lg border px-3.5 py-2.5"
                  >
                    <span
                      className={cn(
                        'flex size-5 flex-none items-center justify-center rounded-full text-xs font-extrabold text-primary-foreground',
                        c.ok ? 'bg-success' : 'bg-destructive',
                      )}
                    >
                      {c.ok ? '✓' : '✗'}
                    </span>
                    <span className="flex-1 text-xs font-semibold">{c.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">{c.meta}</span>
                  </div>
                ))}
                <div className="flex flex-col gap-2.5">
                  <Bar value={72} />
                  <Bar value={44} tone="ok" />
                </div>
                <div className="flex h-21 items-end gap-2">
                  {CHART.map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-t-md"
                      style={{
                        height: `${h}%`,
                        background: 'linear-gradient(to top, var(--color-primary), var(--color-accent))',
                      }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ---- style library composition ---- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-aek-135">{t('art.tableTitle')}</CardTitle>
                <CardDescription>{tf('art.tableDesc', { n: counts.styles, k: counts.kinds })}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('art.colCategory')}</TableHead>
                    <TableHead className="pr-6 text-right">{t('art.colCount')}</TableHead>
                    <TableHead>{t('art.colSource')}</TableHead>
                    <TableHead className="text-right">{t('art.colSwatch')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {KIND_ROWS.map(row => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <span className="size-2.5 flex-none rounded-full" style={{ background: row.color }} />
                          {row.name}
                        </span>
                      </TableCell>
                      <TableCell className="pr-6 text-right font-mono tabular-nums">{row.count}</TableCell>
                      <TableCell className="text-muted-foreground truncate">{row.src}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{row.colored}/{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

/** The "logs" panel: diagnostic stream + re-skin variable snapshot + artifact self-check. */
function LogPanel({ item, spec, counts }: { item: GalleryItem; spec: StageSpec; counts: StageCounts }): JSX.Element {
  const { t, tf } = useI18n()
  const now = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const isSkill = item.kind === 'skill'
  const logSrc = isSkill ? (item.repoName ?? spec.name) : (item.src ?? item.kindName ?? '')
  const lines: { tag: string; txt: string; tone: 'ok' | 'warn' | 'plain' }[] = [
    { tag: 'boot', txt: t('art.log.boot'), tone: 'ok' },
    { tag: 'data', txt: t('art.log.builtin'), tone: 'warn' },
    {
      tag: 'scan',
      txt: tf('art.log.scan', { src: logSrc, skills: counts.skills, repos: counts.repos, styles: counts.styles }),
      tone: 'ok',
    },
    { tag: 'style', txt: tf('art.log.style', { mode: spec.mode, radius: spec.radius, font: spec.font }), tone: 'ok' },
    {
      tag: 'skin',
      txt: tf('art.log.skin', { n: spec.p.length }),
      tone: 'ok',
    },
    { tag: 'select', txt: tf('art.log.select', { name: spec.name }), tone: 'ok' },
    { tag: 'hint', txt: t('art.log.hint'), tone: 'plain' },
  ]
  return (
    <>
      <Card>
        <CardHeader>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-aek-135">{t('art.logTitle')}</CardTitle>
            <CardDescription>{t('art.logDesc')}</CardDescription>
          </div>
          <CardAction>
            <span className="border-success/30 bg-success/10 text-success rounded-full border px-2.5 py-0.5 text-xs font-semibold">
              {t('art.logOkBadge')}
            </span>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-1.5">
            {lines.map((l, i) => (
              <li key={i} className="bg-background flex items-start gap-3 rounded-lg border px-3.5 py-2.5">
                <span className="text-muted-foreground flex-none font-mono text-aek-11 tabular-nums">{now}</span>
                <span
                  className={cn(
                    'flex-none rounded-md px-1.5 py-px font-mono text-2xxs font-bold',
                    l.tone === 'warn'
                      ? 'bg-destructive/15 text-destructive'
                      : l.tone === 'ok'
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {l.tag}
                </span>
                <span className="min-w-0 flex-1 text-xs leading-relaxed">{l.txt}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-aek-135">{t('art.varsTitle')}</CardTitle>
              <CardDescription>{t('art.varsDesc')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-background max-h-60 overflow-auto rounded-lg border p-3.5 font-mono text-xs leading-loose">
              {cssSnippet(spec)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-aek-135">{t('art.checkTitle')}</CardTitle>
              <CardDescription>{t('art.checkDesc')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-background max-h-60 overflow-auto rounded-lg border p-3.5 font-mono text-xs leading-loose">
              {[
                t('art.chk1'),
                t('art.chk2'),
                t('art.chk3'),
                tf('art.chk4', { styles: counts.styles, kinds: counts.kinds }),
                t('art.chk5'),
              ].map(line => `[ok] ${line}`).join('\n')}
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
