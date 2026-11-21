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
  const [count, setCount] = useState(0)

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
        <div className="mb-3">
          <h3 className="text-sm font-semibold">{t('art.motionListIn')}</h3>
          <p className="text-muted-foreground text-aek-125">{t('art.motionListDesc')}</p>
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
