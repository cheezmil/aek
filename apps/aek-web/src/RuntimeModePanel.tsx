/**
 * 运行实例管理 — granular instance control (2026-11-09 round).
 *
 * The old panel offered three mode buttons (`1× AEK`, `1× AEK Next`, `同时运行
 * 两个`) and a duplicated pair of "后端服务 / 桌面窗口" tags. The user asked for:
 * - each slot's two halves (backend service / desktop window) independently
 *   startable, stoppable and restartable, plus select-all;
 * - restart / stop icons, including stopping the instance serving the console;
 * - the backend and the desktop-debug endpoint each shown as one standard URL
 *   with a port chip and a single copy button on the right;
 * - a spinner instead of a progress bar;
 * - a low-resource refresh loop (see `useInstances`).
 *
 * All collections are unordered `<ul>/<li>`.
 *
 * @module @cheezmil/aek-web/src/RuntimeModePanel
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { formatDisplayPath, parsePathStyle } from './paths.ts'
import { PREF_KEYS, usePref } from './preferences.tsx'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { CopyButton, PanelCard, Spinner, ToggleSwitch } from './ui-kit.tsx'
import type { SlotEndpoint } from './useConsoleFacts.ts'
import { useConsoleFacts } from './useConsoleFacts.ts'
import type { Half, HalfAction, InFlightInstance } from './useInstances.ts'
import { useInstances } from './useInstances.ts'
import { useAiRelease } from './useAiRelease.ts'
import { useBuildFlags } from './useBuildFlags.ts'

/** The two slots, in display order. */
const SLOTS = ['aek', 'next'] as const

/** One slot name. */
type Slot = typeof SLOTS[number]

/**
 * Render one endpoint row: label, full URL and a copy button pinned to the
 * right edge so the icons line up across rows.
 *
 * The URL already ends in `:<port>`, so the row carries no separate port chip
 * and no second copy button — both were noise.
 *
 * 2026-11-17: the WEB endpoint value is CLICKABLE (`onOpen`) — it opens in
 * the SYSTEM default browser. In the Electron shell the main process routes
 * every `window.open` http(s) URL to `shell.openExternal` (see aek-desktop
 * main's `setWindowOpenHandler`), and in a plain server browser the same
 * call just opens a new tab — one code path, both surfaces.
 * @param props - label, value, the copy label, and the optional open action.
 * @returns a list item.
 */
function EndpointRow({ label, value, copyLabel, onOpen }: {
  label: string
  value: string
  copyLabel: string
  onOpen?: (() => void) | undefined
}): ReactNode {
  const { t } = useI18n()
  return (
    // The 24px copy button is baked here (the module's
    // `.endpointRow > .iconButton { width: 24px; height: 24px }` descendant).
    <li className='aek-grid-endpoint-row grid items-center gap-2 py-1 border-t border-dashed border-border text-xs'>
      {/* 10px spacer = the sibling half-row's status-dot track, so the label
          lines up with 后端服务 / 桌面窗口 in the same card (2026-11-17). */}
      <span aria-hidden="true" className='w-2.5 h-2.5' />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-muted">{label}</span>
      {onOpen !== undefined
        ? (
          <button
            type="button"
            className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-secondary cursor-pointer transition duration-150 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1"
            title={`${t('runtime.endpoint.openHint')} · ${value}`}
            onClick={onOpen}
          >
            {value}
          </button>
        )
        : <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-secondary" title={value}>{value}</span>}
      <CopyButton value={value} label={copyLabel} size={13} className='size-6' />
    </li>
  )
}

/** Props for {@link HalfRow}. */
interface HalfRowProps {
  /** Human label (`后端服务` / `桌面窗口`). */
  label: string
  /** Whether this half is alive. */
  on: boolean
  /** Optional trailing note (`开发版` / `打包版`), only for a live window. */
  note?: string | undefined
  /** In-flight key for this half, or undefined. */
  busyKey: string | undefined
  /** This half's own busy prefix (`slot:half`). */
  base: string
  /** Start it. */
  onStart: () => void
  /** Stop it. */
  onStop: () => void
  /** Restart it. */
  onRestart: () => void
}

/**
 * One half of one instance: state, and its start / stop / restart controls.
 * @param props - label, liveness and callbacks.
 * @returns a list item.
 */
function HalfRow({ label, on, note, busyKey, base, onStart, onStop, onRestart }: HalfRowProps): ReactNode {
  const { tf } = useI18n()
  const busy = busyKey !== undefined && busyKey.startsWith(base)
  // HH round: the half controls are shadcn ghost icon-xs Buttons (the old
  // 26px hand-rolled borderless buttons read as floating dots next to the
  // design-system cards).
  const control = (action: HalfAction, icon: 'play' | 'stop' | 'refresh', hint: string, disabled: boolean): ReactNode => (
    <Button
      variant="ghost"
      size="icon-xs"
      className={cn(!disabled ? 'text-text-secondary' : 'text-text-muted')}
      onClick={() => {
        if (action === 'start') onStart()
        else if (action === 'stop') onStop()
        else onRestart()
      }}
      disabled={disabled || busy}
      title={hint}
      aria-label={hint}
    >
      <Icon name={icon} size={14} className="size-3.5" />
    </Button>
  )
  return (
    <li className='aek-grid-half-row grid items-center gap-2 py-1 text-xs'>
      <span className={cn('w-2 h-2 rounded-full', on ? 'bg-success ring-3 ring-success-soft' : 'bg-text-muted opacity-45')} aria-hidden="true" />
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <span className="text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
        {on && note !== undefined ? <span className='shrink-0 p-0.25 px-1.5 border border-border rounded-full text-text-muted text-2xxs leading-140 whitespace-nowrap'>{note}</span> : null}
      </span>
      <span className="inline-flex items-center gap-1">
        {busy ? <Spinner /> : null}
        {control('start', 'play', tf('runtime.half.start', { label }), on)}
        {control('restart', 'refresh', tf('runtime.half.restart', { label }), !on)}
        {control('stop', 'stop', tf('runtime.half.stop', { label }), !on)}
      </span>
    </li>
  )
}

/**
 * Render the instance manager.
 * @returns the panel surface.
 */
export function RuntimeModePanel({ refreshSignal }: { refreshSignal: number }) {
  const { t, tf } = useI18n()
  const state = useInstances()
  const facts = useConsoleFacts()
  // S7: the AI auto-release switch (persisted host-side, read by scripts too).
  const aiRelease = useAiRelease(refreshSignal)
  // BB round: the build-flag switch (source maps) — same host-persisted,
  // script-readable pattern as the auto-release switch above.
  const buildFlags = useBuildFlags(refreshSignal)
  // Q round: path display style (abbreviated ~/ · %USERPROFILE%\ vs full).
  const [pathStyle] = usePref(PREF_KEYS.pathStyle, 'abbreviated', parsePathStyle)

  // Sidebar-row refresh (Q round): re-read the instances and the facts.
  useEffect(() => {
    if (refreshSignal > 0) {
      state.refresh()
      facts.refresh()
    }
  }, [refreshSignal, state.refresh, facts.refresh])
  const current = state.status?.current.slot
  const health = state.health

  const endpointFor = (slot: Slot): SlotEndpoint | undefined => facts.facts?.endpoints.find(item => item.slot === slot)

  /** Liveness for one half, health-first then the full snapshot. */
  const halfOn = (slot: Slot, half: Half): boolean => {
    const live = health?.slots[slot]
    if (live !== undefined) return half === 'web' ? live.web : live.shell
    const slotStatus = state.status?.slots[slot]
    return half === 'web' ? slotStatus?.web === true : slotStatus?.shell === true
  }

  /** Which build is behind the window (health-first, then the full snapshot). */
  const shellKindFor = (slot: Slot): 'dev' | 'prod' | null => {
    const live = health?.slots[slot]
    if (live !== undefined) return live.shellKind ?? null
    return state.status?.slots[slot]?.shellKind ?? null
  }

  /** Chip text for a live window: dev shell or packaged app. */
  const shellNote = (slot: Slot): string | undefined => {
    const kind = shellKindFor(slot)
    if (kind === null) return undefined
    return kind === 'dev' ? t('runtime.kind.dev') : t('runtime.kind.prod')
  }

  /** Start every half that is currently down. */
  const startAll = (): void => {
    for (const slot of SLOTS) {
      for (const half of ['web', 'shell'] as const) {
        if (!halfOn(slot, half)) state.act(slot, half, 'start')
      }
    }
  }

  /** Restart every half that is currently up (the middle of the toolbar trio). */
  const restartAll = (): void => {
    for (const slot of SLOTS) {
      for (const half of ['web', 'shell'] as const) {
        if (halfOn(slot, half)) state.act(slot, half, 'restart')
      }
    }
  }

  /** Stop every half that is currently up. */
  const stopAll = (): void => {
    for (const slot of SLOTS) {
      for (const half of ['web', 'shell'] as const) {
        if (halfOn(slot, half)) state.act(slot, half, 'stop')
      }
    }
  }

  /** Start every half of one slot that is down. */
  const startSlot = (slot: Slot): void => {
    for (const half of ['web', 'shell'] as const) {
      if (!halfOn(slot, half)) state.act(slot, half, 'start')
    }
  }

  /** Restart every half of one slot that is up. */
  const restartSlot = (slot: Slot): void => {
    for (const half of ['web', 'shell'] as const) {
      if (halfOn(slot, half)) state.act(slot, half, 'restart')
    }
  }

  /** Stop every half of one slot that is up. */
  const stopSlot = (slot: Slot): void => {
    for (const half of ['web', 'shell'] as const) {
      if (halfOn(slot, half)) state.act(slot, half, 'stop')
    }
  }

  /**
   * X2 item 13: the in-flight pipeline of one slot — the same step-chip
   * language as the roster's operation pipelines (requested → applied → the
   * live outcome), with a done-over-total percentage.
   */
  const inFlightOf = (slot: Slot): InFlightInstance[] => state.inFlight.filter(op => op.slot === slot && op.outcome === undefined)

  return (
    <PanelCard>
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
          <Badge variant="secondary" className="gap-1.5 px-2.5 py-1.25">
            <Icon name="shield" size={14} className="size-3.5" />
            {t('runtime.default')}
          </Badge>
          <span className="inline-flex items-center gap-2">
            {/* X2 item 13: the whole-stop button carries the SAME THREE icons
                (start / restart / stop) as the per-half rows — one control
                set for all components, no lone icon.
                HH round: shadcn outline sm Buttons. */}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={startAll} title={t('runtime.startAll')}>
              <Icon name="play" size={14} className="size-3.5" />
              {t('runtime.startAll')}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={restartAll} title={t('runtime.restartAll')}>
              <Icon name="refresh" size={14} className="size-3.5" />
              {t('runtime.restartAll')}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={stopAll} title={t('runtime.stopAll')}>
              <Icon name="stop" size={14} className="size-3.5" />
              {t('runtime.stopAll')}
            </Button>
          </span>
        </div>

        <ul className='aek-grid-instance-list grid gap-6 list-none m-0 p-0'>
          {SLOTS.map((slot) => {
            const web = halfOn(slot, 'web')
            const shell = halfOn(slot, 'shell')
            const running = web || shell
            const endpoint = endpointFor(slot)
            const name = slot === 'aek' ? t('runtime.aek') : t('runtime.next')
            return (
              <li key={slot}>
                {/* HH round: the hand-rolled li border box is the shadcn Card;
                    the title row is CardHeader + CardAction (the standard
                    right-anchored action slot), the state pill a Badge, the
                    three half-controls ghost icon Buttons. */}
                <Card size="sm" className={cn('shadow-none transition duration-180 ease-aek', running ? 'border-success-border bg-success-soft' : 'border-border bg-surface-subtle')}>
                  <CardHeader>
                    <CardTitle className="text-sm-plus font-bold text-text">
                      {name}
                      {slot === current ? <Badge variant="secondary" className="ml-2">{t('runtime.current')}</Badge> : null}
                    </CardTitle>
                    <CardAction>
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant={running ? 'outline' : 'secondary'} className={cn('gap-1.5', running ? 'border-success-border text-success bg-card' : 'text-text-muted')}>
                          <span className="flex-none size-1.5 rounded-full bg-current" aria-hidden="true" />
                          {running ? t('runtime.running') : t('runtime.stopped')}
                        </Badge>
                        <span className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className={!web || !shell ? 'text-text-secondary' : 'text-text-muted'}
                            onClick={() => { startSlot(slot) }}
                            disabled={web && shell}
                            title={tf('runtime.startAllSlot', { name })}
                            aria-label={tf('runtime.startAllSlot', { name })}
                          >
                            <Icon name="play" size={14} className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className={running ? 'text-text-secondary' : 'text-text-muted'}
                            onClick={() => { restartSlot(slot) }}
                            disabled={!running}
                            title={tf('runtime.restartAllSlot', { name })}
                            aria-label={tf('runtime.restartAllSlot', { name })}
                          >
                            <Icon name="refresh" size={14} className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className={running ? 'text-text-secondary' : 'text-text-muted'}
                            onClick={() => { stopSlot(slot) }}
                            disabled={!running}
                            title={tf('runtime.stopAllSlot', { name })}
                            aria-label={tf('runtime.stopAllSlot', { name })}
                          >
                            <Icon name="stop" size={14} className="size-3.5" />
                          </Button>
                        </span>
                      </span>
                    </CardAction>
                  </CardHeader>
                  {/* HH round: one explicit 10px block rhythm (half rows /
                      in-flight / endpoints) — the ad-hoc mb-2.5 is gone. */}
                  <CardContent className="flex flex-col gap-2.5">

                    <ul className="flex flex-col gap-0.5 p-0 list-none">
                      <HalfRow
                        label={t('runtime.web')}
                        on={web}
                        busyKey={state.busy}
                        base={`${slot}:web`}
                        onStart={() =>{  state.act(slot, 'web', 'start') }}
                        onStop={() =>{  state.act(slot, 'web', 'stop') }}
                        onRestart={() =>{  state.act(slot, 'web', 'restart') }}
                      />
                      <HalfRow
                        label={t('runtime.shell')}
                        on={shell}
                        note={shellNote(slot)}
                        busyKey={state.busy}
                        base={`${slot}:shell`}
                        onStart={() =>{  state.act(slot, 'shell', 'start') }}
                        onStop={() =>{  state.act(slot, 'shell', 'stop') }}
                        onRestart={() =>{  state.act(slot, 'shell', 'restart') }}
                      />
                    </ul>

                    {/* X2 item 7: the in-flight pipeline — the "how far is that"
                        progress for this card's live controls (3-step, percented). */}
                    {inFlightOf(slot).length > 0
                      ? (
                        <ul className="list-none m-0 p-0 flex flex-col gap-1">
                          {inFlightOf(slot).map((op) => {
                            const applied = op.phase === 'applied'
                            const percent = applied ? 66 : 33
                            const halfName = op.half === 'web' ? t('runtime.web') : t('runtime.shell')
                            return (
                              <li key={op.key} className='aek-grid-inflight-row grid items-center gap-2 p-1 px-2 border border-dashed border-input rounded-xs text-2xs text-text-secondary'>
                                <span className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
                                  {tf(op.action === 'restart' ? 'runtime.half.restart' : (op.action === 'stop' ? 'runtime.half.stop' : 'runtime.half.start'), { label: halfName })}
                                </span>
                                <span className="flex gap-2">
                                  <span className="text-success">{t('runtime.inFlight.requested')}</span>
                                  <span className={applied ? 'text-success' : 'text-accent-ink'}>{t('runtime.inFlight.applied')}</span>
                                  <span className="text-text-muted">{t('runtime.inFlight.live')}</span>
                                </span>
                                <span className="tabular-nums text-text-muted min-w-8.5 text-right">{String(percent)}%</span>
                              </li>
                            )
                          })}
                        </ul>
                      )
                      : null}


                    <ul className="flex flex-col gap-1">
                      {endpoint !== undefined
                        ? (
                          <>
                            <EndpointRow
                              label={t('runtime.endpoint.web')}
                              value={endpoint.url}
                              copyLabel={t('runtime.copyUrl')}
                              onOpen={() =>{  window.open(endpoint.url, '_blank', 'noopener,noreferrer') }}
                            />
                            <EndpointRow
                              label={t('runtime.endpoint.cdp')}
                              value={`http://127.0.0.1:${String(endpoint.cdpPort)}`}
                              copyLabel={t('runtime.copyUrl')}
                            />
                          </>
                        )
                        : <li className="flex items-center justify-center gap-2 min-h-30 text-xs-plus text-text-muted">{t('common.loading')}</li>}
                    </ul>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>

        {state.error !== undefined
          ? <p className="mt-3 p-4 border border-danger-border rounded-sm bg-danger-soft text-danger text-xs-plus">{tf('runtime.error', { message: state.error })}</p>
          : null}

        <div className="flex gap-2.5 mt-3 p-4 border border-accent-border rounded-sm bg-accent-soft text-accent-ink aek-hero-note">
          <span className="flex-none text-primary"><Icon name="sparkles" size={16} /></span>
          <p>{t('runtime.hint')}</p>
        </div>

        <div className="flex items-center gap-2.5 mt-3 p-4 border border-border rounded-sm bg-surface-subtle">
          <span className="flex-none text-xs text-text-muted">{t('runtime.skillPath')}</span>
          <code
            className="grow basis-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-text-secondary"
            title={facts.facts?.skillPath ?? ''}
          >
            {facts.facts?.skillPath !== undefined
              ? formatDisplayPath(facts.facts.skillPath, facts.facts.home, facts.facts.platform, pathStyle)
              : t('common.loading')}
          </code>
          {/* Q round: the copy button ALWAYS copies the raw absolute path,
              never the display form. */}
          <CopyButton value={facts.facts?.skillPath ?? ''} label={t('runtime.copyPath')} />
        </div>

        {/* S7: the AI auto-release switch. Hides itself on older hosts
            (no route → 404 → unsupported); it never invents a state. */}
        {aiRelease.unsupported
          ? null
          : (
            <div className="flex flex-col gap-1.5 mt-3 p-4 border border-border rounded-sm bg-surface-subtle">
              <div className="flex items-start justify-between gap-3">
                <Label className="grow basis-auto text-xs-plus leading-normal text-text">{t('runtime.aiRelease.title')}</Label>
                {/* HH round: the standard shadcn (Radix) Switch via the
                    ui-kit ToggleSwitch. */}
                <ToggleSwitch
                  checked={aiRelease.allowed === true}
                  locked={aiRelease.busy || aiRelease.allowed === undefined}
                  onChange={(next) => { void aiRelease.setAllowed(next) }}
                  label={t('runtime.aiRelease.title')}
                />
              </div>
              <p className="m-0 text-xs leading-160 text-text-muted">{t('runtime.aiRelease.desc')}</p>
              {/* BB round: the ON state renders NO text — the switch itself
                  shows the state, and "on" is the expected default, so a
                  "已开启" label next to it is noise (user ruling). Only the
                  OFF state gets a callout (it is the abnormal one). */}
              {aiRelease.allowed === undefined
                ? <span className="text-xs text-text-secondary">{t('common.loading')}</span>
                : aiRelease.allowed
                  ? null
                  : <span className="text-xs text-text-secondary">{t('runtime.aiRelease.off')}</span>}
            </div>
          )}

        {/* BB round: the SOURCE-MAP build flag. Host-persisted exactly like
            the switch above; it takes effect on the NEXT build (the scripts
            export AEK_WEB_SOURCEMAP from this file), never on the running
            instance. Hides itself on older hosts (404 → unsupported). The
            on/off state carries no label — the switch itself shows it; the
            note below carries the positive/negative trade-off + the
            "next build" effect. */}
        {buildFlags.unsupported
          ? null
          : (
            <div className="flex flex-col gap-1.5 mt-3 p-4 border border-border rounded-sm bg-surface-subtle">
              <div className="flex items-start justify-between gap-3">
                <Label className="grow basis-auto text-xs-plus leading-normal text-text">{t('runtime.buildFlags.title')}</Label>
                <ToggleSwitch
                  checked={buildFlags.sourcemap === true}
                  locked={buildFlags.busy || buildFlags.sourcemap === undefined}
                  onChange={(next) => { void buildFlags.setSourcemap(next) }}
                  label={t('runtime.buildFlags.title')}
                />
              </div>
              <p className="m-0 text-xs leading-160 text-text-muted">{t('runtime.buildFlags.desc')}</p>
              <div className="mt-4 text-text-secondary text-xs leading-160">{t('runtime.buildFlags.effective')}</div>
            </div>
          )}
      </div>
    </PanelCard>
  )
}
