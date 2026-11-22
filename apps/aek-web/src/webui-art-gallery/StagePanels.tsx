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
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../Icons.tsx'
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

export function ComponentsPanel() {
  const { t } = useI18n()
  const [check, setCheck] = useState(true)
  const [radio, setRadio] = useState('a')
  const [slider, setSlider] = useState(62)
  const [accOpen, setAccOpen] = useState<string | null>('q1')

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
