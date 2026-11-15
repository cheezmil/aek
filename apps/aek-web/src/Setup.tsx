/**
 * X5b: the first-run setup wizard (`/setup`) + the top-right "components
 * missing" floating notice.
 *
 * The wizard is the ONLY install surface (user ruling 2026-11-16: the X5
 * About-panel card was the wrong carrier). It reuses the shell's preload
 * bridge (`window.aekShell`) and the shared install rows; outside the shell
 * it degrades to a placeholder so a plain browser never shows a dead page.
 *
 * Second-round ruling (04:5x): the component list ships COLLAPSED (one
 * summary line + expand), installed rows show a green check ICON (never a
 * checkbox, never an emoji), version cells show the short version only
 * (the full probe string stays in the tooltip), the 全选/安装 actions are
 * always visible, and section 3 references the AEK system skill (aek-usage)
 * by ABSOLUTE PATH instead of inlining a big prompt block.
 *
 * The notice is a persistent (until dismissed this load) corner reminder:
 * one line + one action, no focus steal (toast research: Kombai / NN/G),
 * click jumps straight to the wizard.
 */
import { useEffect, useState } from 'react'
import { CopyButton } from './ui-kit.tsx'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { PREF_KEYS, usePref } from './preferences.tsx'
import { missingPackages, COMPONENT_ROWS, useShellInstall, RUNTIME_ROWS, type ShellInstallStatus } from './useShellInstall.ts'
import css from './Setup.module.css'

const parseBool = (raw: unknown): boolean | undefined =>
  typeof raw === 'boolean' ? raw : undefined

/**
 * The short version shown at a row's right edge: the probe string
 * `@cheezmil/coraek/1.2.0 darwin-arm64 node-v24.22.2` becomes `v1.2.0`;
 * `v24.22.2` / `12.16.1` / `0.1.3` keep a uniform `v` prefix. The FULL
 * string stays in the row's tooltip — no CSS clipping of it (first-round
 * complaint: the ellipsized version column was unreadable).
 */
function shortVersion(value: string): string {
  const first = value.trim().split(/\s+/)[0] ?? value
  const seg = first.includes('/') ? (first.split('/').pop() ?? first) : first
  return /^v/i.test(seg) ? seg : `v${seg}`
}

/** The value shown at a row's right edge: the probe result for its status
 *  field, or the fallback field's result (pnpm → npm) when the primary one
 *  has none. */
function rowValue(status: ShellInstallStatus, row: (typeof RUNTIME_ROWS)[number]): string | undefined {
  const primary = status[row.field]
  if (primary !== undefined) return primary
  return row.fallback !== undefined ? status[row.fallback] : undefined
}

/** One status row: label left, value right. Missing installable rows get the
 *  custom checkbox; installed rows get the green check icon. */
function WizardRow({
  row, missing, selected, onSelect, value,
}: {
  row: (typeof COMPONENT_ROWS)[number]
  missing: boolean
  selected: boolean
  onSelect?: (checked: boolean) => void
  value: string | undefined
}) {
  const { t } = useI18n()
  return (
    <div className={css.row}>
      {missing
        ? (
          <input
            type="checkbox"
            className={css.check}
            checked={selected}
            onChange={event => onSelect?.(event.target.checked)}
            aria-label={t(row.labelKey)}
          />
        )
        : <Icon name="check" size={16} className={css.iconCheck} />}
      <span className={css.rowLabel}>{t(row.labelKey)}</span>
      {value !== undefined
        ? (
          <span className={css.rowValue} title={value}>
            {shortVersion(value)}
          </span>
        )
        : <span className={css.chipMissing}>{t('about.shellInstall.missing')}</span>}
    </div>
  )
}

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const { t, tf, locale, setLocale } = useI18n()
  const { available, status, result, pending, install } = useShellInstall()
  const [, setSetupSeen] = usePref(PREF_KEYS.shellSetupSeen, false, parseBool)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  // Second-round ruling: the component list ships collapsed.
  const [listOpen, setListOpen] = useState(false)

  // First probe lands: default every missing, installable row to checked.
  useEffect(() => {
    if (status === undefined || Object.keys(selected).length > 0) return
    const next: Record<string, boolean> = {}
    for (const row of COMPONENT_ROWS) {
      if (status[row.field] === undefined) next[row.key] = true
    }
    setSelected(next)
  }, [status, selected])

  // Not inside the desktop shell: the bridge (and its probes) do not exist.
  if (!available) {
    return (
      <div className={css.placeholder}>
        <div className={css.placeholderCard}>
          <p className={css.placeholderTitle}>{t('setup.title')}</p>
          <p className={css.placeholderBody}>{t('setup.noShell')}</p>
        </div>
      </div>
    )
  }

  const missing = missingPackages(status)
  const selectedPkgs = missing.filter((pkg) => {
    const row = COMPONENT_ROWS.find(r => r.pkg === pkg)
    return row !== undefined && selected[row.key]
  })
  // Section 3: one short line + the AEK system skill's absolute path (the
  // detailed procedure lives in the skill, not in the UI).
  const promptText = status !== undefined && status.skillPath !== undefined
    ? tf('setup.agentCopy', { path: status.skillPath })
    : t('setup.agentCopyNoPath')

  const selectAllMissing = (): void => {
    if (status === undefined) return
    const next: Record<string, boolean> = {}
    for (const row of COMPONENT_ROWS) {
      if (status[row.field] === undefined) next[row.key] = true
    }
    setSelected(next)
    // Select-all reveals the (now default) selection.
    setListOpen(true)
  }

  const continueToConsole = (): void => {
    setSetupSeen(true)
    onDone()
  }

  return (
    <div className={css.wizard}>
      <div className={css.wizardBody}>
        {/* Second-round ruling: no h1 — the subtitle line only. The wizard is a
            chrome-free page, so it carries its own language toggle (same
            preference as the console footer). */}
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
                {RUNTIME_ROWS.map(row => (
                  <WizardRow
                    key={row.key}
                    row={row}
                    missing={status[row.field] === undefined}
                    selected={false}
                    value={rowValue(status, row)}
                  />
                ))}
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
                <button
                  type="button"
                  className={css.listToggle}
                  aria-expanded={listOpen}
                  onClick={() => {
                    setListOpen(open => !open)
                  }}
                >
                  <span className={css.sectionNum}>2</span>
                  <span className={css.sectionTitle}>{t('setup.section.components')}</span>
                  <span className={css.summaryChip}>
                    {missing.length === 0
                      ? tf('setup.listAllInstalled', { total: COMPONENT_ROWS.length })
                      : tf('setup.listSummary', { total: COMPONENT_ROWS.length, n: missing.length })}
                  </span>
                  <Icon name="chevronDown" size={14} className={listOpen ? css.chevOpen : css.chev} />
                </button>
                {listOpen
                  ? COMPONENT_ROWS.map(row => (
                    <WizardRow
                      key={row.key}
                      row={row}
                      missing={status[row.field] === undefined}
                      selected={selected[row.key]}
                      onSelect={(checked) => {
                        setSelected(prev => ({ ...prev, [row.key]: checked }))
                      }}
                      value={status[row.field] ?? undefined}
                    />
                  ))
                  : null}
                {/* Always visible (first-round complaint: 全选 was hidden when
                    nothing was missing). */}
                <div className={css.actions}>
                  <button
                    type="button"
                    className={css.actionBtn}
                    disabled={pending || missing.length === 0}
                    onClick={selectAllMissing}
                  >
                    {t('about.shellInstall.selectAll')}
                  </button>
                  <button
                    type="button"
                    className={css.actionBtn}
                    disabled={pending || selectedPkgs.length === 0}
                    onClick={() => {
                      void install(selectedPkgs)
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
                        ? <pre className={css.output}>{result.output}</pre>
                        : null}
                    </>
                  )
                  : null}
              </section>

              <section className={css.section}>
                <div className={css.sectionHead}>
                  <span className={css.sectionNum}>3</span>
                  <span className={css.sectionTitle}>{t('setup.section.agent')}</span>
                </div>
                <p className={css.agentLine}>{t('setup.agentLine')}</p>
                <div className={css.promptBlock}>
                  <div className={css.promptHead}>
                    <span className={css.rowLabel}>{t('about.shellInstall.agentTitle')}</span>
                    <CopyButton value={promptText} size={14} label={t('common.copy')} />
                  </div>
                  {status.skillPath !== undefined
                    ? <pre className={css.pathRow} title={status.skillPath}>{status.skillPath}</pre>
                    : null}
                </div>
              </section>
            </>
          )}

        {status !== undefined && missing.length === 0
          ? (
            <p className={css.readyLine} role="status">
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
      </div>
    </div>
  )
}

/**
 * Top-right corner notice: visible inside the shell while at least one
 * installable component is missing, hidden on the wizard route itself, and
 * dismissible for this page load. Never takes focus (screen-reader-polite
 * `role="status"` region, per the toast research).
 */
export function SetupNotice() {
  const { t, tf } = useI18n()
  const { available, status } = useShellInstall()
  const [dismissed, setDismissed] = useState(false)

  const missing = missingPackages(status)
  if (!available || dismissed || missing.length === 0) return null

  const openSetup = (): void => {
    window.history.pushState(null, '', '/setup')
    // The AekHome route switch watches popstate; a plain pushState needs the
    // manual event so the wizard renders without a full reload.
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className={css.floatNotice} role="status">
      <span className={css.floatNoticeIcon}>
        <Icon name="alert" size={16} />
      </span>
      <span className={css.floatNoticeText}>{tf('setup.notice', { n: missing.length })}</span>
      <button type="button" className={css.actionBtn} onClick={openSetup}>
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
