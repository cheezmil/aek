/**
 * X5b: the first-run setup wizard (`/setup`) + the "components missing"
 * floating notice.
 *
 * Third-round ruling (2026-11-16 05:3x): the wizard carries NO choices at
 * all — opening the shell AUTO-INSTALLS the base environment (`pnpm add -g
 * @cheezmil/coraek`, npm fallback; Node.js itself is never auto-installed,
 * a missing runtime just says so). Free selection of the optional AEK
 * components (aekpm / aekws / aeksm) lives INSIDE the console (the
 * component-install panel), reached via "Continue to console".
 *
 * Failure path = copyable log: the install output is shown with a copy
 * button so the user hands it to their agent ("let your agent solve it")
 * — the only support loop that needs no assumptions about the machine.
 */
import { useEffect, useRef } from 'react'
import { useState } from 'react'
import { CopyButton } from './ui-kit.tsx'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { oneOf, PREF_KEYS, usePref } from './preferences.tsx'
import { useShellInstall } from './useShellInstall.ts'
import css from './Setup.module.css'

const parseBool = (raw: unknown): boolean | undefined =>
  typeof raw === 'boolean' ? raw : undefined

/** Short display version: `@cheezmil/coraek/1.2.0 darwin-arm64 …` → `v1.2.0`.
 *  The full probe string stays in the row's tooltip. */
function shortVersion(value: string): string {
  const first = value.trim().split(/\s+/)[0] ?? value
  const seg = first.includes('/') ? (first.split('/').pop() ?? first) : first
  return /^v/i.test(seg) ? seg : `v${seg}`
}

/** One status row: green check when present, red alert when missing. */
function StatusRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className={css.row}>
      <Icon name={value !== undefined ? 'check' : 'alert'} size={16} className={value !== undefined ? css.iconCheck : css.iconAlert} />
      <span className={css.rowLabel}>{label}</span>
      {value !== undefined
        ? <span className={css.rowValue} title={value}>{shortVersion(value)}</span>
        : <span className={css.chipMissing}>{'\u00A0'}</span>}
    </div>
  )
}

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const { t, tf, locale, setLocale } = useI18n()
  const { available, status, result, pending, install } = useShellInstall()
  const [, setSetupSeen] = usePref(PREF_KEYS.shellSetupSeen, false, parseBool)
  // Third-round ruling: the base environment installs itself — one-shot
  // auto-install when the host CLI probe came back empty (Node present).
  const autoStarted = useRef(false)

  useEffect(() => {
    if (autoStarted.current || status === undefined || status.node === undefined) return
    if (status.aek !== undefined) return
    autoStarted.current = true
    void install(['@cheezmil/coraek'])
  }, [status, install])

  // Not inside the desktop shell: the bridge (and its probes) do not exist.
  if (!available) {
    return (
      <div className={css.placeholder}>
        <div className={css.placeholderCard}>
          <p className={css.placeholderBody}>{t('setup.noShell')}</p>
        </div>
      </div>
    )
  }

  const nodeMissing = status?.node === undefined
  const baseInstalling = pending && result === undefined
  const baseFailed = result !== undefined && !result.ok && !pending
  const baseOk = status?.aek !== undefined || (result?.ok === true && !pending)

  const continueToConsole = (): void => {
    setSetupSeen(true)
    onDone()
  }

  return (
    <div className={css.wizard}>
      <div className={css.wizardBody}>
        <header className={css.wizardHeader}>
          <p className={css.wizardSubtitle}>{t('setup.subtitle')}</p>
          <button
            type="button"
            className={css.localeToggle}
            title={t('footer.language')}
            aria-label={t('footer.language')}
            onClick={() => {
              setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')
            }}
          >
            <Icon name="language" size={15} />
            <span>{locale === 'zh-CN' ? '中文' : 'English'}</span>
          </button>
        </header>

        {status === undefined
          ? (
            <div className={css.section}>
              <div className={css.sectionHead}>
                <span className={css.sectionNum}>1</span>
                <span className={css.sectionTitle}>{t('setup.section.runtime')}</span>
              </div>
              <div className={css.readyLine} role="status">{t('about.loading')}</div>
            </div>
          )
          : (
            <>
              <section className={css.section}>
                <div className={css.sectionHead}>
                  <span className={css.sectionNum}>1</span>
                  <span className={css.sectionTitle}>{t('setup.section.runtime')}</span>
                </div>
                <StatusRow label={t('about.shellInstall.node')} value={status.node} />
                <StatusRow label={t('about.shellInstall.pkgMgr')} value={status.pnpm ?? status.npm} />
                <div className={css.backendRow}>
                  <Icon name={status.backendUp ? 'check' : 'alert'} size={14} className={status.backendUp ? css.backendOk : css.backendDown} />
                  <span className={status.backendUp ? css.backendOk : css.backendDown}>
                    {status.backendUp
                      ? t('about.shellInstall.backendUp')
                      : t('about.shellInstall.backendDown')}
                  </span>
                </div>
              </section>

              <section className={css.section}>
                <div className={css.sectionHead}>
                  <span className={css.sectionNum}>2</span>
                  <span className={css.sectionTitle}>{t('setup.section.base')}</span>
                </div>
                {nodeMissing
                  ? (
                    <p className={css.hintLine} role="alert">
                      <Icon name="alert" size={14} className={css.iconAlert} />
                      {t('setup.nodeMissing')}
                    </p>
                  )
                  : (
                    <>
                      <StatusRow label={t('about.shellInstall.cli')} value={status.aek} />
                      {baseInstalling
                        ? (
                          <p className={css.hintLine} role="status">
                            <Icon name="refresh" size={14} className={css.iconSpin} />
                            {t('setup.autoInstalling')}
                          </p>
                        )
                        : null}
                      {baseOk && !baseInstalling
                        ? (
                          <p className={css.readyLine} role="status">
                            <Icon name="check" size={14} />
                            {t('setup.baseReady')}
                          </p>
                        )
                        : null}
                      {baseFailed
                        ? (
                          <>
                            <p className={`${css.noticeLine} ${css.noticeError}`} role="alert">
                              <Icon name="alert" size={14} />
                              <span>{tf('about.shellInstall.failed', { tool: result.tool })}</span>
                            </p>
                            {result.output !== ''
                              ? (
                                <div className={css.outputWrap}>
                                  <div className={css.outputHead}>
                                    <CopyButton value={result.output} size={14} label={t('setup.copyLog')} />
                                  </div>
                                  <pre className={css.output}>{result.output}</pre>
                                </div>
                              )
                              : null}
                            <p className={css.hintLine}>
                              {t('setup.agentHelp')}
                            </p>
                          </>
                        )
                        : null}
                    </>
                  )}
              </section>

              {baseOk
                ? (
                  <p className={css.readyLineFinal} role="status">
                    <Icon name="check" size={14} />
                    {t('setup.allReady')}
                  </p>
                )
                : null}

              <footer className={css.footer}>
                <button
                  type="button"
                  className={css.actionBtn}
                  style={{ fontSize: 13.5, padding: '7px 16px' }}
                  onClick={continueToConsole}
                >
                  {t('setup.continue')}
                </button>
              </footer>
            </>
          )}
      </div>
    </div>
  )
}

/**
 * Corner notice: shown in the console while at least one OPTIONAL AEK
 * component (aekpm / aekws / aeksm) is missing. The base environment
 * installs itself on the wizard page, so it is not part of this count.
 * Clicking the action lands on the console's component-install panel.
 */
export function SetupNotice() {
  const { t, tf } = useI18n()
  const { available, status } = useShellInstall()
  const [dismissed, setDismissed] = useState(false)
  const [, setPanel] = usePref(PREF_KEYS.panel, 'runtime', oneOf(['runtime', 'websearch', 'plugins', 'skills', 'prompts', 'websearchSettings', 'settings', 'about', 'components'] as const))

  const missing = status !== undefined
    ? [status.aekpm, status.aekws, status.aeksm].filter(v => v === undefined).length
    : 0

  if (!available || dismissed || missing === 0) return null

  const openComponents = (): void => {
    setPanel('components')
    window.history.pushState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className={css.floatNotice} role="status">
      <span className={css.floatNoticeIcon}>
        <Icon name="alert" size={16} />
      </span>
      <span className={css.floatNoticeText}>{tf('setup.notice', { n: missing })}</span>
      <button type="button" className={css.actionBtn} onClick={openComponents}>
        {t('setup.noticeAction')}
      </button>
      <button
        type="button"
        className={css.floatNoticeClose}
        aria-label={t('setup.noticeDismiss')}
        onClick={() => {
          setDismissed(true)
        }}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
