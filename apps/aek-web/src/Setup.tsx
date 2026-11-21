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
import { SKILL_ICON } from './icon-registry.ts'
import { useI18n } from './i18n.tsx'
import { PREF_KEYS, usePref } from './preferences.tsx'
import { useShellInstall } from './useShellInstall.ts'
import { cn } from '@/lib/utils'

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
    <div className="flex min-h-11 items-center gap-3 py-1.5">
      <Icon name={value !== undefined ? 'check' : 'alert'} size={16} className={value !== undefined ? 'ml-px w-4.5 shrink-0 text-success' : 'ml-px w-4.5 shrink-0 text-danger'} />
      <span className="flex-1 min-w-0 text-aek-135 text-text">{label}</span>
      {value !== undefined
        ? <span className="font-mono text-aek-115 whitespace-nowrap text-text-secondary" title={value}>{shortVersion(value)}</span>
        : <span className="rounded-full border border-danger-border bg-danger-soft px-2.5 py-0.5 text-aek-115 font-semibold text-danger">{'\u00A0'}</span>}
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
      <div className="grid aek-app-shell place-items-center bg-background">
        <div className="max-w-105 rounded-aek-card border border-border bg-surface px-8 py-7 text-center">
          <p className="text-aek-13 text-text-secondary">{t('setup.noShell')}</p>
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
    <div className="flex aek-app-shell justify-center bg-background p-12 px-6 pb-16">
      <div className="w-full max-w-140">
        <header className="mb-5 flex items-start justify-between gap-3">
          <p className="text-aek-135 leading-aek-155 text-text-secondary">{t('setup.subtitle')}</p>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1.25 text-xs font-semibold text-text-secondary transition-colors duration-120 ease-aek whitespace-nowrap hover:border-input hover:text-text focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1"
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
            <div className="mb-3.5 rounded-aek-card border border-border bg-surface px-5 py-4.5 shadow-aek-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent-border bg-accent-soft text-aek-115 font-bold text-accent-ink">1</span>
                <span className="text-sm font-semibold text-text">{t('setup.section.runtime')}</span>
              </div>
              <div className="flex items-center gap-2 py-1.5 text-aek-13 text-success" role="status">{t('about.loading')}</div>
            </div>
          )
          : (
            <>
              <section className="mb-3.5 rounded-aek-card border border-border bg-surface px-5 py-4.5 shadow-aek-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent-border bg-accent-soft text-aek-115 font-bold text-accent-ink">1</span>
                  <span className="text-sm font-semibold text-text">{t('setup.section.runtime')}</span>
                </div>
                <StatusRow label={t('about.shellInstall.node')} value={status.node} />
                <StatusRow label={t('about.shellInstall.pkgMgr')} value={status.pnpm} />
                <div className="flex items-center gap-2 pb-0.5 pt-1">
                  <Icon name={status.backendUp ? 'check' : 'alert'} size={14} className={status.backendUp ? 'inline-flex items-center gap-1.5 text-aek-125 text-success' : 'inline-flex items-center gap-1.5 text-aek-125 text-danger'} />
                  <span className={status.backendUp ? 'inline-flex items-center gap-1.5 text-aek-125 text-success' : 'inline-flex items-center gap-1.5 text-aek-125 text-danger'}>
                    {status.backendUp
                      ? t('about.shellInstall.backendUp')
                      : t('about.shellInstall.backendDown')}
                  </span>
                </div>
              </section>

              <section className="mb-3.5 rounded-aek-card border border-border bg-surface px-5 py-4.5 shadow-aek-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent-border bg-accent-soft text-aek-115 font-bold text-accent-ink">2</span>
                  <span className="text-sm font-semibold text-text">{t('setup.section.base')}</span>
                </div>
                {nodeMissing
                  ? (
                    <p className="mt-2.5 flex items-center gap-2 text-aek-13 leading-normal text-text-secondary" role="alert">
                      <Icon name="alert" size={14} className="ml-px w-4.5 shrink-0 text-danger" />
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
                          <p className="mt-2.5 flex items-center gap-2 text-aek-13 leading-normal text-text-secondary" role="status">
                            <Icon name="refresh" size={14} className="animate-spin text-primary" />
                            {t('setup.autoInstalling')}
                          </p>
                        )
                        : null}
                      {baseOk && !baseInstalling
                        ? (
                          <p className="flex items-center gap-2 py-1.5 text-aek-13 text-success" role="status">
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
              <section className="mb-3.5 rounded-aek-card border border-border bg-surface px-5 py-4.5 shadow-aek-sm">
                <button
                  type="button"
                  className="group flex w-full cursor-pointer items-center gap-2 border-0 bg-none pt-0.5 pb-2.5 text-left focus-visible:rounded-aek-toggle focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  aria-expanded={compOpen}
                  aria-label={t('setup.listToggle')}
                  onClick={() => {
                    setCompOpen(value => !value)
                  }}
                >
                  <Icon name="chevronDown" size={14} className={compOpen ? 'rotate-180 text-text-muted transition-transform duration-140 ease-aek' : 'text-text-muted transition-transform duration-140 ease-aek'} />
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent-border bg-accent-soft text-aek-115 font-bold text-accent-ink">3</span>
                  <span className="text-sm font-semibold text-text group-hover:text-text">{t('setup.section.components')}</span>
                  <span className="ml-auto whitespace-nowrap rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-aek-115 font-semibold text-text-secondary">
                    {optionalMissingCount === 0
                      ? tf('setup.listAllInstalled', { total: WIZARD_COMPONENTS.length })
                      : tf('setup.listSummary', { total: WIZARD_COMPONENTS.length, n: optionalMissingCount })}
                  </span>
                </button>

                {compOpen
                  ? (
                    <div className="mt-0.5">
                      {WIZARD_COMPONENTS.map((row) => {
                        const value = status[row.field]
                        const installed = value !== undefined
                        return (
                          <div key={row.key} className="flex min-h-11 items-center gap-3 py-1.5">
                            {installed
                              ? <Icon name="check" size={16} className="ml-px w-4.5 shrink-0 text-success" />
                              : row.required
                                ? (
                                  <span className="ml-px grid w-4.5 shrink-0 place-items-center text-text-muted" title={t('setup.requiredNote')}>
                                    <Icon name="lock" size={16} />
                                  </span>
                                )
                                : (
                                  <input
                                    type="checkbox"
                                    className="appearance-none relative m-0 size-4.5 flex-none rounded-aek-check border border-aek bg-surface cursor-pointer transition-colors duration-120 ease-aek hover:border-text-muted checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 checked:after:absolute checked:after:content-[''] checked:after:left-aek-45 checked:after:top-aek-15 checked:after:h-2.25 checked:after:w-1.25 checked:after:border-b-2 checked:after:border-r-2 checked:after:border-t-0 checked:after:border-l-0 checked:after:border-inverse checked:after:rotate-45"
                                    checked={compSelected[row.key]}
                                    onChange={(event) => {
                                      setCompSelected(prev => ({ ...prev, [row.key]: event.target.checked }))
                                    }}
                                    aria-label={t(row.labelKey)}
                                  />
                                )}
                            <span className="flex-1 min-w-0 text-aek-135 text-text">{t(row.labelKey)}</span>
                            {installed
                              ? <span className="font-mono text-aek-115 whitespace-nowrap text-text-secondary" title={value}>{shortVersion(value)}</span>
                              : row.required
                                ? <span className="whitespace-nowrap rounded-full border border-accent-border bg-accent-soft px-2.5 py-0.5 text-aek-115 font-semibold text-accent-ink">{t('setup.required')}</span>
                                : <span className="rounded-full border border-danger-border bg-danger-soft px-2.5 py-0.5 text-aek-115 font-semibold text-danger">{t('about.shellInstall.missing')}</span>}
                          </div>
                        )
                      })}
                      <div className="flex items-center gap-2.5 pt-2.5 pb-1">
                        <button
                          type="button"
                          className="whitespace-nowrap rounded-aek-btn border border-accent-border bg-accent-soft px-3 py-1.25 text-aek-125 font-semibold text-accent-ink cursor-pointer transition-colors duration-120 ease-aek hover:enabled:bg-accent-border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 disabled:cursor-default disabled:opacity-50"
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
                          className="whitespace-nowrap rounded-aek-btn border border-accent-border bg-accent-soft px-3 py-1.25 text-aek-125 font-semibold text-accent-ink cursor-pointer transition-colors duration-120 ease-aek hover:enabled:bg-accent-border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 disabled:cursor-default disabled:opacity-50"
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
                            <p className={cn('mt-2.5 flex items-center gap-2 rounded-sm px-2.5 py-2 text-aek-125', result.ok ? 'border border-success-border bg-success-soft text-success' : 'border border-danger-border bg-danger-soft text-danger')} role="status">
                              <Icon name={result.ok ? 'check' : 'alert'} size={14} />
                              <span>{tf(result.ok ? 'about.shellInstall.done' : 'about.shellInstall.failed', { tool: result.tool })}</span>
                            </p>
                            {result.output !== ''
                              ? (
                                <div className="mt-2.5 overflow-hidden rounded-aek-outline border border-border bg-surface">
                                  <div className="flex justify-end px-2.5 pt-1.5">
                                    <CopyButton value={result.output} size={14} label={t('setup.copyLog')} />
                                  </div>
                                  <pre className="mt-2 max-h-40 overflow-auto rounded-sm border border-border bg-surface-subtle px-3 py-2.5 font-mono text-aek-115 leading-normal whitespace-pre-wrap break-words">{result.output}</pre>
                                </div>
                              )
                              : null}
                            {!result.ok
                              ? (
                                <>
                                  <p className="mt-2.5 flex items-center gap-2 text-aek-13 leading-normal text-text-secondary">{t('setup.agentHelp')}</p>
                                  {status.skillPath !== undefined
                                    ? (
                                      <div className="mt-2 flex items-center gap-2 rounded-sm border border-border bg-surface-subtle px-2.5 py-2">
                                        <Icon name={SKILL_ICON} size={14} className="flex-none text-text-muted" />
                                        <span className="shrink-0 text-xs font-semibold text-text-secondary">{t('setup.skillPathLabel')}</span>
                                        <span className="min-w-0 flex-1 font-mono text-aek-115 text-text-secondary whitespace-normal wrap-anywhere break-words">{status.skillPath}</span>
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
                  <p className="mt-3.5 flex items-center gap-2 text-aek-125 font-semibold text-success" role="status">
                    <Icon name="check" size={14} />
                    {t('setup.allReady')}
                  </p>
                )
                : null}

              {baseFailed || nodeMissing || optionalMissing
                ? (
                  <footer className="mt-4.5 flex justify-end">
                    <button
                      type="button"
                      className="whitespace-nowrap rounded-aek-btn border border-accent-border bg-accent-soft px-3 py-1.25 text-aek-125 font-semibold text-accent-ink cursor-pointer transition-colors duration-120 ease-aek hover:enabled:bg-accent-border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 disabled:cursor-default disabled:opacity-50"
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
