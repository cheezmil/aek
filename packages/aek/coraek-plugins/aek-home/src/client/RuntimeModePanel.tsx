/**
 * 运行实例管理 (2026-11-09 rename of 运行模式).
 *
 * Redesigned from the ground up:
 * - One clean status line per instance instead of the four repeated
 *   "● 后端服务 / ● 桌面窗口" tags the user called out. The web / shell
 *   liveness from C6 is folded into a single sentence.
 * - Every endpoint shows its URL and port with a copy button; URLs and ports
 *   come from the HOST scan (`/api/aek/console/facts`), never a literal here.
 * - `only-aek` is the DEFAULT: when the host reports `none` (or has not
 *   answered yet) the UI still presents 仅 AEK as the selected behaviour.
 * - The required isolation note plus a copyable skill absolute path.
 * - Refresh / mode changes show a spinner and an indeterminate loading bar.
 * - All collections are unordered `<ul>/<li>`.
 *
 * @module @cheezmil/aek-home/src/client/RuntimeModePanel
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'
import { CopyButton, LoadingBar, PanelCard, Spinner } from './ui-kit.tsx'
import type { SlotEndpoint } from './useConsoleFacts.ts'
import { useConsoleFacts } from './useConsoleFacts.ts'
import type { RuntimeMode } from './useRuntimeMode.ts'
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

/** The three target modes; only-aek is the default and listed first. */
const OPTIONS: readonly ModeOption[] = [
  { mode: 'only-aek', labelKey: 'runtime.onlyAek', stops: 'next' },
  { mode: 'only-next', labelKey: 'runtime.onlyNext', stops: 'aek' },
  { mode: 'both', labelKey: 'runtime.both', stops: null },
]

/**
 * Render one endpoint row with copy affordances.
 * @param props - label, value and optional port.
 * @returns a list item.
 */
function EndpointRow({ label, value, port, copyLabel }: {
  label: string
  value: string
  port?: number
  copyLabel: string
}): ReactNode {
  return (
    <li className={css.endpointRow}>
      <span className={css.endpointLabel}>{label}</span>
      <span className={css.endpointValue}>{value}</span>
      {port !== undefined
        ? <span className={css.endpointPort}>{String(port)}</span>
        : null}
      <CopyButton value={value} label={copyLabel} />
      {port !== undefined
        ? <CopyButton value={String(port)} label={copyLabel} />
        : null}
    </li>
  )
}

/**
 * Render the instance manager panel.
 * @returns the panel surface.
 */
export function RuntimeModePanel() {
  const { t, tf } = useI18n()
  const state = useRuntimeMode()
  const facts = useConsoleFacts()
  const [confirmMode, setConfirmMode] = useState<RuntimeMode | undefined>(undefined)
  const current = state.status?.current.slot
  // `none` (or no answer yet) is the documented default: only AEK.
  const mode = state.status?.mode === undefined || state.status.mode === 'none'
    ? 'only-aek'
    : state.status.mode
  const loading = facts.loading || state.status === undefined

  const endpointFor = (slot: string): SlotEndpoint | undefined => facts.facts?.endpoints.find(item => item.slot === slot)

  const onPick = (option: ModeOption): void => {
    if (option.stops !== null && option.stops === current) {
      setConfirmMode(option.mode)
      return
    }
    state.setMode(option.mode)
  }

  const confirm = confirmMode !== undefined
    ? OPTIONS.find(option => option.mode === confirmMode)
    : undefined

  return (
    <PanelCard
      title={t('runtime.title')}
      subtitle={t('runtime.subtitle')}
      actions={(
        <>
          {loading ? <Spinner /> : null}
          <button
            type="button"
            className={css.iconButton}
            onClick={() => { state.refresh(); facts.refresh() }}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
          >
            <Icon name="refresh" size={16} />
          </button>
        </>
      )}
    >
      <LoadingBar active={loading || state.pending !== undefined} />
      <div className={css.cardBody}>
        <div className={css.instanceDefault}>
          <Icon name="shield" size={14} />
          {t('runtime.default')}
        </div>

        <ul className={css.instanceList}>
          {(['aek', 'next'] as const).map((slot) => {
            const live = state.status?.slots[slot]
            const running = live?.running === true
            const endpoint = endpointFor(slot)
            const name = slot === 'aek' ? t('runtime.aek') : t('runtime.next')
            const halves = `${live?.web === true ? t('runtime.web') : '—'} / ${live?.shell === true ? t('runtime.shell') : '—'}`
            return (
              <li key={slot} className={cx(css.instanceCard, running && css.instanceCardOn)}>
                <div className={css.instanceHead}>
                  <span className={css.instanceName}>{name}</span>
                  <span className={cx(css.runtimePill, running ? css.runtimePillOn : css.runtimePillOff)}>
                    <span className={css.runtimeDot} />
                    {running ? t('runtime.running') : t('runtime.stopped')}
                  </span>
                </div>
                <p className={css.instanceHalves}>{halves}</p>
                <ul className={css.endpointList}>
                  {endpoint !== undefined
                    ? (
                      <>
                        <EndpointRow label={t('runtime.endpoint.web')} value={endpoint.url} port={endpoint.webPort} copyLabel={t('runtime.copyPort')} />
                        <EndpointRow label={t('runtime.endpoint.cdp')} value={`127.0.0.1:${String(endpoint.cdpPort)}`} port={endpoint.cdpPort} copyLabel={t('runtime.copyPort')} />
                        <EndpointRow label={t('runtime.endpoint.bundle')} value={endpoint.bundleId} copyLabel={t('common.copy')} />
                      </>
                    )
                    : <li className={css.emptyState}>{t('common.loading')}</li>}
                </ul>
              </li>
            )
          })}
        </ul>

        <div className={css.divider} />
        <h3 className={css.sectionTitle}>{t('runtime.target')}</h3>
        <ul className={css.modeList}>
          {OPTIONS.map((option) => {
            const active = mode === option.mode
            return (
              <li key={option.mode}>
                <button
                  type="button"
                  className={cx(css.runtimeOption, active && css.runtimeOptionActive)}
                  disabled={state.pending !== undefined}
                  onClick={() => onPick(option)}
                >
                  {t(option.labelKey)}
                  {active ? <span className={css.runtimeActiveTag}>{t('runtime.active')}</span> : null}
                </button>
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
          <code className={css.pathValue}>{facts.facts?.skillPath ?? t('common.loading')}</code>
          <CopyButton value={facts.facts?.skillPath ?? ''} label={t('runtime.copyPath')} />
        </div>

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
                    onClick={() => { const next = confirmMode; setConfirmMode(undefined); state.setMode(next) }}
                  >
                    {t('runtime.confirmYes')}
                  </button>
                </div>
              </div>
            </div>
          )
          : null}
      </div>
    </PanelCard>
  )
}
