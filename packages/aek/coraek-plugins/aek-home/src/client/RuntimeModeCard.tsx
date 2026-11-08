/**
 * The dual-app runtime switcher card.
 *
 * Shows which slot this console belongs to and whether each slot is live, then
 * lets the user pick a target mode (one instance, or both). Picking a mode that
 * would stop the instance currently serving this console asks for a second
 * confirmation first — stopping it drops this very connection.
 *
 * All copy comes from the i18n dictionary; all facts from {@link useRuntimeMode}.
 *
 * @module @cheezmil/aek-home/src/client/RuntimeModeCard
 */
import { useMemo, useState } from 'react'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'
import type { RuntimeMode, RuntimeState } from './useRuntimeMode.ts'

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

/** Props for {@link RuntimeModeCard}. */
export interface RuntimeModeCardProps {
  /** Live runtime state. */
  state: RuntimeState
}

/**
 * Render the runtime switcher card.
 * @param props - runtime state.
 * @returns the card surface.
 */
export function RuntimeModeCard({ state }: RuntimeModeCardProps) {
  const { t } = useI18n()
  const [confirmMode, setConfirmMode] = useState<RuntimeMode | undefined>(undefined)
  const current = state.status?.current.slot
  const mode = state.status?.mode ?? 'none'

  const slots = useMemo(() => ([
    { key: 'aek' as const, name: t('runtime.aek'), running: state.status?.slots.aek.running ?? false },
    { key: 'next' as const, name: t('runtime.next'), running: state.status?.slots.next.running ?? false },
  ]), [state.status, t])

  const onPick = (option: ModeOption) => {
    if (option.stops !== null && option.stops === current) {
      setConfirmMode(option.mode)
      return
    }
    state.setMode(option.mode)
  }

  const confirm = confirmMode
    ? OPTIONS.find(o => o.mode === confirmMode)
    : undefined

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
        {slots.map(slot => (
          <div key={slot.key} className={cx(css.runtimeSlot, slot.running ? css.runtimeSlotOn : css.runtimeSlotOff)}>
            <span className={css.runtimeSlotName}>{slot.name}</span>
            <span className={cx(css.runtimePill, slot.running ? css.runtimePillOn : css.runtimePillOff)}>
              <span className={css.runtimeDot} />
              {slot.running ? t('runtime.running') : t('runtime.stopped')}
            </span>
          </div>
        ))}
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
        ? <p className={css.runtimeError}>{t('runtime.error', { message: state.error })}</p>
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
