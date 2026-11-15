/**
 * X5b third round (2026-11-16 05:3x): the console-side component install
 * panel. The wizard auto-installs only the base environment; the OPTIONAL
 * AEK components (aekpm / aekws / aeksm) are freely picked here.
 *
 * Rows reuse the shared install row model (`useShellInstall`) and the
 * shell bridge (`aekShell.installSelected`, allow-listed packages). The
 * failure path = bounded output + a copy button: the user hands the log
 * to their agent ("let your agent solve it") — no assumptions about the
 * machine, no inlined prompt text.
 */
import { useEffect, useState } from 'react'
import { CopyButton } from './ui-kit.tsx'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { useShellInstall } from './useShellInstall.ts'
import css from './Setup.module.css'

/** The optional components (the wizard owns the base environment). */
const OPTIONAL_COMPONENTS = [
  { key: 'aekpm', labelKey: 'about.shellInstall.prompt', field: 'aekpm', pkg: '@cheezmil/aek-prompt-manager' },
  { key: 'aekws', labelKey: 'about.shellInstall.websearch', field: 'aekws', pkg: '@cheezmil/aek-websearch' },
  { key: 'aeksm', labelKey: 'about.shellInstall.skill', field: 'aeksm', pkg: '@cheezmil/aek-skill-manager' },
] as const

/** `@cheezmil/coraek/1.2.0 darwin-arm64 …` → `v1.2.0` (full string stays
 *  in the tooltip). */
function shortVersion(value: string): string {
  const first = value.trim().split(/\s+/)[0] ?? value
  const seg = first.includes('/') ? (first.split('/').pop() ?? first) : first
  return /^v/i.test(seg) ? seg : `v${seg}`
}

export function ComponentsPanel() {
  const { t, tf, locale, setLocale } = useI18n()
  const { available, status, result, pending, install } = useShellInstall()
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  // First probe lands: default every missing, installable row to checked.
  useEffect(() => {
    if (status === undefined || Object.keys(selected).length > 0) return
    const next: Record<string, boolean> = {}
    for (const row of OPTIONAL_COMPONENTS) {
      if (status[row.field] === undefined) next[row.key] = true
    }
    setSelected(next)
  }, [status, selected])

  if (!available) {
    return (
      <div className={css.placeholder}>
        <div className={css.placeholderCard}>
          <p className={css.placeholderBody}>{t('setup.noShell')}</p>
        </div>
      </div>
    )
  }

  const missingCount = OPTIONAL_COMPONENTS.filter(row => status !== undefined && status[row.field] === undefined).length
  const missingPkgs = OPTIONAL_COMPONENTS
    .filter(row => status !== undefined && status[row.field] === undefined)
    .filter(row => selected[row.key])
    .map(row => row.pkg)

  return (
    <div className={css.wizard}>
      <div className={css.wizardBody}>
        <header className={css.wizardHeader}>
          <div>
            <h1 className={css.componentsTitle}>{t('panel.components')}</h1>
            <p className={css.wizardSubtitle}>{t('panel.components.hint')}</p>
          </div>
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
              <div className={css.readyLine} role="status">{t('about.loading')}</div>
            </div>
          )
          : (
            <>
              <section className={css.section}>
                {OPTIONAL_COMPONENTS.map(row => (
                  <div key={row.key} className={css.row}>
                    {status[row.field] === undefined
                      ? (
                        <input
                          type="checkbox"
                          className={css.check}
                          checked={selected[row.key]}
                          onChange={(event) => {
                            setSelected(prev => ({ ...prev, [row.key]: event.target.checked }))
                          }}
                          aria-label={t(row.labelKey)}
                        />
                      )
                      : <Icon name="check" size={16} className={css.iconCheck} />}
                    <span className={css.rowLabel}>{t(row.labelKey)}</span>
                    {(() => {
                      const value = status[row.field]
                      return value !== undefined
                        ? <span className={css.rowValue} title={value}>{shortVersion(value)}</span>
                        : <span className={css.chipMissing}>{t('about.shellInstall.missing')}</span>
                    })()}
                  </div>
                ))}
                <div className={css.actions}>
                  <button
                    type="button"
                    className={css.actionBtn}
                    disabled={pending || missingCount === 0}
                    onClick={() => {
                      const next: Record<string, boolean> = {}
                      for (const row of OPTIONAL_COMPONENTS) {
                        if (status[row.field] === undefined) next[row.key] = true
                      }
                      setSelected(next)
                    }}
                  >
                    {t('about.shellInstall.selectAll')}
                  </button>
                  <button
                    type="button"
                    className={css.actionBtn}
                    disabled={pending || missingPkgs.length === 0}
                    onClick={() => {
                      void install(missingPkgs)
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
                        ? <p className={css.hintLine}>{t('setup.agentHelp')}</p>
                        : null}
                    </>
                  )
                  : null}
              </section>
            </>
          )}
      </div>
    </div>
  )
}
