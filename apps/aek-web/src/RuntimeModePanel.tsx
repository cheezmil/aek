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
 * @module @cheezmil/aek-home/src/client/RuntimeModePanel
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { formatDisplayPath, parsePathStyle } from './paths.ts'
import { PREF_KEYS, usePref } from './preferences.tsx'
import { css, cx } from './styles.ts'
import { CopyButton, PanelCard, Spinner } from './ui-kit.tsx'
import type { SlotEndpoint } from './useConsoleFacts.ts'
import { useConsoleFacts } from './useConsoleFacts.ts'
import type { Half, HalfAction } from './useInstances.ts'
import { useInstances } from './useInstances.ts'

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
 * @param props - label, value and the copy label.
 * @returns a list item.
 */
function EndpointRow({ label, value, copyLabel }: {
  label: string
  value: string
  copyLabel: string
}): ReactNode {
  return (
    <li className={css.endpointRow}>
      <span className={css.endpointLabel}>{label}</span>
      <span className={css.endpointValue} title={value}>{value}</span>
      <CopyButton value={value} label={copyLabel} size={13} />
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
  const control = (action: HalfAction, icon: 'play' | 'stop' | 'refresh', hint: string, disabled: boolean): ReactNode => (
    <button
      type="button"
      className={cx(css.halfButton, !disabled && css.halfButtonOn)}
      onClick={() => {
        if (action === 'start') onStart()
        else if (action === 'stop') onStop()
        else onRestart()
      }}
      disabled={disabled || busy}
      title={hint}
      aria-label={hint}
    >
      <Icon name={icon} size={14} />
    </button>
  )
  return (
    <li className={css.halfRow}>
      <span className={cx(css.halfDot, on ? css.halfDotOn : css.halfDotOff)} aria-hidden="true" />
      <span className={css.halfTitle}>
        <span className={css.halfLabel}>{label}</span>
        {on && note !== undefined ? <span className={css.halfNote}>{note}</span> : null}
      </span>
      <span className={css.halfActions}>
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

  /** Stop every half that is currently up. */
  const stopAll = (): void => {
    for (const slot of SLOTS) {
      for (const half of ['web', 'shell'] as const) {
        if (halfOn(slot, half)) state.act(slot, half, 'stop')
      }
    }
  }

  /** Select-all on one card: any half down → start the missing ones, else stop both. */
  const toggleSlot = (slot: Slot): void => {
    const web = halfOn(slot, 'web')
    const shell = halfOn(slot, 'shell')
    if (web && shell) {
      state.act(slot, 'web', 'stop')
      state.act(slot, 'shell', 'stop')
      return
    }
    if (!web) state.act(slot, 'web', 'start')
    if (!shell) state.act(slot, 'shell', 'start')
  }

  return (
    <PanelCard>
      <div className={css.cardBody}>
        <div className={css.instanceToolbar}>
          <span className={css.instanceDefault}>
            <Icon name="shield" size={14} />
            {t('runtime.default')}
          </span>
          <span className={css.instanceToolbarActions}>
            <button type="button" className={css.toolbarButton} onClick={startAll} title={t('runtime.startAll')}>
              <Icon name="play" size={14} />
              {t('runtime.startAll')}
            </button>
            <button type="button" className={css.toolbarButton} onClick={stopAll} title={t('runtime.stopAll')}>
              <Icon name="stop" size={14} />
              {t('runtime.stopAll')}
            </button>
          </span>
        </div>

        <ul className={css.instanceList}>
          {SLOTS.map((slot) => {
            const web = halfOn(slot, 'web')
            const shell = halfOn(slot, 'shell')
            const running = web || shell
            const endpoint = endpointFor(slot)
            const name = slot === 'aek' ? t('runtime.aek') : t('runtime.next')
            const allOn = web && shell
            return (
              <li key={slot} className={cx(css.instanceCard, running && css.instanceCardOn)}>
                <div className={css.instanceHead}>
                  <span className={css.instanceName}>
                    {name}
                    {slot === current ? <span className={css.instanceSelf}>{t('runtime.current')}</span> : null}
                  </span>
                  <span className={css.instanceHeadRight}>
                    <span className={cx(css.runtimePill, running ? css.runtimePillOn : css.runtimePillOff)}>
                      <span className={css.runtimeDot} />
                      {running ? t('runtime.running') : t('runtime.stopped')}
                    </span>
                    <button
                      type="button"
                      className={cx(css.halfButton, css.selectAllButton)}
                      onClick={() =>{  toggleSlot(slot) }}
                      title={allOn ? tf('runtime.stopAllSlot', { name }) : tf('runtime.startAllSlot', { name })}
                      aria-label={allOn ? tf('runtime.stopAllSlot', { name }) : tf('runtime.startAllSlot', { name })}
                    >
                      <Icon name={allOn ? 'stop' : 'play'} size={14} />
                    </button>
                  </span>
                </div>

                <ul className={css.halfList}>
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

                <ul className={css.endpointList}>
                  {endpoint !== undefined
                    ? (
                      <>
                        <EndpointRow
                          label={t('runtime.endpoint.web')}
                          value={endpoint.url}
                          copyLabel={t('runtime.copyUrl')}
                        />
                        <EndpointRow
                          label={t('runtime.endpoint.cdp')}
                          value={`http://127.0.0.1:${String(endpoint.cdpPort)}`}
                          copyLabel={t('runtime.copyUrl')}
                        />
                      </>
                    )
                    : <li className={css.emptyState}>{t('common.loading')}</li>}
                </ul>
              </li>
            )
          })}
        </ul>

        {state.error !== undefined
          ? <p className={css.runtimeError}>{tf('runtime.error', { message: state.error })}</p>
          : null}

        <div className={css.heroNote}>
          <span className={css.noteIcon}><Icon name="sparkles" size={16} /></span>
          <p>{t('runtime.hint')}</p>
        </div>

        <div className={css.pathBox}>
          <span className={css.pathLabel}>{t('runtime.skillPath')}</span>
          <code
            className={css.pathValue}
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
      </div>
    </PanelCard>
  )
}
