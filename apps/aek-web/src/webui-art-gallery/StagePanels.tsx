/**
 * Stage "组件" + "动效" tabs — live widget + motion showcases that re-skin
 * with the selected spec (P16: aek-web's own 9 ui widgets; widgets without
 * an aek counterpart — Avatar/Checkbox/Radio/Slider/Progress/Accordion —
 * are self-drawn with plain theme tokens so the skin table drives them).
 * Mirrors the style-gallery reference StagePanels IA (5 component groups +
 * 3 motion cards + list stagger-in).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/StagePanels
 */
import { useState, useRef } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Icon, type IconName } from '../Icons.tsx'
import { useI18n } from '../i18n.tsx'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-aek-125">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

/** Self-drawn checkbox (no aek counterpart) — driven by theme tokens. */
function FancyCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        'flex size-4.5 items-center justify-center rounded-xs border transition-colors',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
      )}
    >
      {checked ? <Icon name="check" size={11} className="text-primary-foreground" /> : null}
    </button>
  )
}

/** Self-drawn radio group. */
function FancyRadio({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-4">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => { onChange(id) }}
          className="flex items-center gap-1.5 text-aek-125"
        >
          <span
            className={cn(
              'flex size-4 items-center justify-center rounded-full border',
              value === id ? 'border-primary' : 'border-border',
            )}
          >
            {value === id ? <span className="size-2 rounded-full bg-primary" /> : null}
          </span>
          {label}
        </button>
      ))}
    </div>
  )
}

/** Self-drawn progress bar. */
function FancyProgress({ label, value, tone = 'accent' }: { label: string; value: number; tone?: 'accent' | 'success' }) {
  return (
    <div className="py-2">
      <div className="text-muted-foreground mb-1.5 flex items-center justify-between text-aek-125">
        <span>{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn('h-full rounded-full', tone === 'success' ? 'bg-success' : 'bg-accent')}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

/** Self-drawn skeleton block. */
function FancySkeleton() {
  return (
    <div className="w-44">
      <div className="flex items-center gap-3">
        <div className="size-9 animate-pulse rounded-full bg-secondary" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 w-3/4 animate-pulse rounded bg-secondary" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-secondary" />
        </div>
      </div>
    </div>
  )
}

/** BP round ⑪: a keyboard-shortcut chip (no aek counterpart — P16 token). */
function KbdChip({ label }: { label: string }) {
  return (
    <kbd className="border-border/70 bg-secondary text-muted-foreground inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border px-1.5 font-sans text-2xs font-semibold">
      {label}
    </kbd>
  )
}

/** BP round ⑪: a fixed-ratio media placeholder (the shadcn Aspect Ratio
 * family) — the frame itself re-skins with the selected spec. */
function AspectCard({
  label, className, style,
}: { label: string; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn('border-border relative h-28 overflow-hidden rounded-lg border', className)} style={style}>
      <Icon name="externalLink" size={14} className="text-muted-foreground absolute top-2.5 right-2.5" />
      <span className="text-muted-foreground absolute bottom-2.5 left-2.5 text-2xs font-bold tabular-nums">{label}</span>
    </div>
  )
}

/** BP round ⑪: a multi-select toggle group (shadcn ToggleGroup pattern,
 * self-drawn on theme tokens). */
function FancyToggleGroup({
  options, active, onToggle,
}: { options: [string, string][]; active: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="border-border inline-flex rounded-md border p-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={active.has(id)}
          onClick={() => { onToggle(id) }}
          className={cn(
            'rounded-sm px-2.5 py-1 text-aek-125 transition-colors',
            active.has(id) ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function ComponentsPanel() {
  const { t } = useI18n()
  const [check, setCheck] = useState(true)
  const [radio, setRadio] = useState('a')
  const [slider, setSlider] = useState(62)
  const [accOpen, setAccOpen] = useState<string | null>('q1')
  // BP round ⑪: a toggle-group demo (exclusive view mode).
  const [view, setView] = useState<Set<string>>(new Set(['grid']))
  const flipView = (id: string) => { setView(new Set([id])) }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-4">
        <Group title={t('art.btnGroup')}>
          <Row label={t('art.btnVariants')}>
            <Button>{t('art.btnPrimary')}</Button>
            <Button variant="secondary">{t('art.btnSecondary')}</Button>
            <Button variant="outline">{t('art.btnOutline')}</Button>
            <Button variant="ghost">{t('art.btnGhost')}</Button>
            <Button variant="destructive">{t('art.btnDestructive')}</Button>
            <Button variant="link">{t('art.btnLink')}</Button>
          </Row>
          <Separator />
          <Row label={t('art.btnSizes')}>
            <Button size="sm">{t('art.btnSm')}</Button>
            <Button>{t('art.btnMd')}</Button>
            <Button size="lg">{t('art.btnLg')}</Button>
            <Button size="icon" aria-label={t('art.btnIcon')}>
              <Icon name="plus" size={14} />
            </Button>
          </Row>
          <Separator />
          <Row label={t('art.btnStates')}>
            <Button disabled>{t('art.btnDisabled')}</Button>
            <Button variant="outline">
              <Icon name="loader" size={14} className="animate-spin" />
              {t('art.btnLoading')}
            </Button>
            <Button variant="outline">
              <Icon name="check" size={14} />
              {t('art.btnDone')}
            </Button>
          </Row>
        </Group>

        <Group title={t('art.badgeGroup')} note={t('art.badgeNote')}>
          <Row label={t('art.badgeVariants')}>
            <Badge>{t('art.badgeDefault')}</Badge>
            <Badge variant="secondary">{t('art.badgeSecondary')}</Badge>
            <Badge variant="outline">{t('art.badgeOutline')}</Badge>
            <Badge variant="destructive">{t('art.badgeDanger')}</Badge>
            <span className="border-success/30 bg-success/10 text-success rounded-full border px-2 py-0.5 text-xs font-semibold">
              {t('art.badgeSuccess')}
            </span>
            <Badge variant="ghost">{t('art.badgeGhost')}</Badge>
            <Badge variant="link">{t('art.badgeLink')}</Badge>
          </Row>
          <Separator />
          <Row label={t('art.avatar')}>
            <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface-hover text-sm font-bold text-muted-foreground">U</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">A</span>
            <span className="flex size-8 items-center justify-center rounded-full border border-border bg-surface-hover text-sm font-bold text-muted-foreground">S</span>
            <span className="flex size-8 items-center justify-center rounded-full bg-success text-sm font-bold text-primary-foreground">G</span>
          </Row>
        </Group>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Group title={t('art.formGroup')}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="art-form-input">{t('art.formInput')}</Label>
                <Input id="art-form-input" placeholder={t('art.formInputPh')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('art.formSelect')}</Label>
                <select
                  className="border-border bg-background text-aek-125 h-8.5 w-full rounded-md border px-2.5 focus:outline-none"
                  defaultValue="b"
                >
                  <option value="a">{t('art.formOptA')}</option>
                  <option value="b">{t('art.formOptB')}</option>
                  <option value="c">{t('art.formOptC')}</option>
                </select>
              </div>
              <Row label={t('art.formCheckbox')}>
                <FancyCheckbox checked={check} onToggle={() => { setCheck(v => !v) }} />
              </Row>
              <Row label={t('art.formRadio')}>
                <FancyRadio value={radio} options={[['a', t('art.formRadioA')], ['b', t('art.formRadioB')]]} onChange={setRadio} />
              </Row>
              <div className="space-y-1.5">
                <div className="text-aek-125 flex items-center justify-between">
                  <Label>{t('art.formSlider')}</Label>
                  <span className="text-muted-foreground tabular-nums">{slider}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={slider}
                  onChange={(e) => { setSlider(Number(e.target.value)) }}
                  className="w-full accent-accent"
                />
              </div>
              <Row label={t('art.formSwitch')}>
                <Switch defaultChecked />
              </Row>
            </div>
          </Group>

          <div className="flex flex-col gap-4">
            <Group title={t('art.progressGroup')}>
              <FancyProgress label={t('art.progQueued')} value={12} />
              <FancyProgress label={t('art.progUploading')} value={64} />
              <FancyProgress label={t('art.progDone')} value={100} tone="success" />
            </Group>
            <Group title={t('art.accGroup')}>
              {[['q1', t('art.accQ1'), t('art.accA1')], ['q2', t('art.accQ2'), t('art.accA2')]].map(([id, q, a]) => (
                <div key={id} className="border-border rounded-md border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-3 text-left text-aek-13 font-medium"
                    onClick={() => { setAccOpen(accOpen === id ? null : id) }}
                  >
                    <span>{q}</span>
                    <Icon name="chevronDown" size={14} className={cn('text-muted-foreground transition-transform', accOpen === id && 'rotate-180')} />
                  </button>
                  {accOpen === id ? <p className="text-muted-foreground border-t border-border p-3 text-aek-125">{a}</p> : null}
                </div>
              ))}
            </Group>
          </div>
        </div>

        <Group title={t('art.tooltipGroup')} note={t('art.tooltipNote')}>
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger>
                <Button variant="outline" size="sm">{t('art.tooltipA')}</Button>
              </TooltipTrigger>
              <TooltipContent>{t('art.tooltipADesc')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline">{t('art.tooltipB')}</Badge>
              </TooltipTrigger>
              <TooltipContent>{t('art.tooltipBDesc')}</TooltipContent>
            </Tooltip>
          </div>
        </Group>

        <Group title={t('art.kbdGroup')} note={t('art.kbdNote')}>
          <Row label={t('art.kbdRow')}>
            <KbdChip label="⌘ K" />
            <KbdChip label="⌘ B" />
            <KbdChip label="⌘ ." />
            <KbdChip label="Esc" />
          </Row>
          <Separator />
          <Row label={t('art.kbdToggleRow')}>
            <FancyToggleGroup
              options={[[ 'grid', t('art.nvViewGrid')], ['list', t('art.nvViewList')]]}
              active={view}
              onToggle={flipView}
            />
          </Row>
        </Group>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Group title={t('art.skeletonGroup')}>
            <FancySkeleton />
          </Group>
          <Group title={t('art.noticeGroup')}>
            <div className="border-accent/25 bg-accent/10 space-y-3 rounded-lg border p-3">
              <div className="flex gap-3">
                <Icon name="about" size={16} className="mt-0.5 text-accent" />
                <div>
                  <div className="text-aek-13 font-semibold">{t('art.noticeInfo')}</div>
                  <div className="text-muted-foreground text-aek-115">{t('art.noticeInfoBody')}</div>
                </div>
              </div>
              <div className="border-danger/25 bg-danger-soft flex gap-3 rounded-md border p-3">
                <Icon name="alert" size={16} className="mt-0.5 text-danger" />
                <div>
                  <div className="text-aek-13 font-semibold">{t('art.noticeWarn')}</div>
                  <div className="text-muted-foreground text-aek-115">{t('art.noticeWarnBody')}</div>
                </div>
              </div>
            </div>
          </Group>
        </div>
      </div>
    </TooltipProvider>
  )
}

export function MotionPanel() {
  const { t, tf } = useI18n()
  const [interact, setInteract] = useState(true)
  // BU round (m12968 ⑤): start at 1 so the staggered list-entrance demo
  // plays once on first paint — it used to sit inert at 0 and only
  // "reacted" after the user hit 触发 in the card above, which read as
  // a dead element.
  const [count, setCount] = useState(1)

  const tasks: string[] = [
    t('art.motionTaskA'),
    t('art.motionTaskB'),
    t('art.motionTaskC'),
    t('art.motionTaskD'),
    t('art.motionTaskE'),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('art.motionPulse')}</h3>
            <span className="size-3.5 animate-pulse rounded-full bg-success" />
          </div>
          <p className="text-muted-foreground text-aek-125">{t('art.motionPulseDesc')}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('art.motionSpin')}</h3>
            <Icon name="loader" size={16} className="animate-spin text-accent" />
          </div>
          <p className="text-muted-foreground text-aek-125">{t('art.motionSpinDesc')}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('art.motionPing')}</h3>
            <span className="relative flex size-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-3.5 rounded-full bg-primary" />
            </span>
          </div>
          <p className="text-muted-foreground text-aek-125">{t('art.motionPingDesc')}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t('art.motionFeedback')}</h3>
            <p className="text-muted-foreground text-aek-125">{t('art.motionFeedbackDesc')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-aek-125">{tf('art.motionTimes', { n: count })}</span>
            <Switch checked={interact} onCheckedChange={setInteract} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!interact}
            onClick={() => { setCount(c => c + 1) }}
          >
            {t('art.motionTrigger')}
          </Button>
          <div className="h-2 flex-1 min-w-40 overflow-hidden rounded-full bg-secondary">
            <div
              className="bg-accent h-full rounded-full"
              style={{
                width: `${Math.min(100, count * 8)}%`,
                transition: 'width 450ms cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}
            />
          </div>
          <code className="text-muted-foreground text-aek-115">cubic-bezier(0.2, 0.8, 0.2, 1)</code>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        {/* BU round (m12968 ⑤): the card owns its own replay button —
            clicking it re-runs the 45ms stagger on the task rows below,
            so the demo no longer looks like a pile of inert text. */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t('art.motionListIn')}</h3>
            <p className="text-muted-foreground text-aek-125">{t('art.motionListDesc')}</p>
          </div>
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { setCount(c => c + 1) }}
                >
                  <Icon name="refresh" size={13} />
                  {t('art.motionReplay')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('art.motionReplayHint')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div key={count} className="space-y-2">
          {tasks.map((label, i) => (
            <div
              key={i}
              className="border-border bg-surface-hover flex items-center gap-3 rounded-lg border p-2.5 animate-tier-in"
              style={{ animationDelay: `${i * 45}ms`, animationFillMode: 'both' }}
            >
              <span className="text-muted-foreground tabular-nums text-aek-115 w-5">{i + 1}</span>
              <span className="flex-1 text-aek-13">{label}</span>
              <Icon name="check" size={14} className="text-success" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * BO round ⑫: the stage's "图表" tab. aek-web ships no chart widget, so
 * every glyph here is self-drawn on plain theme tokens (P16) and re-skins
 * with the selected spec: an interactive bar row (click a bar to spot it),
 * an SVG trend line, and an SVG share donut. The summary chips are derived
 * from the same series so the numbers stay honest.
 */
export function ChartsPanel() {
  const { t } = useI18n()
  const [picked, setPicked] = useState(3)

  const bars = [38, 62, 47, 88, 56, 73, 34, 91]
  const total = bars.reduce((a, b) => a + b, 0)
  const peak = Math.max(...bars)
  const low = Math.min(...bars)

  // 7-point weekly series for the line chart, 0–100 scale.
  const line = [22, 41, 35, 64, 58, 80, 72]
  const linePts = line
    .map((v, i) => `${((i / (line.length - 1)) * 100).toFixed(2)},${(40 - (v / 100) * 36).toFixed(2)}`)
    .join(' ')
  const areaPts = `0,40 ${linePts} 100,40`

  // Donut: three shares of the whole (sum to 100), drawn via stroke-dasharray.
  const donut: { label: string; share: number; color: string }[] = [
    { label: t('art.chartSeriesA'), share: 52, color: 'text-primary' },
    { label: t('art.chartSeriesB'), share: 31, color: 'text-success' },
    { label: t('art.chartShare'), share: 17, color: 'text-accent' },
  ]
  let acc = 0
  const donutSegs = donut.map((d) => {
    const from = acc
    acc += d.share
    return { ...d, from }
  })

  const week = [t('art.chartWeekA'), t('art.chartWeekB'), t('art.chartWeekC'), t('art.chartWeekD')]

  return (
    <div className="flex flex-col gap-4">
      <Group title={t('art.chartGroup')} note={t('art.chartGroupNote')}>
        <div className="flex flex-col gap-4">
          {/* ---- bar row (interactive) + summary chips ---- */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-aek-13 font-semibold">{t('art.chartBars')}</h4>
              <span className="text-muted-foreground tabular-nums text-aek-115">{bars[picked]}</span>
            </div>
            <div className="flex h-28 items-end gap-2">
              {bars.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${t('art.chartBars')} ${i + 1}`}
                  onClick={() => { setPicked(i) }}
                  className={cn(
                    'flex-1 rounded-t transition-colors',
                    i === picked ? 'bg-primary' : 'bg-primary/35 hover:bg-primary/60',
                  )}
                  style={{ height: `${v}%` }}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { lb: t('art.chartTotal'), vl: total },
                { lb: t('art.chartPeak'), vl: peak },
                { lb: t('art.chartLow'), vl: low },
              ].map(({ lb, vl }) => (
                <div key={lb} className="bg-card flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
                  <span className="text-muted-foreground text-2xs font-semibold uppercase">{lb}</span>
                  <span className="text-lg leading-none font-extrabold tabular-nums">{vl}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* ---- trend line ---- */}
            <div className="space-y-2">
              <h4 className="text-aek-13 font-semibold">{t('art.chartLine')}</h4>
              <svg viewBox="0 0 100 40" className="h-28 w-full" preserveAspectRatio="none" aria-hidden="true">
                <polygon points={areaPts} className="fill-primary/15" />
                <polyline
                  points={linePts}
                  fill="none"
                  className="stroke-primary"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                {line.map((v, i) => (
                  <circle
                    key={i}
                    cx={(i / (line.length - 1)) * 100}
                    cy={40 - (v / 100) * 36}
                    r="1.6"
                    className="fill-background stroke-primary"
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              <div className="text-muted-foreground flex justify-between text-2xs">
                {week.map(w => <span key={w}>{w}</span>)}
              </div>
            </div>

            {/* ---- share donut ---- */}
            <div className="space-y-2">
              <h4 className="text-aek-13 font-semibold">{t('art.chartDonut')}</h4>
              <div className="flex items-center gap-4">
                <svg viewBox="0 0 48 48" className="size-24" aria-hidden="true">
                  {donutSegs.map((s, i) => (
                    <circle
                      key={i}
                      cx="24"
                      cy="24"
                      r="18"
                      fill="none"
                      strokeWidth="7"
                      pathLength={100}
                      strokeDasharray={`${s.share} ${100 - s.share}`}
                      strokeDashoffset={-s.from}
                      stroke="currentColor"
                      transform="rotate(-90 24 24)"
                      className={donut[i].color}
                    />
                  ))}
                  <text x="24" y="27" textAnchor="middle" className="fill-foreground text-2xxs font-bold">{total}</text>
                </svg>
                <ul className="space-y-1.5">
                  {donut.map(d => (
                    <li key={d.label} className="text-aek-125 flex items-center gap-2">
                      <span className={cn('size-2.5 rounded-full bg-current', d.color)} />
                      <span className="flex-1">{d.label}</span>
                      <span className="text-muted-foreground tabular-nums">{d.share}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Group>
    </div>
  )
}

/**
 * BO round ⑫: the stage's "表单" tab — a realistic form composition (the
 * components tab already demos the individual controls in isolation). The
 * email field is a live validation demo: it starts invalid, the border and
 * message flip to success as it becomes a well-formed address, and Save
 * stays disabled until both name and email are valid.
 */
export function FormsPanel() {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('bad@example')
  const [region, setRegion] = useState('apac')
  const [lang, setLang] = useState('zh')
  const [notify, setNotify] = useState(true)

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const canSave = emailOk && name.trim().length > 0

  return (
    <div className="flex flex-col gap-4">
      <Group title={t('art.formCardTitle')} note={t('art.formCardNote')}>
        <div className="space-y-5">
          <section className="space-y-3">
            <h4 className="text-aek-13 font-semibold">{t('art.formProfile')}</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="art-forms-name">{t('art.formName')}</Label>
                <Input
                  id="art-forms-name"
                  value={name}
                  onChange={(e) => { setName(e.target.value) }}
                  placeholder={t('art.formNamePh')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art-forms-email">{t('art.formEmail')}</Label>
                <Input
                  id="art-forms-email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value) }}
                  placeholder={t('art.formEmailPh')}
                  className={cn(!emailOk && 'border-destructive focus:border-destructive')}
                />
                <p className={cn('text-aek-115', emailOk ? 'text-success' : 'text-destructive')}>
                  {emailOk ? t('art.formEmailOk') : t('art.formEmailErr')}
                </p>
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h4 className="text-aek-13 font-semibold">{t('art.formPrefs')}</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('art.formRegion')}</Label>
                <select
                  value={region}
                  onChange={(e) => { setRegion(e.target.value) }}
                  className="border-border bg-background text-aek-125 h-8.5 w-full rounded-md border px-2.5 focus:outline-none"
                >
                  <option value="apac">{t('art.formRegionA')}</option>
                  <option value="na">{t('art.formRegionB')}</option>
                  <option value="eu">{t('art.formRegionC')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('art.formLang')}</Label>
                <div className="pt-1.5">
                  <FancyRadio
                    value={lang}
                    options={[['zh', t('art.formLangA')], ['en', t('art.formLangB')]]}
                    onChange={setLang}
                  />
                </div>
              </div>
              <Row label={t('art.formNotify')}>
                <Switch checked={notify} onCheckedChange={setNotify} />
              </Row>
            </div>
          </section>

          <p className="text-muted-foreground text-aek-115">{t('art.formHint')}</p>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm">{t('art.formCancel')}</Button>
            <Button size="sm" disabled={!canSave}>{t('art.formSubmit')}</Button>
          </div>
        </div>
      </Group>
    </div>
  )
}

/**
 * BO round ⑫: the stage's "数据表" tab — a data-table pattern (the shadcn
 * Data Table family): a filter box, a sortable Name column, status badges,
 * row + select-all via the self-drawn checkbox, and a paginated footer.
 * Everything is driven by the theme tokens so the skin table re-skins it.
 */
export function TablesPanel() {
  const { t, tf } = useI18n()
  const [query, setQuery] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const rows = [
    { id: 'r1', name: 'auth-service', status: 'active', owner: 'ada', size: '128 MB', updated: '2h' },
    { id: 'r2', name: 'billing', status: 'idle', owner: 'lin', size: '64 MB', updated: '1d' },
    { id: 'r3', name: 'cdn-edge', status: 'active', owner: 'mei', size: '256 MB', updated: '12m' },
    { id: 'r4', name: 'data-pipeline', status: 'err', owner: 'ada', size: '512 MB', updated: '3h' },
    { id: 'r5', name: 'edge-proxy', status: 'idle', owner: 'lin', size: '32 MB', updated: '5d' },
    { id: 'r6', name: 'feature-flags', status: 'active', owner: 'mei', size: '8 MB', updated: '30m' },
    { id: 'r7', name: 'ingest', status: 'err', owner: 'sam', size: '204 MB', updated: '6h' },
    { id: 'r8', name: 'metrics', status: 'active', owner: 'sam', size: '96 MB', updated: '1h' },
    { id: 'r9', name: 'scheduler', status: 'idle', owner: 'ada', size: '16 MB', updated: '2d' },
  ]

  const statusLabel: Record<string, string> = {
    active: t('art.tblStActive'),
    idle: t('art.tblStIdle'),
    err: t('art.tblStErr'),
  }
  const statusEl = (s: string) =>
    s === 'active'
      ? <span className="border-success/30 bg-success/10 text-success rounded-full border px-2 py-0.5 text-2xs font-semibold">{statusLabel[s]}</span>
      : s === 'err'
        ? <Badge variant="destructive">{statusLabel[s]}</Badge>
        : <Badge variant="secondary">{statusLabel[s]}</Badge>

  const filtered = rows.filter(r =>
    (r.name + r.owner).toLowerCase().includes(query.toLowerCase()),
  )
  const sorted = [...filtered].sort((a, b) =>
    sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
  )

  const pageSize = 5
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)
  const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.id))

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visible.forEach((r) => { next.delete(r.id) })
      else visible.forEach((r) => { next.add(r.id) })
      return next
    })
  }
  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Group title={t('art.tblGroup')} note={t('art.tblGroupNote')}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Icon name="search" size={14} className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0) }}
                placeholder={t('art.tblSearch')}
                className="pl-8"
              />
            </div>
            <Badge variant="secondary">{tf('art.tblRows', { n: sorted.length })}</Badge>
            {selected.size > 0
              ? <Badge>{selected.size}</Badge>
              : null}
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" aria-label={t('art.tblSelectAll')}>
                    <FancyCheckbox checked={allVisibleSelected} onToggle={toggleAll} />
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-foreground"
                      onClick={() => { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')) }}
                    >
                      {t('art.tblColName')}
                      <Icon
                        name="chevronDown"
                        size={13}
                        className={cn('text-muted-foreground transition-transform', sortDir === 'asc' && 'rotate-180')}
                      />
                    </button>
                  </TableHead>
                  <TableHead>{t('art.tblColStatus')}</TableHead>
                  <TableHead>{t('art.tblColOwner')}</TableHead>
                  <TableHead>{t('art.tblColSize')}</TableHead>
                  <TableHead className="text-right">{t('art.tblColUpdated')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(r => (
                  <TableRow key={r.id} data-state={selected.has(r.id) ? 'selected' : undefined}>
                    <TableCell>
                      <FancyCheckbox checked={selected.has(r.id)} onToggle={() => { toggleRow(r.id) }} />
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{statusEl(r.status)}</TableCell>
                    <TableCell>{r.owner}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{r.size}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums text-right">{r.updated}</TableCell>
                  </TableRow>
                ))}
                {visible.length === 0
                  ? <TableRow><TableCell colSpan={6} className="text-muted-foreground text-center">{tf('art.tblRows', { n: 0 })}</TableCell></TableRow>
                  : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-aek-115">
              {t('art.tblPerPage')} {pageSize} · {safePage + 1}/{pageCount}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => { setPage(safePage - 1) }}>
                {t('art.tblPrev')}
              </Button>
              <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => { setPage(safePage + 1) }}>
                {t('art.tblNext')}
              </Button>
            </div>
          </div>
        </div>
      </Group>
    </div>
  )
}

/**
 * BP round ⑪: the stage's "浮层" tab — the shadcn overlay family (Popover,
 * Dropdown Menu, Dialog, Sheet, Kbd / Input Group). aek-web ships none of
 * them, so every surface is self-drawn on theme tokens (P16) and re-skins
 * with the selected spec.
 */
export function OverlaysPanel() {
  const { t } = useI18n()
  const [popOpen, setPopOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dlgOpen, setDlgOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <Group title={t('art.ovGroup')} note={t('art.ovGroupNote')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="relative min-h-28">
            <Button variant="outline" size="sm" onClick={() => { setPopOpen(v => !v) }}>
              {t('art.ovShow')}
            </Button>
            {popOpen
              ? (
                <div className="border-border bg-background absolute top-9 left-0 z-20 w-56 rounded-lg border p-3 shadow-lg">
                  <div className="text-aek-13 font-semibold">{t('art.ovShow')}</div>
                  <p className="text-muted-foreground mt-1 text-aek-115">{t('art.ovBody')}</p>
                </div>
              )
              : null}
          </div>

          <div className="relative min-h-28">
            <Button variant="outline" size="sm" onClick={() => { setMenuOpen(v => !v) }}>
              {t('art.ovMenu')}
            </Button>
            {menuOpen
              ? (
                <ul className="border-border bg-background absolute top-9 left-0 z-20 min-w-32 rounded-lg border p-1.5 shadow-lg m-0 list-none">
                  {([
                    { label: t('art.ovOpen'), icon: 'plus' },
                    { label: t('art.ovCopy'), icon: 'copy' },
                    { label: t('art.ovShare'), icon: 'externalLink' },
                  ] as { label: string; icon: IconName }[]).map(item => (
                    <li key={item.label}>
                      <button
                        type="button"
                        className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-aek-125"
                        onClick={() => { setMenuOpen(false) }}
                      >
                        <Icon name={item.icon} size={13} className="text-muted-foreground" />
                        {item.label}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      className="text-danger hover:bg-danger-soft flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-aek-125"
                      onClick={() => { setMenuOpen(false) }}
                    >
                      <Icon name="trash" size={13} />
                      {t('art.ovDelete')}
                    </button>
                  </li>
                </ul>
              )
              : null}
          </div>

          <div className="relative min-h-28">
            <Button variant="outline" size="sm" onClick={() => { setDlgOpen(v => !v) }}>
              {t('art.ovOpenDialog')}
            </Button>
            {dlgOpen
              ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-secondary/40">
                  <div className="border-border bg-background w-64 rounded-lg border p-3 shadow-lg">
                    <div className="text-aek-13 font-semibold">{t('art.ovDialogTitle')}</div>
                    <p className="text-muted-foreground mt-1 text-aek-115">{t('art.ovDialogBody')}</p>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setDlgOpen(false) }}>
                        {t('art.ovCancel')}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => { setDlgOpen(false) }}>
                        {t('art.ovConfirm')}
                      </Button>
                    </div>
                  </div>
                </div>
              )
              : null}
          </div>

          <div className="relative min-h-28">
            <Button variant="outline" size="sm" onClick={() => { setSheetOpen(v => !v) }}>
              {t('art.ovOpenSheet')}
            </Button>
            {sheetOpen
              ? (
                <div className="border-border bg-background animate-tier-in absolute top-0 right-0 z-10 flex h-full w-44 flex-col gap-2 rounded-lg border p-3 shadow-lg">
                  <div className="text-aek-13 font-semibold">{t('art.ovSheet')}</div>
                  <p className="text-muted-foreground text-aek-115">{t('art.ovSheetBody')}</p>
                  <Button variant="outline" size="sm" onClick={() => { setSheetOpen(false) }}>
                    {t('art.ovCancel')}
                  </Button>
                </div>
              )
              : null}
          </div>
        </div>
      </Group>

      <Group title={t('art.ovKbd')} note={t('art.ovKbdNote')}>
        <div className="border-border bg-background flex h-8.5 w-64 items-center gap-2 rounded-md border px-2.5">
          <Icon name="search" size={13} className="text-muted-foreground" />
          <input type="text" placeholder={t('art.ovSearchPh')} className="text-aek-125 w-full bg-transparent focus:outline-none" />
          <KbdChip label="⌘ K" />
        </div>
      </Group>
    </div>
  )
}

/**
 * BP round ⑪: the stage's "反馈" tab — the shadcn feedback family (Toast,
 * Alert, Spinner, Skeleton, Empty). Toasts are self-drawn and auto-dismiss
 * after 3s; every surface rides the theme tokens so the skin drives it.
 */
export function FeedbackPanel() {
  const { t } = useI18n()
  const [toasts, setToasts] = useState<{ id: number; tone: 'success' | 'warning' | 'error' | 'info'; text: string }[]>([])

  const fire = (tone: 'success' | 'warning' | 'error' | 'info', text: string) => {
    const id = Date.now() + Math.random()
    setToasts(v => [...v, { id, tone, text }])
    window.setTimeout(() => { setToasts(v => v.filter(x => x.id !== id)) }, 3000)
  }

  const alerts: { cls: string; icon: IconName; text: string }[] = [
    { cls: 'border-success/30 bg-success/10 text-success', icon: 'check', text: t('art.fbAlertSuccess') },
    { cls: 'border-accent/30 bg-accent/10 text-accent', icon: 'about', text: t('art.fbAlertInfo') },
    { cls: 'border-danger/30 bg-danger-soft text-danger', icon: 'alert', text: t('art.fbAlertWarn') },
    { cls: 'border-danger/40 bg-danger-soft text-danger', icon: 'alert', text: t('art.fbAlertErr') },
  ]

  return (
    <div className="relative flex flex-col gap-4">
      <Group title={t('art.fbGroup')} note={t('art.fbGroupNote')}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-aek-125 flex items-center gap-1.5"><Icon name="bell" size={13} />{t('art.fbToast')}</span>
          <Button variant="outline" size="sm" onClick={() => { fire('success', t('art.fbToastOk')) }}>{t('art.fbToastOk')}</Button>
          <Button variant="outline" size="sm" onClick={() => { fire('warning', t('art.fbToastWarn')) }}>{t('art.fbToastWarn')}</Button>
          <Button variant="outline" size="sm" onClick={() => { fire('error', t('art.fbToastErr')) }}>{t('art.fbToastErr')}</Button>
          <Button variant="outline" size="sm" onClick={() => { fire('info', t('art.fbToastInfo')) }}>{t('art.fbToastInfo')}</Button>
        </div>
        <Separator />
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.text} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5', a.cls)}>
              <Icon name={a.icon} size={15} />
              <span className="text-aek-125 flex-1">{a.text}</span>
            </div>
          ))}
        </div>
      </Group>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Group title={t('art.fbLoading')}>
          <div className="flex items-center gap-4">
            <Icon name="loader" size={16} className="text-muted-foreground animate-spin" />
            <div className="text-primary size-4 animate-spin rounded-full border-2 border-t-transparent" />
            <FancySkeleton />
          </div>
        </Group>

        <Group title={t('art.fbEmpty')}>
          <div className="border-border flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center">
            <span className="bg-secondary flex size-10 items-center justify-center rounded-full">
              <Icon name="about" size={18} className="text-muted-foreground" />
            </span>
            <div>
              <div className="text-aek-13 font-semibold">{t('art.fbEmptyTitle')}</div>
              <p className="text-muted-foreground mt-1 text-aek-115">{t('art.fbEmptyBody')}</p>
            </div>
            <Button variant="outline" size="sm">
              <Icon name="plus" size={13} />
              {t('art.fbEmptyAction')}
            </Button>
          </div>
        </Group>
      </div>

      <div className="pointer-events-none absolute right-0 bottom-0 z-30 flex w-60 flex-col gap-2">
        {toasts.map(msg => (
          <div key={msg.id} className="border-border bg-background pointer-events-auto animate-tier-in flex items-center gap-2 rounded-lg border p-2.5 shadow-lg">
            <Icon
              name={msg.tone === 'success' ? 'check' : msg.tone === 'info' ? 'about' : 'alert'}
              size={14}
              className={msg.tone === 'success' ? 'text-success' : msg.tone === 'info' ? 'text-accent' : 'text-danger'}
            />
            <span className="text-aek-125 flex-1">{msg.text}</span>
            <button
              type="button"
              aria-label={t('art.fbClose')}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => { setToasts(v => v.filter(x => x.id !== msg.id)) }}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * BP round ⑪: the stage's "导航" tab — the shadcn navigation family
 * (Breadcrumb, Pagination, Tabs, Toggle Group). Everything is self-drawn
 * on theme tokens so the selected spec re-skins the whole panel.
 */
export function NavigationPanel() {
  const { t } = useI18n()
  const [page, setPage] = useState(3)
  const [tab, setTab] = useState('a')
  const [view, setView] = useState<Set<string>>(new Set(['grid']))
  const [text, setText] = useState<Set<string>>(new Set(['bold']))

  const flipView = (id: string) => { setView(new Set([id])) }
  const flipText = (id: string) => {
    setText((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const crumbs = [t('art.nvHome'), t('art.nvProjects'), t('art.nvProject')]
  const pages: (number | string)[] = [1, 2, 3, 4, 5, '…', 6]
  const tabs: [string, string, string][] = [
    ['a', t('art.nvTabA'), t('art.nvTabABody')],
    ['b', t('art.nvTabB'), t('art.nvTabBBody')],
    ['c', t('art.nvTabC'), t('art.nvTabCBody')],
  ]

  return (
    <div className="flex flex-col gap-4">
      <Group title={t('art.nvGroup')} note={t('art.nvGroupNote')}>
        <div className="space-y-4">
          <nav aria-label={t('art.nvGroup')} className="flex items-center gap-1.5">
            {crumbs.map((label, i) => (
              <span key={label} className="flex items-center gap-1.5">
                {i > 0 ? <Icon name="chevronRight" size={12} className="text-muted-foreground" /> : null}
                <span className={i === crumbs.length - 1 ? 'text-aek-125 font-semibold' : 'text-muted-foreground text-aek-125'}>
                  {label}
                </span>
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={page === 1} aria-label={t('art.nvPrev')} onClick={() => { setPage(p => Math.max(1, p - 1)) }}>
              <Icon name="chevronLeft" size={13} />
            </Button>
            {pages.map((n, i) =>
              n === '…'
                ? <span key={`e${i}`} className="text-muted-foreground px-1 text-aek-125">…</span>
                : (
                  <button
                    key={n}
                    type="button"
                    aria-current={page === n ? 'page' : undefined}
                    onClick={() => { setPage(n as number) }}
                    className={cn(
                      'size-7 rounded-md text-aek-125 transition-colors',
                      page === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {n}
                  </button>
                ),
            )}
            <Button variant="outline" size="sm" disabled={page === 6} aria-label={t('art.nvNext')} onClick={() => { setPage(p => Math.min(6, p + 1)) }}>
              <Icon name="chevronRight" size={13} />
            </Button>
            <span className="text-muted-foreground ml-2 text-aek-115">{t('art.nvPages')} {page}/6</span>
          </div>
        </div>
      </Group>

      <Group title={t('art.nvTabs')} note={t('art.nvToggleNote')}>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="border-border flex gap-4 border-b">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setTab(id) }}
                  className={cn(
                    'text-aek-125 border-b-2 pb-2 transition-colors',
                    tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-aek-125">{tabs.find(x => x[0] === tab)?.[2]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <FancyToggleGroup
              options={[['grid', t('art.nvViewGrid')], ['list', t('art.nvViewList')]]}
              active={view}
              onToggle={flipView}
            />
            <FancyToggleGroup
              options={[['bold', t('art.nvBold')], ['italic', t('art.nvItalic')]]}
              active={text}
              onToggle={flipText}
            />
          </div>
        </div>
      </Group>
    </div>
  )
}

/**
 * BP round ⑪: the stage's "布局" tab — the shadcn layout family (Resizable
 * panes, Aspect Ratio frames, Scroll Area). The divider is a real drag
 * handle; every surface rides the theme tokens.
 */
export function LayoutPanel() {
  const { t } = useI18n()
  const [leftW, setLeftW] = useState(42)
  const boxRef = useRef<HTMLDivElement>(null)

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const onMove = (ev: PointerEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setLeftW(Math.min(78, Math.max(22, pct)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  }

  return (
    <div className="flex flex-col gap-4">
      <Group title={t('art.layGroup')} note={t('art.layGroupNote')}>
        <div className="space-y-3">
          <div ref={boxRef} className="border-border flex h-40 overflow-hidden rounded-lg border">
            <div style={{ width: `${leftW}%` }} className="bg-background flex min-w-0 items-center justify-center p-3">
              <span className="text-aek-125 font-semibold">{t('art.layLeft')}</span>
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={startDrag}
              className="border bg-border/20 flex h-full w-4 cursor-col-resize items-center justify-center"
            >
              <span className="bg-muted-foreground size-1.5 rounded-full" />
            </div>
            <div className="bg-secondary/50 flex flex-1 items-center justify-center p-3">
              <span className="text-aek-125 font-semibold">{t('art.layRight')}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-aek-115 tabular-nums">
              {t('art.layLeft')} {Math.round(leftW)}% · {t('art.layRight')} {100 - Math.round(leftW)}%
            </span>
            <Button variant="outline" size="sm" onClick={() => { setLeftW(42) }}>{t('art.layReset')}</Button>
          </div>
        </div>
      </Group>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Group title={t('art.layAspect')} note={t('art.layAspectNote')}>
          <div className="grid grid-cols-3 gap-3">
            <AspectCard label="16:9" className="aspect-video" />
            <AspectCard label="4:3" style={{ aspectRatio: '4 / 3' }} />
            <AspectCard label="1:1" style={{ aspectRatio: '1 / 1' }} />
          </div>
        </Group>

        <Group title={t('art.layScroll')} note={t('art.layScrollNote')}>
          <div className="max-h-40 overflow-auto rounded-lg border border-border">
            <div className="bg-secondary/60 sticky top-0 flex items-center justify-between px-3 py-1.5 text-2xs font-bold uppercase">
              <span>{t('art.layItem')}</span>
              <span className="tabular-nums">8</span>
            </div>
            {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
              <div key={n} className="border-border flex items-center gap-2 border-t px-3 py-2">
                <span className="text-muted-foreground text-2xs tabular-nums">{n}</span>
                <span className="text-aek-125">{t('art.layItem')} {n}</span>
                <Badge variant="secondary" className="ml-auto">v{n}</Badge>
              </div>
            ))}
          </div>
        </Group>
      </div>
    </div>
  )
}
