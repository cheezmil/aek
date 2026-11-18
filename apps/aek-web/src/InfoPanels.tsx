/**
 * Settings / 插件管理 / About surfaces (2026-11-09 fourth round).
 *
 * - Settings is SCHEMA-DRIVEN: `settings-schema.ts` is the single source of
 *   truth for keys, ranges, defaults, labels and CSS variables. The
 *   "Skill 绝对路径覆盖" field was REMOVED on user request — not every knob
 *   deserves to exist.
 * - Permissions is no longer a standalone panel; it is a settings group now.
 * - Access settings (new): LAN-only by default (loopback + RFC1918 A/B/C),
 *   custom IP / CIDR / host allowlist, and a public mode that FORCES a
 *   username + password before it can be enabled.
 * - 插件管理 uses ONE switch per plugin for enable / disable (a check + cross
 *   pair always left one button as a no-op) plus a restart icon button. The
 *   host's `locked` flag drives a locked switch; B2 has no structural plugin
 *   (the console UI is the static aek-web app), so every switch is toggleable
 *   today.
 * - About marks `apps/web`, `apps/cli`, `apps/aek-desktop` as ENTRY POINTS.
 * - Every collection is an unordered `<ul>/<li>` (user rule). Refresh
 *   states use `Spinner`; long-running ACTIONS carry the X2 operation
 *   pipelines (step chips + a percentage bar, `useOps` / `OpsPipeline`) —
 *   the old "spinners only, no progress bars" note is superseded.
 *
 * X2 round changes:
 * - The 入口 section moved INTO the 插件与程序 card (next to the roster it
 *   launches); the base-environment list is gone (the roster's base bucket
 *   shows those packages now).
 * - The lock icon travels with the title row (never between the switch and
 *   the buttons); a copy icon sits right after every feature title.
 * - The per-plugin runtime line shows the occupied memory and the runtime
 *   PICKER (every existing container + search) instead of a bare "move to
 *   an isolated process" button.
 *
 * @module @cheezmil/aek-web/src/InfoPanels
 */
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import { BUCKET_ICONS, ENTRY_ICONS, ENTRIES_SECTION_ICON, APP_BUNDLE_ICON } from './icon-registry.ts'
import { useI18n } from './i18n.tsx'
import { PREF_KEYS, useAccessDraft, useDraftSettings, usePref, useSettings } from './preferences.tsx'
import type { PrefValue } from './preferences.tsx'
import {
  allSettingFields,
  coerce,
  ICONS_SETTINGS_SCHEMA,
  PROMPTS_SETTINGS_SCHEMA,
  SETTINGS_SCHEMA,
  SKILLS_SETTINGS_SCHEMA,
  WEBSEARCH_SETTINGS_SCHEMA,
} from './settings-schema.ts'
import type { SettingField } from './settings-schema.ts'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/* FF round: the old info-panel module classes, now literal Tailwind
   utilities (1:1 from Home.module.css; off-scale values live in index.css
   @theme tokens + .aek-* component helpers). */
const ACCESS_ACTIONS = 'flex items-center gap-3 mt-4'
const ACCESS_TEXTAREA = 'block box-border w-full min-h-22 p-2 px-2.5 border border-input rounded-xs bg-card text-text font-inherit text-xs leading-170 resize-y focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1'
const COUNT_CHIP = 'inline-flex items-center p-0.5 px-2.25 rounded-full text-xs font-semibold tabular-nums border border-border bg-surface-subtle text-text-secondary'
const DIRTY_BACKDROP = 'fixed inset-0 z-15'
const DIRTY_DOT = 'size-2 rounded-full bg-danger'
const DIRTY_LIST = 'list-none m-0 p-0 max-h-80 overflow-auto'
const DIRTY_POPOVER = 'aek-popover'
const DIRTY_POPOVER_HEAD = 'flex items-center justify-between gap-2 mb-1.5'
const DIRTY_POPOVER_TITLE = 'text-xs-plus font-semibold text-text'
const DIRTY_ROW = 'flex items-center gap-1.5 p-1.25 px-0.5 rounded-xs hover:bg-surface-hover'
const DIRTY_ROW_ACTION = 'inline-flex items-center justify-center size-6 p-0 border border-border rounded-xs bg-card text-text-muted cursor-pointer hover:border-accent-border hover:text-accent-ink'
const DIRTY_ROW_LABEL = 'grow shrink min-w-0 text-left border-0 bg-none p-0 font-inherit text-xs-plus text-text cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis hover:underline hover:text-accent-ink'
const DIRTY_ROW_VALUE = 'text-2xs text-text-muted font-mono max-w-22.5 whitespace-nowrap overflow-hidden text-ellipsis'
const DIRTY_SAVE_ALL = 'relative inline-flex items-center justify-center size-8 border border-accent-border rounded-lg bg-accent-soft text-accent-ink cursor-pointer'
const DIRTY_SAVE_ALL_DOT = 'absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger border-2 border-card'
const EMPTY_STATE = 'flex items-center justify-center gap-2 min-h-30 text-text-muted text-xs-plus'
const ENTRY_LIST = 'flex flex-col gap-1.5 list-none m-0 p-0'
const ERROR_BANNER = 'flex items-center gap-2 mb-4 p-3 px-4 border border-danger-border rounded-sm bg-danger-soft text-danger text-xs-plus'
const FEATURE_COPY = 'w-auto min-w-5.5 h-4.5 p-0 px-0.75 border-0 rounded-2xs bg-transparent text-text-muted hover:not-disabled:text-accent-ink hover:not-disabled:bg-accent-soft hover:not-disabled:border-transparent'
const FEATURE_DESC = 'text-xs leading-aek-155 text-text-muted'
const FEATURE_ICON = 'shrink-0 grow-0 text-primary mt-0.5'
const FEATURE_TEXT = 'text-xs leading-aek-155 text-text-muted flex items-center flex-wrap gap-x-1.5 gap-y-1'
const FEATURE_TITLE = 'text-xs-plus font-semibold flex items-center gap-1.5'
const FEATURE_TITLE_LOCK = 'text-text-muted shrink-0 grow-0'
const FEATURE_TITLE_NAME = 'overflow-hidden text-ellipsis whitespace-nowrap'
const HERO_NOTE = 'flex gap-2.5 mt-4 p-4 border border-accent-border rounded-lg bg-accent-soft text-accent-ink aek-hero-note'
const HINT = 'mt-4 text-text-secondary text-xs leading-160'
const INFO_LABEL = 'shrink-0 grow-0 text-text-muted'
const INFO_LIST = 'flex flex-col list-none m-0 p-0'
const INFO_ROW = 'flex items-baseline justify-between gap-4 py-3 border-b border-border text-xs-plus last:border-b-0'
const INFO_VALUE = 'text-right text-text font-medium break-all'
/* EE-fix (2026-11-17): mb-2 keeps the row off the 入口 card list below it
   (the list's own gap-2 only separates the CARDS from each other). */
const MEM_CHECK_ROW = 'mb-2 flex items-center gap-2'
const NOTICE_ERROR = 'border-danger-border bg-danger-soft text-danger'
const NOTICE_LINE = 'flex items-center gap-2 mb-3 p-1.5 px-2.5 border border-transparent rounded-lg text-text-secondary text-xs'
const NOTICE_NEUTRAL = 'bg-surface-subtle'
const NOTICE_SUCCESS = 'border-success-border bg-success-soft text-success'
const NUMBER_BOX = 'w-19 text-xs tabular-nums p-1.25 px-2 border border-input rounded-xs bg-card text-text'
const OPS_BAR = 'h-1 rounded-full bg-surface-subtle overflow-hidden'
const OPS_BAR_FILL = 'block h-full rounded-full bg-primary transition-[width] duration-300 ease-aek'
const OPS_BADGE_DOT = 'absolute -top-0.75 -right-1.5 size-1.75 rounded-full bg-danger border border-aek border-card'
const OPS_BADGE_ICON = 'relative inline-flex items-center'
const OPS_BADGE_ROW = 'relative'
const OPS_NOTE = 'text-2xs text-text-muted overflow-wrap-anywhere'
const OPS_NOTE_FAILED = 'text-danger'
const OPS_PENDING_HOST = 'flex items-center justify-between gap-2 text-2xs text-text-muted'
const OPS_POP_HEAD = 'flex items-center justify-between gap-2 mb-2'
const OPS_POP_LIST = 'list-none m-0 p-0 flex flex-col gap-2 max-h-80 overflow-auto'
const OPS_POP_TITLE = 'inline-flex items-center gap-1.5 text-xs-plus font-semibold text-text'
const OPS_POPOVER = 'aek-popover'
const OPS_ROW = 'flex flex-col gap-1.5 p-2 px-2.5 border border-border rounded-lg bg-card'
/* 2026-11-17 field report: the restart button sat FLUSH against the switch.
   Root cause: the div was `display:block`, so the `gap` / `justify-items` /
   `grid-template-columns` on `.aek-grid-plugin-actions` were all no-ops and
   the two controls rendered as touching inline-blocks. The `grid`
   (display:grid) class — the same pair the sibling `.aek-grid-endpoint-row`
   uses — is what actually makes the 38px/32px columns + gap-4 (16px)
   spacing apply. */
const PLUGIN_ACTIONS_GRID = 'aek-grid-plugin-actions grid items-center justify-items-center gap-4 shrink-0 grow-0'
const RANGE_INPUT = 'aek-range-input'
const SETTING_TOGGLE_LABEL = 'text-text font-semibold'
const SETTING_TOGGLE_ROW = 'flex items-center gap-3 min-h-6 cursor-pointer'
const SETTING_VALUE = 'shrink-0 grow-0 p-0.5 px-2 rounded-full bg-accent-soft text-accent-ink text-2xs font-semibold tabular-nums'
const STACK_CHIP = 'shrink-0 grow-0 p-0.5 px-2 border border-border rounded-full bg-surface-subtle text-text-muted text-2xs font-semibold'

/** IV round: the A1/A2 distribution chip — single letter; the full meaning shows
    on hover (the user pointed at the "A1 · 可公开发布" badge and wanted just "A1"
    with the hint on the pointer). `pill` = the About-page stack list's rounded
    chip styling instead of the outline Badge. */
function ClassChip({ distribution, pill = false, t }: { distribution: string; pill?: boolean; t: (key: string) => string }): ReactNode {
  if (distribution === '') return null
  const isA2 = distribution === 'A2'
  const label = t(isA2 ? 'about.class.a2' : 'about.class.a1')
  const tip = t(isA2 ? 'about.class.a2.tip' : 'about.class.a1.tip')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {pill
          ? <span className={STACK_CHIP}>{label}</span>
          : <Badge variant="outline">{label}</Badge>}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
/* 2026-11-17: no `grow` — a stretching text span was stealing the row's slack,
   so the right-anchored memory chips (ml-auto) of the rows above it never reached the
   right edge and floated at different x per card. Compact left-aligned text; the
   right-side track belongs to the ml-auto chips. */
const STACK_TEXT = 'shrink min-w-0 max-w-aek-stack overflow-hidden text-ellipsis whitespace-nowrap text-text-muted text-2xs'
const STICKY_DIVIDER = 'h-px bg-border mb-5'
const STICKY_PANEL_SEARCH = 'aek-sticky-panel-search'
const TEXT_INPUT = 'w-full p-1.25 px-2 border border-input rounded-xs bg-card text-text text-xs'
const NOTE_ICON = 'shrink-0 grow-0 text-primary'
// III round: card body 24 (p-6) → 16 (p-4). The spacing ladder is
// strictly descending (page 32 > section 24 > card body 16 > row 12 >
// rows 8 > micro 4) — borrowed Windmill 4px-grid + Vercel card-16
// references 2026-11-17; the card was reading "floaty" at 24.
const CARD_BODY = 'p-8'
import { CapabilityTags, CopyButton, PanelCard, PanelSearch, Spinner, ToggleSwitch } from './ui-kit.tsx'
import { useConsoleFacts } from './useConsoleFacts.ts'
import type { AppEntry, PluginBucket, PluginEntry } from './useConsoleFacts.ts'
import { useRuntimes } from './useRuntimes.ts'
import { useOps } from './useOps.ts'
import type { OpEntry } from './useOps.ts'
import { fetchRuntime } from './useRuntimeMode.ts'
import { postInstance } from './useInstances.ts'
import { RuntimesBlock, fmtBytes } from './RuntimesPanel.tsx'

/** Panels handled here. */
export type InfoPanelId = 'plugins' | 'settings' | 'websearchSettings' | 'about'
  | 'skillsSettings' | 'promptsSettings' | 'iconsSettings'

/** Host routes. */
const PLUGIN_ACTION_API = '/api/aek/plugins/action'
/** Setting that decides whether disabling a plugin needs a second click. */
const CONFIRM_DISABLE_KEY = 'aek-home.confirmPluginDisable'
const PERMISSIONS_OPEN_API = '/api/aek/permissions/open'
/** Q round: the settings backup / undo pair (aek-websearch host routes). */
const PREFERENCES_BACKUP_API = '/api/aek/preferences/backup'
const PREFERENCES_RESTORE_API = '/api/aek/preferences/restore'

/**
 * Display-only package name (C3): strip the npm scope.
 * @param name - an npm package name from the host inventory.
 * @returns the human-facing name.
 */
export function displayName(name: string): string {
  const stripped = name.replace(/^@[^/]+\//u, '')
  return stripped === name ? name : stripped
}

/** Props for {@link InfoPanels}. */
export interface InfoPanelsProps {
  /** Which informational surface to render. */
  panel: InfoPanelId
  /**
   * Q round: how many refresh requests the sidebar has recorded for THIS
   * surface since it was last opened. `> 0` consumes one re-read.
   */
  refreshSignal: number
}

/**
 * Render ONE schema field's control. The value is always coerced to the
 * declared range before it reaches an input.
 * @param props - field and change callback.
 * @returns the row content.
 */
function SettingControl({ field, value, onChange }: {
  field: SettingField
  value: PrefValue
  onChange: (next: PrefValue) => void
}): ReactNode {
  const { t } = useI18n()
  const label = t(field.labelKey)
  const hint = field.hintKey === undefined ? null : <p className={HINT}>{t(field.hintKey)}</p>
  if (field.kind === 'toggle') {
    return (
      <>
        <div className={SETTING_TOGGLE_ROW}>
          <span className={SETTING_TOGGLE_LABEL}>{label}</span>
          <ToggleSwitch checked={value === true} onChange={onChange} label={label} />
        </div>
        {hint}
      </>
    )
  }
  if (field.kind === 'range') {
    const numeric = typeof value === 'number' ? value : Number(value)
    const unit = field.unit ?? ''
    const min = field.min ?? 0
    const max = field.max ?? 100
    // Track fill: the slider itself is styled from tokens, and the filled
    // portion needs the real percentage, which CSS cannot compute.
    const fill = max === min ? 0 : Math.min(100, Math.max(0, ((numeric - min) / (max - min)) * 100))
    return (
      <>
        <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
          <span className={SETTING_TOGGLE_LABEL}>{label}</span>
          <span className={SETTING_VALUE}>{`${String(numeric)}${unit}`}</span>
        </div>
        <div className="flex items-center gap-3">

          <input
            type="range"
            className={RANGE_INPUT}
            style={{ '--aek-range-fill': `${String(fill)}%` } as CSSProperties}
            min={min}
            max={max}
            step={field.step ?? 1}
            value={numeric}
            aria-label={label}
            onChange={(event) =>{  onChange(Number(event.target.value)) }}
          />
          <input
            type="number"
            className={NUMBER_BOX}
            min={min}
            max={max}
            step={field.step ?? 1}
            value={numeric}
            aria-label={`${label} (${unit})`}
            onChange={(event) =>{  onChange(coerce(field, event.target.value)) }}
          />
        </div>
        {hint}
      </>
    )
  }
  if (field.kind === 'select') {
    return (
      <>
        <div className="mb-2 flex min-h-5 items-center justify-between gap-3"><span className={SETTING_TOGGLE_LABEL}>{label}</span></div>
        <select
          className="w-full rounded-xs border border-input bg-surface p-1.25 px-2 text-xs text-text"
          value={String(value)}
          aria-label={label}
          onChange={(event) =>{  onChange(event.target.value) }}
        >
          {field.options?.map(option => (
            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
          ))}
        </select>
        {hint}
      </>
    )
  }
  return (
    <>
      <div className="mb-2 flex min-h-5 items-center justify-between gap-3"><span className={SETTING_TOGGLE_LABEL}>{label}</span></div>
      <input
        type="text"
        className={TEXT_INPUT}
        value={String(value)}
        aria-label={label}
        onChange={(event) =>{  onChange(event.target.value) }}
      />
      {hint}
    </>
  )
}

/**
 * @returns the access-control section of the settings page.
 * J round: the form STAGES edits into the provider-level draft (no host
 * write, no standalone save button); the commit happens through the
 * changed-items box (per-item save or save-all). `accessCommitError`
 * surfaces the client-side credential check / host failure here.
 */
function AccessSection() {
  const { t } = useI18n()
  const { view: _view, form, dirty, accessStage, accessCommit, accessCommitError, autoSave } = useAccessDraft()
  const { publicMode, username, password, allowlist, hasPassword } = form
  const [notice] = useState<string | undefined>(undefined)

  // J round: auto-save mode still commits access edits — but ONLY on a
  // deliberate boundary (the public-mode switch flips instantly; the text
  // fields commit on blur). Keystroke-level POSTs of credentials would be
  // nonsense, so typing never auto-commits even in auto-save mode.
  const onPublicMode = (next: boolean): void => {
    accessStage({ publicMode: next })
    if (autoSave) void accessCommit()
  }
  const onTextBlur = (): void => {
    if (autoSave) void accessCommit()
  }

  const missingCredentials = publicMode && (username.trim().length === 0 || (password.length === 0 && !hasPassword))

  return (
    <section className="mb-8 last:mb-0" data-access-section data-nav-anchor="access">
      {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
      <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t('settings.group.access')}</h3>
      <p className={HINT}>{t('access.defaultHint')}</p>
      <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
        <li className="p-2 rounded-sm transition duration-120 ease hover:bg-surface-hover" data-setting-key="aek-home.access">
          <div className={SETTING_TOGGLE_ROW}>
            <span className={SETTING_TOGGLE_LABEL}>{t('access.publicMode')}</span>
            <ToggleSwitch checked={publicMode} onChange={onPublicMode} label={t('access.publicMode')} />
          </div>
          <p className={HINT}>{t('access.publicModeHint')}</p>
        </li>
        <li className="p-2 rounded-sm transition duration-120 ease hover:bg-surface-hover">
          <div className="mb-2 flex min-h-5 items-center justify-between gap-3"><span className={SETTING_TOGGLE_LABEL}>{t('access.allowlist')}</span></div>
          <textarea
            className={ACCESS_TEXTAREA}
            rows={4}
            value={allowlist}
            placeholder={t('access.allowlistPlaceholder')}
            aria-label={t('access.allowlist')}
            onChange={(event) =>{  accessStage({ allowlist: event.target.value }) }}
            onBlur={onTextBlur}
          />
          <p className={HINT}>{t('access.allowlistHint')}</p>
        </li>
        {publicMode
          ? (
            <>
              <li className="p-2 rounded-sm transition duration-120 ease hover:bg-surface-hover">
                <div className="mb-2 flex min-h-5 items-center justify-between gap-3"><span className={SETTING_TOGGLE_LABEL}>{t('access.username')}</span></div>
                <input
                  type="text"
                  className={TEXT_INPUT}
                  value={username}
                  autoComplete="off"
                  aria-label={t('access.username')}
                  onChange={(event) =>{  accessStage({ username: event.target.value }) }}
                  onBlur={onTextBlur}
                />
              </li>
              <li className="p-2 rounded-sm transition duration-120 ease hover:bg-surface-hover">
                <div className="mb-2 flex min-h-5 items-center justify-between gap-3"><span className={SETTING_TOGGLE_LABEL}>{t('access.password')}</span></div>
                <input
                  type="password"
                  className={TEXT_INPUT}
                  value={password}
                  autoComplete="new-password"
                  placeholder={hasPassword ? t('access.passwordKeep') : ''}
                  aria-label={t('access.password')}
                  onChange={(event) =>{  accessStage({ password: event.target.value }) }}
                  onBlur={onTextBlur}
                />
              </li>
            </>
          )
          : null}
      </ul>
      {missingCredentials ? <div className={ERROR_BANNER}><Icon name="alert" size={16} /><span>{t('access.needCredentials')}</span></div> : null}
      {accessCommitError !== undefined
        ? (
          <div className={ERROR_BANNER}>
            <Icon name="alert" size={16} />
            <span>{accessCommitError === 'needCredentials' ? t('access.needCredentials') : accessCommitError}</span>
          </div>
        )
        : null}
      {notice !== undefined ? <p className={HINT}>{notice}</p> : null}
      {dirty ? <p className={HINT}>{t('access.stagedHint')}</p> : null}
    </section>
  )
}

/** @returns the permissions section, now part of Settings. */
function PermissionsSection() {
  const { t } = useI18n()
  const facts = useConsoleFacts()
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const isMac = facts.facts?.platform === 'darwin'
  const noteKey = facts.facts?.permissions.noteKey ?? 'permissions.note.other'
  const bundles = facts.facts?.permissions.bundles ?? []

  /** Open the OS privacy pane (explicit, user-initiated). */
  const openPane = (): void => {
    setPending(true)
    setNotice(undefined)
    void fetch(PERMISSIONS_OPEN_API, { method: 'POST' })
      .then(async response => await response.json() as { ok?: boolean; reason?: string })
      .then((data) =>{  setNotice(data.ok === true ? t('permissions.opened') : (data.reason ?? 'unknown')) })
      .catch((cause: unknown) =>{  setNotice(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() =>{  setPending(false) })
  }

  return (
    <section className="mb-8 last:mb-0" data-nav-anchor="permissions">
      {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
      <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t('settings.group.permissions')}</h3>
      <ul className={INFO_LIST}>
        <li className={INFO_ROW}>
          <span className={INFO_LABEL}>{t('permissions.platform')}</span>
          <span className={INFO_VALUE}>
            {facts.facts === undefined ? t('common.loading') : `${facts.facts.platform} / ${facts.facts.arch}`}
          </span>
        </li>
      </ul>
      <div className={HERO_NOTE}>
        <span className={NOTE_ICON}><Icon name="shield" size={16} /></span>
        <p>{t(noteKey)}</p>
      </div>
      {/* FF-NOTE: .heroNote + .permList { margin-top: var(--aek-space-4) } → mt-4 (the list is preceded by the heroNote div here). */}
      <ul className="m-0 mt-4 flex flex-col gap-2 list-none p-0">
        {bundles.map(bundle => (
          <li key={bundle.id} className="flex items-center gap-2.5 rounded-sm border border-border bg-surface-subtle p-2 px-3 text-xs">
            <span className={FEATURE_ICON}><Icon name={APP_BUNDLE_ICON} size={16} /></span>
            <span className="min-w-27 font-bold text-text">{bundle.name}.app</span>
            <code className="flex-auto min-w-0 truncate text-xs text-text-secondary">{bundle.id}</code>
            <CopyButton value={bundle.id} label={t('common.copy')} />
          </li>
        ))}
      </ul>
      <div className={ACCESS_ACTIONS}>

        <button type="button" className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-primary bg-primary px-4 font-semibold shadow-aek-primary text-inverse transition duration-150 ease-aek hover:bg-accent-hover hover:border-accent-hover active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || !isMac} onClick={openPane}>
          {pending ? <Spinner /> : null}
          {t('permissions.open')}
        </button>
      </div>
      {notice !== undefined ? <p className={HINT}>{notice}</p> : null}
    </section>
  )
}

/** The undo banner's state machine for the "restore defaults" flow. */
type RestoreState =
  | { phase: 'idle' }
  | { phase: 'busy' }
  | { phase: 'backedUp' }
  | { phase: 'restored' }
  | { phase: 'noBackup' }
  | { phase: 'backupFailed' }
  | { phase: 'restoreFailed' }

/**
 * I round: the changed-items box. Opens from the sticky toolbar's count chip
 * (which now shows the DIRTY count, not the field count). Each row is a
 * staged (unsaved) setting: the label jumps to that row (scroll + flash),
 * "undo" drops the staged value, "save" commits just that key to the host.
 * The header's save icon (with the red dot while anything is dirty) commits
 * EVERYTHING: the access form first, then the schema draft.
 *
 * J round: the box carries the ACCESS form as a special row (staged
 * credentials never auto-commit), and the default close behaviour flipped —
 * it STAYS open on outside clicks / ESC; only the chip toggles it, unless
 * the "close on outside click" switch is on.
 */
const FIELD_BY_KEY = new Map(allSettingFields().map(field => [field.key, field]))

function SettingsDirtyPopover({ open, onClose, withAccess }: { open: boolean; onClose: () => void; withAccess: boolean }) {
  const { t } = useI18n()
  const { dirtyKeys, values: draftValues, draftSave, draftUndo } = useDraftSettings()
  const access = useAccessDraft()
  // J round: the close-on-outside switch is a UI behaviour, so it reads the
  // PERSISTED value (immediate write), like auto-save.
  const outsideClose = useOutsideClosePref()

  // I round: jump to a staged row. The row carries `data-setting-key`;
  // `settingRowFlash` adds a brief accent outline that clears itself on
  // animation end (no timers — the D-round occlusion lesson).
  //
  // The scroll is INSTANT (`behavior: 'instant'`): both `scrollIntoView`
  // with `behavior: 'smooth'` and rAF tweens silently no-op in this shell
  // whenever the compositor stalls (GPU-process crash / occluded window),
  // and an instant jump + the flash row is reliable in every state.
  const locate = (key: string): void => {
    const row = document.querySelector<HTMLElement>(`[data-setting-key="${key}"]`)
    const flashClass = 'animate-setting-flash'
    // `flashClass` is a real key of Home.module.css, so only the row lookup
    // can miss.
    if (row === null) return
    row.scrollIntoView({ block: 'center', behavior: 'instant' })
    row.classList.remove(flashClass)
    // Restart the animation even when the row was flashed seconds ago.
    void row.offsetWidth
    row.classList.add(flashClass)
  }

  useEffect(() => {
    if (!open || ! outsideClose) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () =>{  window.removeEventListener('keydown', onKey) }
  }, [open, outsideClose, onClose])

  if (!open) return null

  const total = dirtyKeys.length + (withAccess && access.dirty ? 1 : 0)

  const saveAll = async (): Promise<void> => {
    // J round: access FIRST (it validates the credentials; the schema
    // commit below still runs afterwards, so a broken access form stays
    // dirty and visible while the schema keys land).
    if (withAccess && access.dirty) {
      await access.accessCommit()
    }
    await draftSave('all')
  }

  return (
    <>
      {outsideClose
        ? <div className={DIRTY_BACKDROP} role="presentation" onClick={onClose} />
        : null}
      <div className={DIRTY_POPOVER} role="dialog" aria-label={t('settings.dirty.title')}>
        <div className={DIRTY_POPOVER_HEAD}>
          <span className={DIRTY_POPOVER_TITLE}>{t('settings.dirty.title')}</span>
          <button
            type="button"
            className={DIRTY_SAVE_ALL}
            title={t('settings.dirty.saveAll')}
            aria-label={`${t('settings.dirty.saveAll')} — ${t('settings.dirty.dot')}`}
            onClick={() => void saveAll()}
          >
            <Icon name="save" size={18} />
            {total > 0
              ? <span className={DIRTY_SAVE_ALL_DOT} aria-label={t('settings.dirty.dot')} />
              : null}
          </button>
        </div>
        {total === 0
          ? <p className={HINT}>{t('settings.dirty.empty')}</p>
          : (
            <ul className={DIRTY_LIST}>
              {withAccess && access.dirty
                ? (
                  <li className={DIRTY_ROW}>
                    <button type="button" className={DIRTY_ROW_LABEL} title={t('settings.dirty.locate')} onClick={() =>{  locate('aek-home.access') }}>
                      {t('settings.access.item')}
                    </button>
                    <span className={DIRTY_ROW_VALUE}>—</span>
                    <button
                      type="button"
                      className={DIRTY_ROW_ACTION}
                      title={t('settings.dirty.undo')}
                      aria-label={t('settings.dirty.undo')}
                      onClick={() =>{  access.accessUndo() }}
                    >
                      <Icon name="restore" size={14} />
                    </button>
                    <button
                      type="button"
                      className={DIRTY_ROW_ACTION}
                      title={t('settings.dirty.saveOne')}
                      aria-label={t('settings.dirty.saveOne')}
                      onClick={() => void access.accessCommit()}
                    >
                      <Icon name="check" size={14} />
                    </button>
                  </li>
                )
                : null}
              {dirtyKeys.map((key) => {
                const field = FIELD_BY_KEY.get(key)
                const label = field !== undefined ? t(field.labelKey) : key
                return (
                  <li key={key} className={DIRTY_ROW}>
                    <button type="button" className={DIRTY_ROW_LABEL} title={t('settings.dirty.locate')} onClick={() =>{  locate(key) }}>
                      {label}
                    </button>
                    <span className={DIRTY_ROW_VALUE}>{String(draftValues[key] ?? '')}</span>
                    <button
                      type="button"
                      className={DIRTY_ROW_ACTION}
                      title={t('settings.dirty.undo')}
                      aria-label={t('settings.dirty.undo')}
                      onClick={() =>{  draftUndo(key) }}
                    >
                      <Icon name="restore" size={14} />
                    </button>
                    <button
                      type="button"
                      className={DIRTY_ROW_ACTION}
                      title={t('settings.dirty.saveOne')}
                      aria-label={t('settings.dirty.saveOne')}
                      onClick={() => void draftSave(key)}
                    >
                      <Icon name="check" size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
      </div>
    </>
  )
}

/**
 * J round: the persisted "close the changed-items box on outside click /
 * ESC" switch. It reads the PERSISTED map (a UI behaviour must not itself
 * sit in the draft layer).
 */
function useOutsideClosePref(): boolean {
  const { prefs } = useSettings()
  return prefs['aek-home.dirtyPopoverOutsideClose'] === true
}

/**
 * The 基础设置 (basic settings) page, Q round. The giant catch-all Settings
 * page was split: this page keeps the host-wide groups (sidebar / navigation /
 * general / access / permissions) plus the "restore defaults" flow; plugin
 * specific settings live on the plugin's own page ({@link WebSearchSettingsPanel}).
 */
function SettingsPanel({ refreshSignal }: { refreshSignal: number }) {
  const { t } = useI18n()
  const { prefs, set, setMany, reload, adopt } = useSettings()
  // I round: settings-page edits stage in the DRAFT layer; the host POST only
  // happens at a commit point (per-item save, save-all, or auto-save on).
  const { values: draftValues, draftSet, dirtyKeys } = useDraftSettings()
  // J round: the access form stages into the provider-level draft too.
  const access = useAccessDraft()
  const totalDirty = dirtyKeys.length + (access.dirty ? 1 : 0)
  const [query, setQuery] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [restore, setRestore] = useState<RestoreState>({ phase: 'idle' })
  const needle = query.trim().toLowerCase()
  const visible = SETTINGS_SCHEMA.filter((field) => {
    if (needle.length === 0) return true
    return [t(field.labelKey), field.key, field.group].join(' ').toLowerCase().includes(needle)
  })
  // E round: the console has TWO side rails and the basic-settings page must
  // say which row drives which. The first rail is the main navigation; the
  // second is the per-plugin route column (PluginSubNav) that appears on
  // family pages. The second-rail rows are the plugin-rail width pair plus
  // the one-time usage hint — they are filed under a dedicated section
  // instead of the plain "sidebar" / "navigation" groups they came from.
  const SECOND_RAIL_KEYS = new Set(['aek-home.pluginRailWidth', 'aek-home.pluginRailCompactWidth', 'aek-home.railHint'])
  const secondRailFields = visible.filter(field => SECOND_RAIL_KEYS.has(field.key))
  const matches = (keys: readonly string[]): boolean => needle.length === 0 || keys.join(' ').toLowerCase().includes(needle)

  // Sidebar-row refresh (Q round): re-read the authoritative settings map.
  useEffect(() => {
    if (refreshSignal > 0) reload()
  }, [refreshSignal, reload])

  /**
   * The Q-round restore-defaults flow: (1) back up the current settings file
   * on the host, (2) only THEN write every schema default, (3) keep the undo
   * button live until the user undoes or manually edits a setting.
   */
  const restoreDefaults = async (): Promise<void> => {
    setRestore({ phase: 'busy' })
    try {
      const backup = await fetch(PREFERENCES_BACKUP_API, { method: 'POST' })
      if (!backup.ok) throw new Error(`HTTP ${String(backup.status)}`)
      setMany(Object.fromEntries(allSettingFields().map(field => [field.key, field.default])))
      setRestore({ phase: 'backedUp' })
    } catch {
      setRestore({ phase: 'backupFailed' })
    }
  }

  /** Put the backup snapshot back over the live file (undo). */
  const undoRestore = async (): Promise<void> => {
    setRestore({ phase: 'busy' })
    try {
      const response = await fetch(PREFERENCES_RESTORE_API, { method: 'POST' })
      if (!response.ok) {
        setRestore({ phase: response.status === 404 ? 'noBackup' : 'restoreFailed' })
        return
      }
      const data = await response.json() as Record<string, PrefValue>
      adopt(data)
      setRestore({ phase: 'restored' })
    } catch {
      setRestore({ phase: 'restoreFailed' })
    }
  }

  /** Any manual edit dismisses the undo banner (the backup is no longer the
      "previous state" the user is looking at). I round: edits stage in the
      draft layer (host commit is a separate, explicit act). */
  const setSafe = (key: string, next: PrefValue): void => {
    draftSet(key, next)
    setRestore(state => (state.phase === 'backedUp' ? { phase: 'idle' } : state))
  }

  /**
   * The auto-save switch and the outside-close switch are UI BEHAVIOURS:
   * they define how the commit flow works, so each commits at once (an
   * immediate host write) instead of staging like the rest, and reads the
   * persisted value, not the staged one.
   */
  const immediateKeys = new Set(['aek-home.autoSave', 'aek-home.dirtyPopoverOutsideClose'])

  const fieldRow = (field: SettingField): ReactNode => (
    <li key={field.key} className="p-2 rounded-sm transition duration-120 ease hover:bg-surface-hover" data-setting-key={field.key}>
      <SettingControl
        field={field}
        value={coerce(
          field,
          immediateKeys.has(field.key) ? (prefs[field.key] ?? field.default) : (draftValues[field.key] ?? field.default),
        )}
        onChange={(next) => {
          if (immediateKeys.has(field.key)) { set(field.key, next); setRestore(state => (state.phase === 'backedUp' ? { phase: 'idle' } : state)); return }
          setSafe(field.key, next)
        }}
      />
    </li>
  )
  const firstRailRows = visible.filter(field => field.group === 'sidebar' && !SECOND_RAIL_KEYS.has(field.key))
  const navigationRows = visible.filter(field => field.group === 'navigation' && !SECOND_RAIL_KEYS.has(field.key))
  const generalRows = visible.filter(field => field.group === 'general')
  // 2026-11-19: the MOTION group — AEK's own app-wide kill switch for front-end
  // motion (the OS "reduce motion" setting is deliberately ignored, see the
  // section hint). A real schema row, so it stages / commits through the same
  // draft system as every other setting.
  const motionRows = visible.filter(field => field.group === 'motion')
  // K round: the dedicated TEST section — a real schema row (so it flows
  // through the draft/commit system exactly like every setting) but wired
  // to NOTHING; it exists so the user (and agents) can poke the settings
  // machinery without touching real settings.
  const testRows = visible.filter(field => field.group === 'test')

  return (
    <PanelCard>
      <div className={CARD_BODY}>
        {/* G round: the settings toolbar is a control, not content — it stays
            pinned to the top of the viewport while the section list scrolls
            (the document is the scroll container; sticky + opaque surface +
            the F-round hairline below it). */}
        <div className={STICKY_PANEL_SEARCH}>
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder={t('settings.panelSearch')}
            badge={totalDirty > 0 ? <span className={DIRTY_DOT} aria-hidden="true" /> : undefined}
            badgeAria={t('settings.dirty.title')}
            onBadgeClick={() =>{  setPopoverOpen(open => !open) }}
            condense
            condenseHold={totalDirty > 0}
          />
          <SettingsDirtyPopover open={popoverOpen && totalDirty > 0} onClose={() =>{  setPopoverOpen(false) }} withAccess />
        </div>
        {/* L round: the divider is its OWN node in document flow — it stays
            put (and scrolls away) while the toolbar above pins; the
            floating box must not carry a bottom line. */}
        <div className={STICKY_DIVIDER} aria-hidden="true" />
        {/* R2 round: the 基础设置 rail's ANCHOR tabs position the page to
            these sections (`data-nav-anchor` + the Home scroll effect). */}
        {firstRailRows.length > 0
          ? (
            <section className="mb-8 last:mb-0" data-nav-anchor="sidebarFirst">
              {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
              <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t('settings.group.sidebarFirst')}</h3>
              <p className={HINT}>{t('settings.group.sidebarFirstHint')}</p>
              <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
                {firstRailRows.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {secondRailFields.length > 0
          ? (
            <section className="mb-8 last:mb-0" data-nav-anchor="sidebarSecond">
              {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
              <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t('settings.group.sidebarSecond')}</h3>
              <p className={HINT}>{t('settings.group.sidebarSecondHint')}</p>
              <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
                {secondRailFields.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {navigationRows.length > 0
          ? (
            <section className="mb-8 last:mb-0" data-nav-anchor="navigation">
              {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
              <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t('settings.group.navigation')}</h3>
              <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
                {navigationRows.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {generalRows.length > 0
          ? (
            <section className="mb-8 last:mb-0" data-nav-anchor="general">
              {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
              <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t('settings.group.general')}</h3>
              <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
                {generalRows.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {motionRows.length > 0
          ? (
            <section className="mb-8 last:mb-0" data-nav-anchor="motion">
              {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
              <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t('settings.group.motion')}</h3>
              <p className={HINT}>{t('settings.group.motionHint')}</p>
              <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
                {motionRows.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {testRows.length > 0
          ? (
            <section className="mb-8 last:mb-0">
              {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
              <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t('settings.group.test')}</h3>
              <p className={HINT}>{t('settings.group.testHint')}</p>
              <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
                {testRows.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {matches(['access', 'lan', 'ip', 'cidr', 'basic auth', t('settings.group.access')]) ? <AccessSection /> : null}
        {matches(['permission', 'tcc', 'accessibility', t('settings.group.permissions')]) ? <PermissionsSection /> : null}
        {matches(['default', t('settings.group.defaults'), t('settings.restoreDefaults')])
          ? (
            <section className="mb-8 last:mb-0" data-nav-anchor="defaults">
              {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
              <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t('settings.group.defaults')}</h3>
              <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
                <li className="p-2 rounded-sm transition duration-120 ease hover:bg-surface-hover">
                  <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
                    <span className={SETTING_TOGGLE_LABEL}>{t('settings.restoreDefaults')}</span>
                  </div>
                  <p className={HINT}>{t('settings.restoreDefaultsHint')}</p>
                  <div className={ACCESS_ACTIONS}>
                    <button
                      type="button"

                      className="inline-flex h-8.5 items-center justify-center gap-2 rounded-sm border border-input bg-surface px-3.5 text-xs-plus text-text-secondary hover:bg-surface-hover"
                      disabled={restore.phase === 'busy'}
                      onClick={() => { void restoreDefaults() }}
                    >
                      {restore.phase === 'busy' ? <Spinner /> : <Icon name="restore" size={14} />}
                      {t('settings.restoreDefaults')}
                    </button>
                    {restore.phase === 'backedUp'
                      ? (

                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-primary bg-primary px-4 font-semibold shadow-aek-primary text-inverse transition duration-150 ease-aek hover:bg-accent-hover hover:border-accent-hover active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => { void undoRestore() }}
                        >
                          {t('settings.undoRestore')}
                        </button>
                      )
                      : null}
                  </div>
                  {restore.phase === 'backedUp'
                    ? <p className={cn(NOTICE_LINE, NOTICE_NEUTRAL)}><Icon name="check" size={14} />{t('settings.backupDone')}</p>
                    : null}
                  {restore.phase === 'restored'
                    ? <p className={cn(NOTICE_LINE, NOTICE_NEUTRAL)}><Icon name="check" size={14} />{t('settings.restored')}</p>
                    : null}
                  {restore.phase === 'noBackup'
                    ? <p className={ERROR_BANNER}><Icon name="alert" size={16} /><span>{t('settings.noBackup')}</span></p>
                    : null}
                  {restore.phase === 'backupFailed'
                    ? <p className={ERROR_BANNER}><Icon name="alert" size={16} /><span>{t('settings.backupFailed')}</span></p>
                    : null}
                  {restore.phase === 'restoreFailed'
                    ? <p className={ERROR_BANNER}><Icon name="alert" size={16} /><span>{t('settings.restoreFailed')}</span></p>
                    : null}
                </li>
              </ul>
            </section>
          )
          : null}
        {visible.length === 0 && needle.length > 0
          ? <div className={EMPTY_STATE}>{t('common.noMatch')}</div>
          : null}
      </div>
    </PanelCard>
  )
}

/**
 * The plugin-owned settings page (Q round 14: "each plugin should have its
 * own settings page, not one giant Settings page"; R2 round: the rail
 * CONTRACT lifts this to EVERY webui plugin — the page always exists, and a
 * schema with no fields renders its honest empty state instead of a missing
 * page). Only the WEB SEARCH display filters stay on the search page itself.
 *
 * @param schema - the plugin's declarative setting rows (EMPTY = empty state).
 * @param titleKey - i18n key of the section heading (the plugin's name).
 */
function PluginSchemaSettingsPanel({ schema, titleKey, refreshSignal }: {
  schema: readonly SettingField[]
  titleKey: string
  refreshSignal: number
}) {
  const { t } = useI18n()
  const { reload } = useSettings()
  // I round: same draft layer as the base settings page (and the same
  // changed-items box, so edits made here show up on every settings surface).
  const { values: draftValues, draftSet, dirtyKeys } = useDraftSettings()
  const [query, setQuery] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const needle = query.trim().toLowerCase()
  const visible = schema.filter((field) => {
    if (needle.length === 0) return true
    return [t(field.labelKey), field.key, field.group].join(' ').toLowerCase().includes(needle)
  })

  useEffect(() => {
    if (refreshSignal > 0) reload()
  }, [refreshSignal, reload])

  return (
    <PanelCard>
      <div className={CARD_BODY}>
        {/* G round: same sticky + condense toolbar as the base settings page. */}
        <div className={STICKY_PANEL_SEARCH}>
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder={t('settings.panelSearch')}
            badge={dirtyKeys.length > 0 ? <span className={DIRTY_DOT} aria-hidden="true" /> : undefined}
            badgeAria={t('settings.dirty.title')}
            onBadgeClick={() =>{  setPopoverOpen(open => !open) }}
            condense
            condenseHold={dirtyKeys.length > 0}
          />
          <SettingsDirtyPopover open={popoverOpen && dirtyKeys.length > 0} onClose={() =>{  setPopoverOpen(false) }} withAccess={false} />
        </div>
        {/* L round: standalone divider (document flow, not part of the sticky box). */}
        <div className={STICKY_DIVIDER} aria-hidden="true" />
        {visible.length > 0
          ? (
            <section className="mb-8 last:mb-0">
              {/* FF-NOTE: .sectionTitle accent bar now exact via 0.25-step scale + rounded-3xs. */}
              <h3 className="relative mt-8 first:mt-0 mb-4 pl-3 text-base font-bold tracking-normal text-text before:content-[''] before:absolute before:left-0 before:top-0.75 before:w-1 before:h-4 before:rounded-3xs before:bg-primary">{t(titleKey)}</h3>
              <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
                {visible.map(field => (
                  <li key={field.key} className="p-2 rounded-sm transition duration-120 ease hover:bg-surface-hover" data-setting-key={field.key}>
                    <SettingControl
                      field={field}
                      value={coerce(field, draftValues[field.key] ?? field.default)}
                      onChange={(next) =>{  draftSet(field.key, next) }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )
          : (
            // R2 round: the rail contract — a plugin WITHOUT user-facing
            // settings still OWNS a settings page; the page is its honest
            // empty state (the user's "必须有其对应的设置页" ruling), never
            // a missing route.
            <div className={EMPTY_STATE}>{t('settings.pluginSettingsEmpty')}</div>
          )}
      </div>
    </PanelCard>
  )
}

/** The Web Search plugin's settings page (the ranking refresh interval + friends). */
function WebSearchSettingsPanel({ refreshSignal }: { refreshSignal: number }) {
  return <PluginSchemaSettingsPanel schema={WEBSEARCH_SETTINGS_SCHEMA} titleKey="settings.group.websearch" refreshSignal={refreshSignal} />
}

/** R2 round: the Skill Manager settings page (its one Config field, `home`). */
function SkillsSettingsPanel({ refreshSignal }: { refreshSignal: number }) {
  return <PluginSchemaSettingsPanel schema={SKILLS_SETTINGS_SCHEMA} titleKey="panel.skillsSettings" refreshSignal={refreshSignal} />
}

/** R2 round: the Prompt Manager settings page (EMPTY schema = empty state). */
function PromptsSettingsPanel({ refreshSignal }: { refreshSignal: number }) {
  return <PluginSchemaSettingsPanel schema={PROMPTS_SETTINGS_SCHEMA} titleKey="panel.promptsSettings" refreshSignal={refreshSignal} />
}

/** R2 round: the Icon Manager settings page (CLI-only plugin = empty state). */
function IconsSettingsPanel({ refreshSignal }: { refreshSignal: number }) {
  return <PluginSchemaSettingsPanel schema={ICONS_SETTINGS_SCHEMA} titleKey="panel.iconsSettings" refreshSignal={refreshSignal} />
}

/**
 * One plugin row action. Enable / disable is NOT in here: the user rejected
 * the check / cross pair (2026-11-09) because two buttons always meant one of
 * them was a no-op. A switch shows the state AND offers the single opposite
 * action, so only `restart` stays an icon button.
 */
interface PluginAction {
  id: 'restart'
  icon: 'refresh'
  labelKey: string
}

/** The remaining icon action(s). */
const PLUGIN_ACTIONS: readonly PluginAction[] = [
  { id: 'restart', icon: 'refresh', labelKey: 'plugins.action.restart' },
]

/**
 * The user's disk-layout bucket order (2026-11-15 T round): the swappable
 * coraek plugin set first, then the read-only roster facts.
 */
const BUCKET_ORDER: readonly PluginBucket[] = ['plugins', 'public', 'base', 'extensions']

/**
 * The bucket-group header key (a literal switch, so the i18n dead-key
 * scanner sees every key at each site).
 * @param bucket - the group's bucket.
 * @returns the header's i18n key.
 */
// Scanner-visible: the i18n dead-key gate only sees t()/tf() LITERAL
// arguments, so the bucket titles resolve through direct t() calls here.
function bucketTitleOf(bucket: PluginBucket, t: (key: string) => string): string {
  switch (bucket) {
    case 'public':
      return t('plugins.bucket.public')
    case 'base':
      return t('plugins.bucket.base')
    case 'extensions':
      return t('plugins.bucket.extensions')
    default:
      return t('plugins.bucket.plugins')
  }
}

/**
 * X2 item 17: the category icon — the stacked-layers icon is reserved for the
 * REAL coraek plugins (the `plugins` bucket); every other category gets its
 * own mark, so the row and the group header agree on what a category is.
 * BB round: the table now lives in `icon-registry.ts` (BUCKET_ICONS), the
 * single source of truth for "which thing uses which icon".
 * @param bucket - the source bucket.
 * @returns the icon name.
 */
function bucketIconOf(bucket: PluginBucket): IconName {
  return BUCKET_ICONS[bucket]
}

/**
 * The X2 runtime picker: the "move to a runtime" floating surface — EVERY
 * existing runtime container (the shared host + the isolated ones), each
 * with its live state, its member count and a search box over the names.
 * Replaces the old "移入独立进程" button (which could only open a NEW
 * runtime); the move TARGET is picked here.
 * @param rt - the live snapshot.
 * @param current - the runtime the plugin is in right now.
 * @param onPick - the picked runtime id.
 * @param busy - disables the list while a mutation is in flight.
 * @returns the picker body.
 */
function RuntimePicker({ rt, current, onPick, onCarveOut, busy }: {
  rt: NonNullable<ReturnType<typeof useRuntimes>['snapshot']>
  current: string
  onPick: (runtime: string) => void
  onCarveOut?: () => void | Promise<void>
  busy: string | undefined
}): ReactNode {
  const { t } = useI18n()
  const [needle, setNeedle] = useState('')
  const rows = [rt.host, ...rt.runtimes]
  const q = needle.trim().toLowerCase()
  const visible = q.length === 0
    ? rows
    : rows.filter(row => [row.id, row.label].join(' ').toLowerCase().includes(q))
  return (
    <>

      <div className="absolute left-0 top-full z-30 flex w-60 flex-col gap-2 rounded-md border border-input bg-surface p-2 shadow-lg" role="listbox" aria-label={t('plugins.runtime.picker')}>
        <input
          className="rounded-xs border border-border bg-surface-subtle p-0.75 px-1.5 text-xs text-text"
          value={needle}
          onChange={(event) => { setNeedle(event.target.value) }}
          placeholder={t('plugins.runtime.pickerSearch')}
          aria-label={t('plugins.runtime.pickerSearch')}
        />
        <ul className="m-0 flex max-h-45 flex-col gap-0.5 list-none overflow-y-auto p-0">
          {/* X4: the one-click "carve out" — a fresh auto-numbered dedicated
            container for THIS plugin (the in-host reading is shared, so the
            only way to see its OWN number is to give it its own process). */}
          {onCarveOut !== undefined
            ? (
              <li
                className={cn('flex items-center justify-between gap-2 rounded-xs p-1 px-2 text-xs', 'cursor-pointer text-text hover:bg-surface-hover', busy !== undefined ? 'pointer-events-none opacity-50' : undefined)}
                role="option"
                aria-selected={false}
                onClick={() => { if (busy === undefined) void onCarveOut() }}
              >
                <span className="inline-flex items-center gap-1.5 truncate font-semibold">
                  {t('plugins.runtime.carveOut')}
                </span>
                <Icon name="plus" size={13} />
              </li>
            )
            : null}
          {visible.length === 0
            ? <li className="p-1 px-2 text-xs text-text-muted">{t('common.noMatch')}</li>
            : visible.map((row) => {
              const here = row.id === current
              return (
                <li
                  key={row.id}
                  className={cn('flex items-center justify-between gap-2 rounded-sm p-1 px-2 text-xs', here ? 'cursor-default bg-accent-soft text-accent-ink hover:bg-accent-soft' : 'cursor-pointer text-text hover:bg-surface-hover')}
                  role="option"
                  aria-selected={here}
                  onClick={() => { if (!here) onPick(row.id) }}
                >
                  <span className="inline-flex items-center gap-1.5 truncate font-semibold">
                    {row.label}
                    <span className="font-normal text-2xs text-text-muted">
                      {row.plugins.length > 0 ? `${row.plugins.length}` : ''}
                      {row.state === 'running' ? t('runtimes.state.running') : t('runtimes.state.stopped')}
                    </span>
                  </span>
                  {here ? <Icon name="check" size={13} /> : <Icon name="chevronDown" size={13} />}
                </li>
              )
            })}
        </ul>
        {busy !== undefined ? <div className="flex items-center gap-1.5 text-2xs text-text-muted"><Spinner />{t('plugins.runtime.pickerBusy')}</div> : null}
      </div>
    </>
  )
}

/**
 * The per-plugin runtime line (X2): WHERE this package currently runs — the
 * live container row (the host or one of the isolated containers, several
 * plugins per container allowed) — the occupied memory reading, and the
 * runtime PICKER (every existing container + search). No native dialogs:
 * the picker and the host's error answers are the whole decision surface.
 * @param plugin - the roster row.
 * @param rt - the live runtime snapshot (or undefined while loading / older host).
 * @param term - the per-OS memory term, already translated.
 * @param onMove - move the package into the picked runtime.
 * @param busy - the in-flight runtime mutation key, when any.
 * @returns the line (or nothing when the host has no runtime route).
 */
function PluginRuntimeLine({ plugin, rt, term, onMove, onCarveOut, busy }: {
  plugin: PluginEntry
  rt: ReturnType<typeof useRuntimes>['snapshot']
  term: string
  onMove: (id: string, runtime: string) => void
  onCarveOut?: () => void | Promise<void>
  busy: string | undefined
}): ReactNode {
  const { t, tf } = useI18n()
  const [pickerOpen, setPickerOpen] = useState(false)
  if (rt === undefined) return null
  // X4: the chip carries the REAL whole-process reading of the process this
  // plugin lives in — never a borrowed or invented number. In-host plugins
  // share ONE V8 heap with the host (Node.js has no per-module memory
  // ledger), so their reading is the host process's measured RSS plus a
  // plain-language WHY on hover; a container plugin shows its container's
  // whole-process reading, saying so (and listing cohabitants) when shared.
  const mem = rt.pluginMemory[plugin.id]
  const runtimeId = mem.runtimeId ?? 'runtime0'
  const row = runtimeId === 'runtime0'
    ? rt.host
    : rt.runtimes.find(candidate => candidate.id === runtimeId)
  const isolatedRow = row !== undefined && row.kind === 'isolated' ? row : undefined
  const resolved = row ?? rt.host
  const inHost = isolatedRow === undefined
  const reading = mem.value ?? isolatedRow?.memory?.rss
  const sharedContainer = !inHost && isolatedRow.plugins.length > 1
  // X4: the one-click escape hatch only makes sense for in-host plugins
  // (a container plugin already has its own process).
  const carveOutable = inHost && onCarveOut !== undefined
  const moveTargets = [rt.host, ...rt.runtimes].filter(candidate => candidate.id !== runtimeId)
  const hostReading = rt.host.memory?.rss
  const chip = inHost
    ? (hostReading !== undefined
      ? `${t('plugins.runtime.memSharedHost')} · ${term} ${fmtBytes(hostReading)}`
      : t('plugins.runtime.memSharedHost'))
    : (sharedContainer
      ? `${t('plugins.runtime.memSharedContainer')} (${String(isolatedRow.plugins.length)})${reading !== undefined ? ` · ${term} ${fmtBytes(reading)}` : ''}`
      : `${t('plugins.runtime.memOwnContainer')}${reading !== undefined ? ` · ${term} ${fmtBytes(reading)}` : ''}`)
  const chipTitle = inHost
    ? tf('plugins.runtime.memHostTip', { n: String(Math.max(0, rt.host.plugins.length - 1)) })
    : sharedContainer
      ? tf('plugins.runtime.memContainerTip', { n: String(isolatedRow.plugins.length), names: isolatedRow.plugins.join(', ') })
      : undefined
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-2xs text-text-muted">
        <span
          className={cn(
            'justify-self-start rounded-full border border-border bg-surface py-0.25 px-2 text-2xs text-text-muted',
            resolved.state === 'running' ? 'text-success' : undefined,
          )}>
          runtime{String(resolved.number)}
        </span>
        <span className="text-2xs text-text-muted">
          {isolatedRow !== undefined
            ? tf('plugins.runtime.lineIsolated', { n: String(isolatedRow.number) })
            : t('plugins.runtime.lineHost')}
          {` · ${t(resolved.state === 'running' ? 'runtimes.state.running' : 'runtimes.state.stopped')}`}
        </span>
        {/* X4: the number is always a real measured reading; the hover carries
          the WHY (in-host sharing / container cohabitation) in plain words. */}
        <span className={cn('justify-self-start rounded-full border border-border bg-surface py-0.25 px-2 text-xs text-text-muted', 'ml-auto')} title={chipTitle}>
          {chip}
        </span>
        {(moveTargets.length > 0 || carveOutable)
          ? (
            <span className="relative inline-flex">

              {/* inline-flex + gap: label and chevron stay on ONE line (a
                  wrapping icon was the 2026-11-17 field report). */}
              <button
                type="button"
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-surface py-0.5 px-2 text-2xs text-text-secondary leading-140 cursor-pointer hover:border-primary hover:text-accent-ink disabled:cursor-default disabled:opacity-50"
                disabled={busy !== undefined}
                onClick={() => { setPickerOpen(open => !open) }}
                aria-expanded={pickerOpen}
              >
                {t('plugins.runtime.picker')}
                <Icon name="chevronDown" size={13} />
              </button>
              {pickerOpen
                ? (
                  <RuntimePicker
                    rt={rt}
                    current={runtimeId}
                    onPick={(target) => {
                      setPickerOpen(false)
                      onMove(plugin.id, target)
                    }}
                    onCarveOut={carveOutable
                      ? () => {
                        setPickerOpen(false)
                        void onCarveOut()
                      }
                      : undefined}
                    busy={busy}
                  />
                )
                : null}
            </span>
          )
          : null}
      </div>
    </>
  )
}

/**
 * Z round: the operation progress moved OUT of the card's inline block into
 * a floating box (悬浮窗) opened from the search row's red-dot badge (the
 * slot the "8" count chip used to sit in). Every row can be dismissed
 * one by one (剔除) or the whole list cleared (清空): the host's ledger
 * routes only delete the progress ROWS — an action already in flight keeps
 * running, the ledger is a view, not the queue.
 * @param open - the open flag (gated on the ledger being non-empty too).
 * @param onClose - close (outside-click backdrop / Escape).
 * @param ops - the ledger, newest first (undefined before the first read).
 * @param progressOf - the done-over-total fraction of one op.
 * @param onRemove - dismiss one row (rejects when the host write fails).
 * @param onClear - clear every row (rejects when the host write fails).
 * @param onRestartNow - close a host-restart op by restarting the backend.
 * @param onNotice - report an op's outcome.
 * @returns the floating box (or nothing when closed / empty).
 */
function OpsPopover({ open, onClose, ops, progressOf, onRemove, onClear, onRestartNow, onNotice }: {
  open: boolean
  onClose: () => void
  ops: import('./useOps.ts').OpEntry[] | undefined
  progressOf: (op: import('./useOps.ts').OpEntry) => number
  onRemove: (id: string) => Promise<void>
  onClear: () => Promise<void>
  onRestartNow: (op: import('./useOps.ts').OpEntry) => void
  onNotice: (message: string, tone: 'success' | 'error') => void
}): ReactNode {
  const { t } = useI18n()
  const opsStateTitle = (status: OpEntry['status']): string => (status === 'running' ? t('plugins.ops.state.running') : status === 'failed' ? t('plugins.ops.state.failed') : t('plugins.ops.state.done'))
  const outsideClose = useOutsideClosePref()
  const [busy, setBusy] = useState(false)

  // Same outside-close contract as the settings' dirty box: the 点外关闭
  // switch (persisted UI behaviour) governs the backdrop; Escape always.
  useEffect(() => {
    if (!open || !outsideClose) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () =>{  window.removeEventListener('keydown', onKey) }
  }, [open, outsideClose, onClose])

  if (!open || ops === undefined || ops.length === 0) return null
  // Live ops first, then the finished ones (the host trims the ledger to
  // 100 entries anyway; the box scrolls).
  const live = ops.filter(op => op.status === 'running')
  const settled = ops.filter(op => op.status !== 'running')
  const rows = [...live, ...settled]
  /** The step's tone class (a literal map, so the dead-class scanner stays happy). */
  const stepClassOf = (state: string): string => {
    switch (state) {
      case 'done':
        return 'border-success-border bg-success-soft text-success'
      case 'failed':
        return 'border-danger-border bg-danger-soft text-danger'
      case 'active':
        return 'border-accent-border bg-accent-soft text-accent-ink'
      default:
        return 'text-text-muted'
    }
  }
  const dismiss = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await onRemove(id)
    } catch (cause: unknown) {
      onNotice(cause instanceof Error ? cause.message : String(cause), 'error')
    } finally {
      setBusy(false)
    }
  }
  const clear = async (): Promise<void> => {
    setBusy(true)
    try {
      await onClear()
    } catch (cause: unknown) {
      onNotice(cause instanceof Error ? cause.message : String(cause), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {outsideClose
        ? <div className={DIRTY_BACKDROP} role="presentation" onClick={onClose} />
        : null}
      <div className={OPS_POPOVER} role="dialog" aria-label={t('plugins.ops.title')}>
        <div className={OPS_POP_HEAD}>
          <span className={OPS_POP_TITLE}><Icon name="activity" size={14} /><span>{t('plugins.ops.title')}</span></span>
          <button
            type="button"

            className="inline-flex h-8.5 items-center justify-center gap-2 rounded-sm border border-input bg-surface px-3.5 text-xs-plus text-text-secondary hover:bg-surface-hover"
            disabled={busy}
            onClick={() =>{  void clear() }}
          >
            {t('plugins.ops.clearAll')}
          </button>
        </div>
        <ul className={OPS_POP_LIST}>
          {rows.map((op) => {
            const percent = Math.round(progressOf(op) * 100)
            // FF-NOTE: .opsRowFailed on the row = border-color only (var(--aek-danger-border)); the
            // .opsRowFailed.opsRowState compound rule (the failed state chip) = bg-danger-soft text-danger.
            return (
              <li key={op.id} className={cn(OPS_ROW, op.status === 'failed' ? 'border-danger-border' : undefined)}>
                <div className="flex items-center gap-2">
                  <span className="flex-auto truncate text-xs font-semibold text-text">{op.title}</span>
                  <span className={cn('rounded-full py-0.25 px-2 text-2xs font-semibold', op.status === 'running' ? 'bg-accent-soft text-accent-ink' : (op.status === 'failed' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'))}>
                    {opsStateTitle(op.status)}
                  </span>
                  <span className="min-w-8.5 text-right tabular-nums text-2xs text-text-muted">{String(percent)}%</span>
                  <button
                    type="button"
                    className="inline-flex size-5.5 items-center justify-center rounded-xs border-0 bg-transparent ml-auto text-text-muted hover:not-disabled:bg-surface-hover hover:not-disabled:text-danger disabled:cursor-default disabled:opacity-40"
                    title={t('plugins.ops.remove')}
                    aria-label={t('plugins.ops.remove')}
                    disabled={busy}
                    onClick={() =>{  void dismiss(op.id) }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
                <div className={OPS_BAR} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                  <span className={cn(OPS_BAR_FILL, op.status === 'failed' && 'bg-danger')} style={{ width: `${String(percent)}%` }} />
                </div>
                <ul className="m-0 flex flex-wrap list-none gap-1.5 p-0">
                  {op.steps.map((step, index) => (
                    <li key={index} className={cn('inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle py-0.25 px-2 text-xs text-text-muted', stepClassOf(step.state))}>
                      {step.state === 'done'
                        ? <Icon name="check" size={11} />
                        : step.state === 'failed'
                          ? <Icon name="alert" size={11} />
                          : step.state === 'active'
                            ? <Icon name="refresh" size={11} />
                            : null}
                      <span>{step.label}</span>
                    </li>
                  ))}
                </ul>
                {op.pendingHostRestart && op.status === 'running'
                  ? (
                    <div className={OPS_PENDING_HOST}>
                      <span>{t('plugins.ops.pendingHostRestart')}</span>
                      <button
                        type="button"

                        className="inline-flex h-8.5 items-center justify-center gap-2 rounded-sm border border-input bg-surface px-3.5 text-xs-plus text-text-secondary hover:bg-surface-hover"
                        onClick={() =>{  onRestartNow(op) }}
                      >
                        {t('plugins.ops.restartNow')}
                      </button>
                    </div>
                  )
                  : null}
                {op.note !== undefined && op.note !== ''
                  ? <div className={cn(OPS_NOTE, op.status === 'failed' ? OPS_NOTE_FAILED : undefined)}>{op.note}</div>
                  : null}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

/** @param raw - the raw host value. @returns a clamped interval in seconds, or undefined. */
function parseMemCheckIntervalSec(raw: unknown): number | undefined {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 5 && value <= 3600 ? Math.floor(value) : undefined
}

/** @returns the plugin management page. */
/** V round: the shared ENTRY-ROWS list — the 入口 section of the runtime page
    and the 组件结构 section of the About page render the SAME rows from ONE
    component (the III-round rule: one list style, the pages never drift). */
function EntryRows({ entries, t, tf }: {
  entries: AppEntry[]
  t: (key: string) => string
  tf: (key: string, values: Record<string, string | number>) => string
}): ReactNode {
  return (
    <ul className={ENTRY_LIST}>
      {entries.map((entry) => {
        // AA round: the entry rows carry the same "various info" as
        // the plugin rows below them — a title row (name + copy +
        // the 入口 tag) plus a chip row (version / A1-A2 class /
        // languages) plus the description row — reusing the plugin
        // row classes, so no new CSS. An older host without the
        // chip fields simply renders no chip row.
        // CC round: the chip row gains the RUNTIME MEMORY fact —
        // the shell is measured (main + helpers, RSS sum), the
        // webui has no own process, the CLI is transient: every
        // row answers "where is this app's memory" with either a
        // real reading or the honest reason, never an invented 0.
        const languages = entry.languages ?? []
        const hasChips = (entry.version !== undefined && entry.version !== '')
      || (entry.distribution !== undefined && entry.distribution !== '')
      || languages.length > 0
      || entry.memory !== undefined
        return (
          <li key={entry.id}>
            {/* HH round: the hand-rolled bordered li is the shadcn
            Card (sm spacing = the same 12px rhythm, standard
            ring/chrome); the inner flex structure and the
            measured right-side track (ml-auto chip, empty
            actions grid) are kept so entry and plugin cards
            stay column-aligned. */}
            <Card size="lg" className="shadow-none">
              <CardContent className="flex flex-col gap-2">
                <div className="mb-0 flex items-start gap-3">
                  <span className={FEATURE_ICON}><Icon name={ENTRY_ICONS[entry.id] ?? 'layout'} size={18} /></span>
                  <div className="flex flex-auto min-w-0 flex-col gap-1.5 pr-2">
                    <div className={FEATURE_TITLE}>
                      <span className={FEATURE_TITLE_NAME}>{entry.id}</span>
                      <CopyButton value={entry.packageName} size={12} label={t('common.copy')} className={FEATURE_COPY} />
                      <Badge variant="secondary" className="tabular-nums">{t('about.entry.tag')}</Badge>
                    </div>
                    {hasChips
                      ? (
                        <div className={FEATURE_TEXT}>
                          {entry.version !== undefined && entry.version !== ''
                            ? <Badge variant="secondary" className="tabular-nums">{entry.version}</Badge>
                            : null}
                          <ClassChip distribution={entry.distribution ?? ''} t={t} />
                          {languages.length > 0
                            ? <span className={STACK_TEXT} title={languages.join(' · ')}>{languages.join(' · ')}</span>
                            : null}
                          {entry.memory?.kind === 'shell'
                            ? (entry.memory.state === 'running' && entry.memory.footprintMb !== undefined
                              ? (
                                <>
                                  {/* 2026-11-17: the memory fact is right-anchored like the plugin
                                  runtime lines (their chip carries ml-auto), so the entry
                                  list and plugin lists share one right-side track. */}
                                  <Badge variant="outline" className="ml-auto tabular-nums">{tf('about.entry.mem.shell', { mb: entry.memory.footprintMb })}</Badge>
                                </>
                              )
                              : <Badge variant="outline" className="ml-auto">{entry.memory.state === 'stopped' ? t('about.entry.mem.shellStopped') : t('about.entry.mem.unavailable')}</Badge>)
                            : null}
                          {entry.memory?.kind === 'in-host'
                            ? (
                              <>
                                <Badge variant="outline" className="ml-auto">{t('about.entry.mem.inHost')}</Badge>
                              </>
                            )
                            : null}
                          {entry.memory?.kind === 'transient'
                            ? <Badge variant="outline" className="ml-auto">{t('about.entry.mem.transient')}</Badge>
                            : null}
                        </div>
                      )
                      : null}
                    {entry.description
                      ? <div className={FEATURE_DESC}>{entry.description}</div>
                      : null}
                  </div>
                  {/* The empty actions column keeps this row's text column
                  the same width as the plugin rows under it. */}

                  <div className={PLUGIN_ACTIONS_GRID} aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

export function PluginsPanel({ refreshSignal }: { refreshSignal: number }) {
  const { t, tf } = useI18n()
  // EE round: the 入口 section carries the memory-check interval — the
  // user-adjustable seconds input (persisted on the host, default 60) drives
  // a background poll of the host facts so the runtime memory readings keep
  // moving on their own; 立即检测 bypasses the interval and measures now.
  // EE-fix (2026-11-17): the commit is now EXPLICIT (the 保存 button, or
  // Enter) and awaited — the old blur-commit POSTed fire-and-forget, so when
  // the host was down the write was silently lost and the next load
  // reconciled back to the fallback 60. A failed save now shows inline and
  // keeps the draft for a retry.
  const [memCheckSec, , commitMemCheckSec] = usePref<number>(PREF_KEYS.memCheckIntervalSec, 60, parseMemCheckIntervalSec)
  const facts = useConsoleFacts(memCheckSec * 1000)
  const [memCheckDraft, setMemCheckDraft] = useState(String(memCheckSec))
  useEffect(() => {
    setMemCheckDraft(String(memCheckSec))
  }, [memCheckSec])
  const [memCheckSaving, setMemCheckSaving] = useState(false)
  const [memCheckError, setMemCheckError] = useState<string | undefined>(undefined)
  const memCheckValue = Number(memCheckDraft)
  const memCheckDirty = Number.isFinite(memCheckValue)
    && memCheckValue >= 5 && memCheckValue <= 3600
    && Math.floor(memCheckValue) !== memCheckSec
  const saveMemCheck = useCallback(async (): Promise<void> => {
    const value = Math.floor(Number(memCheckDraft))
    if (!Number.isFinite(value) || value < 5 || value > 3600) return
    setMemCheckSaving(true)
    setMemCheckError(undefined)
    const ok = await commitMemCheckSec(value)
    setMemCheckSaving(false)
    if (!ok) setMemCheckError(t('about.entry.memCheck.saveFailed'))
  }, [commitMemCheckSec, memCheckDraft, t])
  // T round: the numbered runtime view lives IN this card (the standalone
  // 运行时与内存 section is gone); the per-plugin runtime lines come from
  // the same live snapshot.
  const { snapshot: rtSnapshot, busy: rtBusy, addRuntime: addRuntimeMut, movePlugin: movePluginMut } = useRuntimes(refreshSignal, 3000)
  // X2 item 7: the operation ledger — the "how far is that" pipelines.
  // Z round: the rows render in the floating box behind the search row's
  // red-dot badge; `removeOp` / `clearAll` are the 剔除 / 清空 writes.
  const { ops, progressOf, refresh: refreshOps, removeOp, clearAll } = useOps(refreshSignal)

  // Z round: the ops badge + floating box on the search row (the ledger's
  // inline block left the card body).
  const [opsPopoverOpen, setOpsPopoverOpen] = useState(false)
  const restartNow = async (op: import('./useOps.ts').OpEntry): Promise<void> => {
    try {
      const status = await fetchRuntime()
      // The ledger belongs to the backend serving this console: restart its
      // web half — the host's boot hook closes the pending op.
      await postInstance(status.current.slot, 'web', 'restart')
      setNotice({ message: tf('plugins.ops.restarted', { title: op.title }), tone: 'success' })
      refreshOps()
      facts.refresh()
    } catch (cause: unknown) {
      setNotice({ message: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
    }
  }

  // Sidebar-row refresh (Q round): re-scan the plugin directory.
  useEffect(() => {
    if (refreshSignal > 0) facts.refresh()
  }, [refreshSignal, facts.refresh])
  const { prefs } = useSettings()
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'error' } | undefined>(undefined)
  const [pending, setPending] = useState<string | undefined>(undefined)
  /**
   * The row whose switch was flipped towards "off" and is waiting for the
   * second click. Disabling is destructive (the plugin's routes answer 503
   * immediately), so the switch alone must not do it unless the user turned the
   * confirmation off in settings.
   */
  const [confirming, setConfirming] = useState<string | undefined>(undefined)
  const confirmDisable = prefs[CONFIRM_DISABLE_KEY] !== false
  const needle = query.trim().toLowerCase()
  const allPlugins = (facts.facts?.plugins ?? [])
  const plugins = allPlugins.filter((plugin) => {
    if (needle.length === 0) return true
    return [plugin.id, plugin.packageName, plugin.description, plugin.version].join(' ').toLowerCase().includes(needle)
  })
  // T round: the roster is grouped by the user's disk bucket (older hosts
  // report no bucket → every row lands in the `plugins` group).
  const grouped = BUCKET_ORDER
    .map(bucket => ({ bucket, items: plugins.filter(plugin => (plugin.bucket ?? 'plugins') === bucket) }))
    .filter(group => group.items.length > 0)
  // T round: the per-OS memory term (win32 = working set; darwin/linux = RSS).
  const term = rtSnapshot?.platform === 'win32'
    ? t('runtimes.memTerm.win32')
    : t('runtimes.memTerm.posix')

  /** @param id - plugin directory name. @param action - requested action. */
  const act = (id: string, action: PluginAction['id']): void => {
    setPending(`${id}:${action}`)
    setNotice(undefined)
    void fetch(PLUGIN_ACTION_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
      .then(async response => await response.json() as { status?: string; message?: string; reason?: string })
      .then((data) => {
        setNotice({ message: `${displayName(id)} · ${data.status ?? data.message ?? data.reason ?? 'ok'}`, tone: 'success' })
      })
      .catch((cause: unknown) => {
        setNotice({ message: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
      })
      .finally(() => {
        setPending(undefined)
        facts.refresh()
      })
  }

  /**
   * The switch's entry point. Turning a plugin OFF is gated by the
   * `aek-home.confirmPluginDisable` setting: instead of disabling right away it
   * remembers the row and lets the inline confirmation do the actual work.
   * Turning a plugin ON is never gated — that direction restores service.
   * @param id - plugin directory name.
   * @param next - the state the switch was moved to.
   */
  const requestToggle = (id: string, next: boolean): void => {
    if (next || !confirmDisable) {
      setConfirming(undefined)
      toggle(id, next)
      return
    }
    setNotice(undefined)
    setConfirming(current => (current === id ? undefined : id))
  }

  /** @param id - plugin directory name. @param enabled - requested state. */
  const toggle = (id: string, enabled: boolean): void => {
    setPending(`${id}:toggle`)
    setNotice(undefined)
    void fetch(PLUGIN_ACTION_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action: enabled ? 'enable' : 'disable' }),
    })
      .then(async response => await response.json() as { status?: string; message?: string; reason?: string })
      .then((data) => {
        setNotice({ message: `${displayName(id)} · ${data.status ?? data.message ?? data.reason ?? 'ok'}`, tone: 'success' })
      })
      .catch((cause: unknown) => {
        setNotice({ message: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
      })
      .finally(() => {
        setPending(undefined)
        facts.refresh()
      })
  }

  /**
   * X2: move one package into the picked RUNTIME container (the floating
   * picker is the decision surface — no native confirmation, the host
   * answers 409/428 with a reason that the notice line renders).
   * @param id - package directory name.
   * @param runtime - target runtime id (`runtime0` = the shared host).
   */
  const movePlugin = (id: string, runtime: string): void => {
    const plugin = allPlugins.find(candidate => candidate.id === id)
    const name = plugin !== undefined ? displayName(plugin.packageName) : id
    setPending(`move:${id}`)
    setNotice(undefined)
    void movePluginMut(id, runtime)
      .then(() => {
        setNotice({ message: tf('plugins.runtime.moved', { name, runtime }), tone: 'success' })
      })
      .catch((cause: unknown) => {
        setNotice({ message: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
      })
      .finally(() => {
        setPending(undefined)
        facts.refresh()
      })
  }

  /**
   * X4: the one-click "carve out" — create a fresh auto-numbered dedicated
   * runtime container (no label) and move THIS plugin into it, so its chip
   * stops showing the shared host reading and shows its OWN container
   * process's measured RSS. Chains the two existing mutations (the hook's
   * busy gate already serializes them); the move's notice pipeline reports.
   * Only offered for in-host plugins — a container plugin already has its
   * own process.
   * @param id - the plugin id.
   * @returns the async action, or undefined when not applicable.
   */
  const carveOutFor = (id: string): (() => Promise<void>) | undefined => {
    const entry = rtSnapshot?.pluginMemory[id]
    if (entry !== undefined && entry.runtimeId !== undefined && entry.runtimeId !== 'runtime0') return undefined
    if (rtSnapshot === undefined) return undefined
    return async () => {
      setPending(`carve-out:${id}`)
      setNotice(undefined)
      try {
        const created = await addRuntimeMut()
        // Older hosts don't echo the created id: derive it (the add auto-
        // numbers from the CURRENT max, and this snapshot is pre-add).
        const nextNumber = rtSnapshot.runtimes.reduce((max, candidate) => Math.max(max, candidate.number), -1) + 1
        const target = created ?? `runtime${String(nextNumber)}`
        movePlugin(id, target)
      } catch (cause: unknown) {
        setNotice({ message: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
        setPending(undefined)
      }
    }
  }

  return (
    <PanelCard>
      <div className={CARD_BODY}>
        {/* Z round: the search box keeps its slot, but the "8"-style hit
            count is gone; the slot now carries the operation-progress
            badge (activity icon + red dot, shown while the ledger has
            rows) that opens the floating 操作进度 box. */}
        <div className={OPS_BADGE_ROW}>
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder={t('plugins.search')}
            badge={ops !== undefined && ops.length > 0
              ? <span className={OPS_BADGE_ICON}><Icon name="activity" size={12} /><span className={OPS_BADGE_DOT} aria-hidden="true" /></span>
              : undefined}
            badgeAria={t('plugins.ops.title')}
            onBadgeClick={() =>{  setOpsPopoverOpen(open => !open) }}
          />
          <OpsPopover
            open={opsPopoverOpen && (ops?.length ?? 0) > 0}
            onClose={() =>{  setOpsPopoverOpen(false) }}
            ops={ops}
            progressOf={progressOf}
            onRemove={removeOp}
            onClear={clearAll}
            onRestartNow={(op) =>{  void restartNow(op) }}
            onNotice={(message, tone) =>{  setNotice({ message, tone }) }}
          />
        </div>
        {notice !== undefined
          ? (
            <p className={cn(NOTICE_LINE, notice.tone === 'success' ? NOTICE_SUCCESS : NOTICE_ERROR)} role="status">
              <Icon name={notice.tone === 'success' ? 'check' : 'alert'} size={14} />
              <span>{notice.message}</span>
            </p>
          )
          : null}
        {facts.error !== undefined
          ? <div className={ERROR_BANNER}><Icon name="alert" size={16} /><span>{tf('about.error', { message: facts.error })}</span></div>
          : null}
        {plugins.length === 0 && !facts.loading
          ? <div className={EMPTY_STATE}>{t('common.noMatch')}</div>
          : null}
        {/* T round: the numbered runtime view is part of this card now —
            the 运行时与内存 section no longer exists on its own. */}
        <RuntimesBlock refreshSignal={refreshSignal} />
        {/* Z round: the X2 live operation pipelines moved out of the card
            body — they now live in the floating box behind the search
            row's red-dot badge (see the opsBadgeRow above). */}
        {/* X2 item 9: the 入口 section moved out of the 关于 card into THIS
            card — the entry points sit next to the plugins they launch. */}
        {(facts.facts?.entries ?? []).length > 0
          ? (
            <div>
              <h3 className="mb-2 mt-3 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-aek-group text-text-muted">
                <Icon name={ENTRIES_SECTION_ICON} size={14} />
                <span>{t('about.entries')}</span>
              </h3>
              {/* EE round: the user-adjustable memory-check interval — seconds
                  input (5..3600, default 60, host-persisted) plus the
                  立即检测 button that measures right now. */}
              <div className={MEM_CHECK_ROW}>
                <Label className="text-xs-plus font-semibold text-text">{t('about.entry.memCheck.label')}</Label>
                <Input
                  type="number"
                  className="h-8 w-16 text-xs tabular-nums"
                  min={5}
                  max={3600}
                  step={5}
                  value={memCheckDraft}
                  aria-label={t('about.entry.memCheck.label')}
                  title={t('about.entry.memCheck.hint')}
                  onChange={(event) =>{  setMemCheckDraft(event.target.value); setMemCheckError(undefined) }}
                  onKeyDown={(event) =>{  if (event.key === 'Enter') { event.preventDefault(); void saveMemCheck() } }}
                />
                <Button size="sm" className="gap-1.5" disabled={memCheckSaving || !memCheckDirty} onClick={() =>{  void saveMemCheck() }}>
                  {memCheckSaving ? <Spinner /> : null}
                  {t('about.entry.memCheck.save')}
                </Button>

                <Button variant="outline" size="sm" onClick={() =>{  facts.refresh() }}>
                  {t('about.entry.memCheck.checkNow')}
                </Button>
              </div>
              {memCheckError !== undefined
                ? <p className="m-0 mt-1.5 text-2xs text-danger" role="alert">{memCheckError}</p>
                : null}
              <EntryRows entries={facts.facts?.entries ?? []} t={t} tf={tf} />
            </div>
          )
          : null}
        {grouped.map(group => (
          <div key={group.bucket}>
            <h3 className="mb-2 mt-3 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-aek-group text-text-muted">
              <Icon name={bucketIconOf(group.bucket)} size={14} />
              <span>{bucketTitleOf(group.bucket, t)}</span>
            </h3>
            <ul className="m-0 flex flex-col gap-1.5 list-none p-0">
              {group.items.map((plugin) => {
                // T round: only cordis-loadable parts are switchable; the
                // host-identity / library / bundle rows are read-only roster
                // facts (older hosts report no flag → switchable, the old
                // behavior).
                const switchable = plugin.switchable !== false
                return (
                  <li key={plugin.id}>
                    <Card size="lg" className="shadow-none">
                      <CardContent className="flex flex-col gap-2">
                        <div className="mb-0 flex items-start gap-3">
                          {/* X2 item 17: the category icon (layers = real coraek plugins only). */}
                          <span className={FEATURE_ICON}><Icon name={bucketIconOf(plugin.bucket ?? 'plugins')} size={18} /></span>
                          <div className="flex flex-auto min-w-0 flex-col gap-1.5 pr-2">
                            {/* X2 items 11 + 16: the lock travels with the title (never in the
                                button cluster), and the copy icon sits right after the name.
                                X3: the copy button is a COMPACT ghost (the generic 34px bordered
                                .iconButton reads as a door in the 13px title line). */}
                            <div className={FEATURE_TITLE}>
                              <span className={FEATURE_TITLE_NAME}>{displayName(plugin.packageName)}</span>
                              <CopyButton value={plugin.packageName} size={12} label={t('common.copy')} className={FEATURE_COPY} />
                              {plugin.locked ? <Icon name="lock" size={13} className={FEATURE_TITLE_LOCK} /> : null}
                            </div>
                            {/* N2 fix: the merged row was one undifferentiated line
                                ("TypeScript · CSS AEK home surface: …" — no separators,
                                chips jammed against the version). Now: version + A1/A2 +
                                languages read as distinct chips on ONE line, and the
                                (long, colon-carrying) description gets its own line
                                below — the same two-line rhythm as the row above it.
                                HH round: the chips are shadcn Badges. */}
                            <div className={FEATURE_TEXT}>
                              <Badge variant="secondary" className="tabular-nums">{plugin.version}</Badge>
                              <ClassChip distribution={plugin.distribution} t={t} />
                              {switchable ? null : <Badge variant="outline">{t('plugins.switch.readonly')}</Badge>}
                              {plugin.languages.length > 0
                                ? <span className={STACK_TEXT} title={plugin.languages.join(' · ')}>{plugin.languages.join(' · ')}</span>
                                : null}
                            </div>
                            {plugin.description !== ''
                              ? <div className={FEATURE_DESC}>{plugin.description}</div>
                              : null}
                            {/* T round: where this package runs (its runtime line). */}
                            <PluginRuntimeLine
                              plugin={plugin}
                              rt={rtSnapshot}
                              term={term}
                              onMove={movePlugin}
                              onCarveOut={carveOutFor(plugin.id)}
                              busy={rtBusy}
                            />
                          </div>
                          {/* Two-column cluster (switch | actions): the lock icon moved to the
                              title row (X2 item 11 — it never sits between the switch and the
                              buttons), so the grid no longer drifts on locked rows.
                              HH round: the shadcn Switch (32×18) + outline icon Button. */}

                          <div className={PLUGIN_ACTIONS_GRID}>
                            {switchable
                              ? <ToggleSwitch
                                checked={plugin.enabled}
                                locked={plugin.locked}
                                onChange={(next) =>{  requestToggle(plugin.id, next) }}
                                label={plugin.locked ? t('plugins.switch.locked.root') : (plugin.enabled ? t('plugins.switch.on') : t('plugins.switch.off'))}
                              />
                              : <span className="block h-4.5 w-8" aria-hidden="true" />}
                            {switchable
                              ? PLUGIN_ACTIONS.map(action => (
                                <Button
                                  key={action.id}
                                  variant="outline"
                                  size="icon-sm"
                                  disabled={pending !== undefined}
                                  onClick={() =>{  act(plugin.id, action.id) }}
                                  title={t(action.labelKey)}
                                  aria-label={`${t(action.labelKey)} · ${displayName(plugin.packageName)}`}
                                >
                                  <Icon name={action.icon} size={16} className="size-4" />
                                </Button>
                              ))
                              : <span aria-hidden="true" />}
                          </div>
                        </div>
                        <CapabilityTags caps={plugin.capabilities} />
                        {confirming === plugin.id
                          ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-sm border border-danger-border bg-danger-soft p-2 px-2.5" role="alertdialog" aria-label={t('plugins.confirm.ok')}>
                              <span className="min-w-0 grow shrink basis-55 text-xs leading-1.5 text-text-secondary">{tf('plugins.confirm.text', { name: displayName(plugin.packageName) })}</span>
                              <span className="aek-plugin-confirm-actions ml-auto flex gap-2">
                                <Button variant="outline" size="sm" onClick={() =>{  setConfirming(undefined) }}>
                                  {t('plugins.confirm.cancel')}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => { setConfirming(undefined); toggle(plugin.id, false) }}
                                >
                                  {t('plugins.confirm.ok')}
                                </Button>
                              </span>
                            </div>
                          )
                          : null}
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </PanelCard>
  )
}

/**
 * The About page (R2 round, 2026-11-18): by user ruling the page carries
 * ONLY the desktop version number — no 版本与安装 rows, no 组件结构 card, no
 * 插件 roster, no 外部能力 section (those blocks were noise). The version
 * comes from the host inventory (the aek-desktop entry), never hardcoded.
 *
 * This component is shared by two surfaces: the 关于 page itself and the
 * 系统信息 section of the composed 插件与程序管理 page (both show the same
 * one row).
 */
export function AboutPanel({ refreshSignal }: { refreshSignal: number }) {
  const facts = useConsoleFacts()
  // Sidebar-row refresh (Q round): re-read the facts so the version row is
  // current after a host restart.
  useEffect(() => {
    if (refreshSignal > 0) facts.refresh()
  }, [refreshSignal, facts.refresh])
  const entries = facts.facts?.entries ?? []
  const desktop = entries.find(entry => entry.id === 'aek-desktop')

  return (
    <PanelCard>
      <div className={CARD_BODY}>
        <div className={INFO_ROW}>
          <span className={INFO_LABEL}>AEK Desktop</span>
          <span className={INFO_VALUE}>
            {desktop?.version !== undefined
              ? <code className={COUNT_CHIP}>{desktop.version}</code>
              : '—'}
          </span>
        </div>
      </div>
    </PanelCard>
  )
}


/**
 * Dispatch to one informational surface.
 * @param props - panel id and inventory.
 * @returns the selected surface.
 */
export function InfoPanels({ panel, refreshSignal }: InfoPanelsProps) {
  // M round: the "插件管理" page no longer exists as its own nav entry — its
  // content (and the About content) is merged INTO the 插件与程序管理
  // (runtime) page, composed by Home. The panel id 'plugins' stays a valid
  // render target only through that composition.
  if (panel === 'plugins') return <PluginsPanel refreshSignal={refreshSignal} />
  if (panel === 'settings') return <SettingsPanel refreshSignal={refreshSignal} />
  if (panel === 'websearchSettings') return <WebSearchSettingsPanel refreshSignal={refreshSignal} />
  // R2 round: the rail contract — the other three webui plugins own their
  // settings pages here too (empty schemas render the honest empty state).
  if (panel === 'skillsSettings') return <SkillsSettingsPanel refreshSignal={refreshSignal} />
  if (panel === 'promptsSettings') return <PromptsSettingsPanel refreshSignal={refreshSignal} />
  if (panel === 'iconsSettings') return <IconsSettingsPanel refreshSignal={refreshSignal} />
  // M round: the 关于 page was a stub (its content moved to 插件与程序管理).
  // R2 round (2026-11-18): by user ruling the page now carries ONLY the
  // desktop version number.
  return <AboutPanel refreshSignal={refreshSignal} />
}
