/**
 * The dual-app runtime panel (C5: the old 概览 section was removed; runtime
 * is its own first-class menu entry instead of a card buried in the overview).
 *
 * Shows which slot this console belongs to and which HALVES of each slot are
 * live — the web backend AND the Electron window (C6: "both running" is only
 * true when the user actually sees two windows / backends, not when some port
 * probe is optimistic). Then it lets the user pick a target mode; a mode that
 * would stop the instance currently serving this console asks for a second
 * confirmation first.
 *
 * @module @cheezmil/aek-home/src/client/RuntimeModePanel
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'
import type { RuntimeMode, SlotStatus } from './useRuntimeMode.ts'
import { useRuntimeMode } from './useRuntimeMode.ts'

/** One selectable mode with its i18n key + whether it stops the current slot. */
interface ModeOption {
  /** The mode value sent to the host. */
  mode: RuntimeMode
  /** i18n key of the label. */
  labelKey: string
  /** Slot this mode would stop, or `null` when it never stops the current one. */
  stops: 'aek' | 'next' | null
}

/** The three target modes. */
const OPTIONS: readonly ModeOption[] = [
  { mode: 'only-aek', labelKey: 'runtime.onlyAek', stops: 'next' },
  { mode: 'only-next', labelKey: 'runtime.onlyNext', stops: 'aek' },
  { mode: 'both', labelKey: 'runtime.both', stops: null },
]

/**
 * Render the runtime mode panel.
 * @returns the panel surface.
 */
export function RuntimeModePanel() {
  const { t, tf } = useI18n()
  const state = useRuntimeMode()
  const [confirmMode, setConfirmMode] = useState<RuntimeMode | undefined>(undefined)
  const current = state.status?.current.slot
  const mode = state.status?.mode ?? 'none'

  const slots = useMemo(() => ([
    { key: 'aek' as const, name: t('runtime.aek'), live: state.status?.slots.aek },
    { key: 'next' as const, name: t('runtime.next'), live: state.status?.slots.next },
  ]), [state.status, t])

  const onPick = (option: ModeOption): void => {
    if (option.stops !== null && option.stops === current) {
      setConfirmMode(option.mode)
      return
    }
    state.setMode(option.mode)
  }

  const confirm = confirmMode
    ? OPTIONS.find(o => o.mode === confirmMode)
    : undefined

  /** @param label - half name. @param live - whether it is up. @returns its tag. */
  const halfTag = (label: string, live: boolean): ReactNode => (
    <span className={cx(css.runtimeHalf, live && css.runtimeHalfOn)}>
      <span className={css.runtimeDot} />
      {label}
    </span>
  )

  return (
    <section className={css.runtimeCard}>
      <header className={css.runtimeHead}>
        <div>
          <h2 className={css.runtimeTitle}>{t('runtime.title')}</h2>
          <p className={css.runtimeSubtitle}>{t('runtime.subtitle')}</p>
        </div>
        <span className={css.runtimeCurrent}>
          {t('runtime.current')}：<strong>{current === 'next' ? t('runtime.next') : t('runtime.aek')}</strong>
        </span>
      </header>

      <div className={css.runtimeSlots}>
        {slots.map((slot) => {
          const slotLive: SlotStatus = slot.live ?? { webPort: 0, web: false, shell: false, running: false }
          return (
            <div
              key={slot.key}
              className={cx(css.runtimeSlot, slotLive.running ? css.runtimeSlotOn : css.runtimeSlotOff)}
            >
              <div className={css.runtimeSlotHead}>
                <span className={css.runtimeSlotName}>{slot.name}</span>
                <span className={cx(css.runtimePill, slotLive.running ? css.runtimePillOn : css.runtimePillOff)}>
                  <span className={css.runtimeDot} />
                  {slotLive.running ? t('runtime.running') : t('runtime.stopped')}
                </span>
              </div>
              <div className={css.runtimeSlotDetail}>
                {halfTag(t('runtime.web'), slotLive.web)}
                {halfTag(t('runtime.shell'), slotLive.shell)}
              </div>
            </div>
          )
        })}
      </div>

      <div className={css.runtimeTarget}>{t('runtime.target')}</div>
      <div className={css.runtimeOptions}>
        {OPTIONS.map((option) => {
          const active = mode !== 'none' && mode === option.mode
          const disabled = state.pending !== undefined
          return (
            <button
              key={option.mode}
              type="button"
              className={cx(css.runtimeOption, active && css.runtimeOptionActive)}
              disabled={disabled}
              onClick={() => onPick(option)}
            >
              {t(option.labelKey)}
              {active ? <span className={css.runtimeActiveTag}>{t('runtime.active')}</span> : null}
            </button>
          )
        })}
      </div>

      {state.pending !== undefined
        ? <p className={css.runtimeStatusLine}>{t('common.loading')}</p>
        : null}
      {state.error !== undefined
        ? <p className={css.runtimeError}>{tf('runtime.error', { message: state.error })}</p>
        : null}

      {confirm && confirmMode
        ? (
          <div className={css.runtimeConfirmOverlay} role="dialog" aria-modal="true">
            <div className={css.runtimeConfirmBox}>
              <h3 className={css.runtimeConfirmTitle}>{t('runtime.confirmTitle')}</h3>
              <p className={css.runtimeConfirmText}>{t('runtime.confirmText')}</p>
              <div className={css.runtimeConfirmActions}>
                <button type="button" className={css.runtimeConfirmNo} onClick={() => setConfirmMode(undefined)}>
                  {t('runtime.confirmNo')}
                </button>
                <button
                  type="button"
                  className={css.runtimeConfirmYes}
                  onClick={() => { const m = confirmMode; setConfirmMode(undefined); state.setMode(m) }}
                >
                  {t('runtime.confirmYes')}
                </button>
              </div>
            </div>
          </div>
        )
        : null}
    </section>
  )
}
