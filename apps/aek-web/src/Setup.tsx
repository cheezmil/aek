/**
 * X5b: the first-run setup wizard (`/setup`) — the SHELL's own surface.
 *
 * Ruling (2026-11-16, X5b-13 round): component installation is the desktop
 * shell's business, NOT the webui's (the console keeps its own
 * "插件与程序管理" logic). The wizard therefore carries the tucked-away
 * component list: section 3 collapses behind a chevron + summary chip
 * (one click expands, the user works the rows one by one), installed rows
 * show the green check icon (never a checkbox, never an emoji), and the
 * action row (select-all + install) stays visible.
 *
 * The wizard carries no choices for what AEK NEEDS: opening the shell
 * AUTO-INSTALLS the base environment (`@cheezmil/coraek`) plus the
 * REQUIRED components (`@cheezmil/aek-prompt-manager` +
 * `@cheezmil/aek-skill-manager` — the AEK system depends on them to keep
 * running, so they are not user-selectable; a lock mark + 必装 chip
 * instead). pnpm is the only package manager; Node.js itself is never
 * auto-installed, a missing runtime just says so. When everything
 * required is ready the wizard CONTINUES ON ITS OWN into the webui; it
 * lingers (manual entry button) when Node.js is missing, an install
 * failed, or the OPTIONAL component (aekws) is still missing — so the
 * user gets the chance to work the list one by one.
 *
 * Failure path = copyable log + a REFERENCE to the AEK system skill
 * (`aek-usage`): the UI shows the skill's absolute path (bridge field
 * `skillPath`, resolved host-side from the slot data root; hidden when
 * the skill is not seeded) instead of inlining the whole procedure — the
 * self-check / install / repair steps live in the skill itself.
 */
import { useEffect, useRef, useState } from 'react'
import { CopyButton } from './ui-kit.tsx'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { PREF_KEYS, usePref } from './preferences.tsx'
import { useShellInstall } from './useShellInstall.ts'
import css from './Setup.module.css'

const parseBool = (raw: unknown): boolean | undefined =>
  typeof raw === 'boolean' ? raw : undefined

/** Short display version: `@cheezmil/coraek/1.2.0 darwin-arm64 …` → `v1.2.0`.
 *  The full probe string stays in the row's tooltip — nothing gets clipped. */
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

/** Everything AEK needs to run: the base host plus the two components the
 *  system depends on (aekpm / aeksm). Installed as one lot, never
 *  user-selectable. */
const REQUIRED_FIELDS = ['aek', 'aekpm', 'aeksm'] as const
const REQUIRED_PACKAGES: Record<(typeof REQUIRED_FIELDS)[number], string> = {
  aek: '@cheezmil/coraek',
  aekpm: '@cheezmil/aek-prompt-manager',
  aeksm: '@cheezmil/aek-skill-manager',
}

/** The tucked-away component rows (wizard section 3). Required ones first
 *  is NOT the order — the display order follows the probe row order the
 *  user knows (prompt / websearch / skill). */
const WIZARD_COMPONENTS = [
  { key: 'aekpm', labelKey: 'about.shellInstall.prompt', field: 'aekpm', pkg: REQUIRED_PACKAGES.aekpm, required: true },
  { key: 'aekws', labelKey: 'about.shellInstall.websearch', field: 'aekws', pkg: '@cheezmil/aek-websearch', required: false },
  { key: 'aeksm', labelKey: 'about.shellInstall.skill', field: 'aeksm', pkg: REQUIRED_PACKAGES.aeksm, required: true },
] as const

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const { t, tf, locale, setLocale } = useI18n()
  const { available, status, result, pending, install } = useShellInstall()
  const [, setSetupSeen] = usePref(PREF_KEYS.shellSetupSeen, false, parseBool)
  const nodeMissing = status?.node === undefined
  const baseInstalling = pending && result === undefined
  const baseFailed = result !== undefined && !result.ok && !pending
  const baseOk =
    (status !== undefined && REQUIRED_FIELDS.every(field => status[field] !== undefined)) ||
    (result?.ok === true && !pending)
  /** The optional component is still absent — the wizard lingers so the
   *  user can work the tucked-away list one by one. */
  const optionalMissing = status !== undefined && status.aekws === undefined

  // The tucked-away component list (section 3): collapsed by default, one
  // click expands it.
  const [compOpen, setCompOpen] = useState(false)
  /** Optional-component selections (required components are never picked). */
  const [compSelected, setCompSelected] = useState<Record<string, boolean>>({})

  // First probe lands: default every missing OPTIONAL row to checked.
  useEffect(() => {
    if (status === undefined || Object.keys(compSelected).length > 0) return
    const next: Record<string, boolean> = {}
    for (const row of WIZARD_COMPONENTS) {
      if (!row.required && status[row.field] === undefined) next[row.key] = true
    }
    setCompSelected(next)
  }, [status, compSelected])

  // A failed install opens the list so the log + skill path stay visible.
  useEffect(() => {
    if (result !== undefined && !result.ok) setCompOpen(true)
  }, [result])

  // Ruling: everything AEK needs to run installs itself — one-shot
  // auto-install of whatever REQUIRED component the probes report missing
  // (Node present).
  const autoStarted = useRef(false)

  useEffect(() => {
    if (autoStarted.current || status === undefined || status.node === undefined) return
    const missing = REQUIRED_FIELDS.filter(field => status[field] === undefined)
    if (missing.length === 0) return
    autoStarted.current = true
    void install(missing.map(field => REQUIRED_PACKAGES[field]))
  }, [status, install])

  // When everything required is ready AND nothing optional is missing the
  // wizard continues ON ITS OWN — no button click. It lingers for the
  // manual entry when Node.js is missing, an install failed, or the
  // optional component is still absent (the user works the list).
  const [autoGone, setAutoGone] = useState(false)
  useEffect(() => {
    const readyNow = baseOk && !nodeMissing && !baseFailed && !optionalMissing && !autoGone
    if (!readyNow) return
    const timer = setTimeout(() => {
      setAutoGone(true)
      continueToConsole()
    }, result?.ok === true && autoStarted.current ? 1200 : 800)
    return () => {
      clearTimeout(timer)
    }
  }, [baseOk, nodeMissing, baseFailed, optionalMissing, autoGone, result])

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

  const continueToConsole = (): void => {
    setSetupSeen(true)
    onDone()
  }

  // The install set behind 安装所选 = every missing REQUIRED component
  // (always) plus the missing optional ones the user ticked.
  const installPkgs = status !== undefined
    ? WIZARD_COMPONENTS
      .filter(row => status[row.field] === undefined)
      .filter(row => row.required || compSelected[row.key])
      .map(row => row.pkg)
    : []
  const optionalMissingCount = status !== undefined
    ? WIZARD_COMPONENTS.filter(row => !row.required && status[row.field] === undefined).length
    : 0

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
                <StatusRow label={t('about.shellInstall.pkgMgr')} value={status.pnpm} />
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
                      <StatusRow label={t('about.shellInstall.prompt')} value={status.aekpm} />
                      <StatusRow label={t('about.shellInstall.skill')} value={status.aeksm} />
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
                    </>
                  )}
              </section>

              {/* The tucked-away component list: collapsed by default, one
                  click expands it, then the user works the rows one by
                  one. */}
              <section className={css.section}>
                <button
                  type="button"
                  className={css.listToggle}
                  aria-expanded={compOpen}
                  aria-label={t('setup.listToggle')}
                  onClick={() => {
                    setCompOpen(value => !value)
                  }}
                >
                  <Icon name="chevronDown" size={14} className={compOpen ? css.chevOpen : css.chev} />
                  <span className={css.sectionNum}>3</span>
                  <span className={css.sectionTitle}>{t('setup.section.components')}</span>
                  <span className={css.summaryChip}>
                    {optionalMissingCount === 0
                      ? tf('setup.listAllInstalled', { total: WIZARD_COMPONENTS.length })
                      : tf('setup.listSummary', { total: WIZARD_COMPONENTS.length, n: optionalMissingCount })}
                  </span>
                </button>

                {compOpen
                  ? (
                    <div className={css.sectionBody}>
                      {WIZARD_COMPONENTS.map((row) => {
                        const value = status[row.field]
                        const installed = value !== undefined
                        return (
                          <div key={row.key} className={css.row}>
                            {installed
                              ? <Icon name="check" size={16} className={css.iconCheck} />
                              : row.required
                                ? (
                                  <span className={css.lockSlot} title={t('setup.requiredNote')}>
                                    <Icon name="lock" size={16} />
                                  </span>
                                )
                                : (
                                  <input
                                    type="checkbox"
                                    className={css.check}
                                    checked={compSelected[row.key]}
                                    onChange={(event) => {
                                      setCompSelected(prev => ({ ...prev, [row.key]: event.target.checked }))
                                    }}
                                    aria-label={t(row.labelKey)}
                                  />
                                )}
                            <span className={css.rowLabel}>{t(row.labelKey)}</span>
                            {installed
                              ? <span className={css.rowValue} title={value}>{shortVersion(value)}</span>
                              : row.required
                                ? <span className={css.chipRequired}>{t('setup.required')}</span>
                                : <span className={css.chipMissing}>{t('about.shellInstall.missing')}</span>}
                          </div>
                        )
                      })}
                      <div className={css.actions}>
                        <button
                          type="button"
                          className={css.actionBtn}
                          disabled={pending || optionalMissingCount === 0}
                          onClick={() => {
                            const next: Record<string, boolean> = {}
                            for (const row of WIZARD_COMPONENTS) {
                              if (!row.required && status[row.field] === undefined) next[row.key] = true
                            }
                            setCompSelected(next)
                          }}
                        >
                          {t('about.shellInstall.selectAll')}
                        </button>
                        <button
                          type="button"
                          className={css.actionBtn}
                          disabled={pending || installPkgs.length === 0}
                          onClick={() => {
                            void install(installPkgs)
                          }}
                        >
                          {pending ? t('about.shellInstall.pending') : t('about.shellInstall.installSelected')}
                        </button>
                      </div>
                      {result !== undefined
                        ? (
                          <>
                            <p className={`${css.noticeLine} ${result.ok ? css.noticeSuccess : css.noticeError}`} role="status">
                              <Icon name={result.ok ? 'check' : 'alert'} size={14} />
                              <span>{tf(result.ok ? 'about.shellInstall.done' : 'about.shellInstall.failed', { tool: result.tool })}</span>
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
                            {!result.ok
                              ? (
                                <>
                                  <p className={css.hintLine}>{t('setup.agentHelp')}</p>
                                  {status.skillPath !== undefined
                                    ? (
                                      <div className={css.skillPathRow}>
                                        <Icon name="book" size={14} />
                                        <span className={css.skillPathLabel}>{t('setup.skillPathLabel')}</span>
                                        <span className={css.skillPath}>{status.skillPath}</span>
                                        <CopyButton value={status.skillPath} size={14} label={t('runtime.copyPath')} />
                                      </div>
                                    )
                                    : null}
                                </>
                              )
                              : null}
                          </>
                        )
                        : null}
                    </div>
                  )
                  : null}
              </section>

              {baseOk && !optionalMissing && !autoGone
                ? (
                  <p className={css.readyLineFinal} role="status">
                    <Icon name="check" size={14} />
                    {t('setup.allReady')}
                  </p>
                )
                : null}

              {baseFailed || nodeMissing || optionalMissing
                ? (
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
                )
                : null}
            </>
          )}
      </div>
    </div>
  )
}
