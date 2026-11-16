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
 * @module @cheezmil/aek-home/src/client/InfoPanels
 */
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import { BUCKET_ICONS, ENTRY_ICONS, ENTRIES_SECTION_ICON, APP_BUNDLE_ICON } from './icon-registry.ts'
import { useI18n } from './i18n.tsx'
import { useAccessDraft, useDraftSettings, useSettings } from './preferences.tsx'
import type { PrefValue } from './preferences.tsx'
import { allSettingFields, coerce, SETTINGS_SCHEMA, WEBSEARCH_SETTINGS_SCHEMA } from './settings-schema.ts'
import type { SettingField } from './settings-schema.ts'
import { css, cx } from './styles.ts'
import { CapabilityTags, CopyButton, PanelCard, PanelSearch, Spinner, ToggleSwitch } from './ui-kit.tsx'
import type { InventoryState } from './useInventory.ts'
import { useConsoleFacts } from './useConsoleFacts.ts'
import type { PluginBucket, PluginEntry } from './useConsoleFacts.ts'
import { useCapabilities } from './useCapabilities.ts'
import { useRuntimes } from './useRuntimes.ts'
import { useOps } from './useOps.ts'
import { fetchRuntime } from './useRuntimeMode.ts'
import { postInstance } from './useInstances.ts'
import { RuntimesBlock, fmtBytes } from './RuntimesPanel.tsx'

/** Panels handled here. */
export type InfoPanelId = 'plugins' | 'settings' | 'websearchSettings' | 'about'

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
  /** Live host package inventory. */
  inventory: InventoryState
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
  const hint = field.hintKey === undefined ? null : <p className={css.hint}>{t(field.hintKey)}</p>
  if (field.kind === 'toggle') {
    return (
      <>
        <div className={css.settingToggleRow}>
          <span className={css.settingToggleLabel}>{label}</span>
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
        <div className={css.settingRowHead}>
          <span className={css.settingToggleLabel}>{label}</span>
          <span className={css.settingValue}>{`${String(numeric)}${unit}`}</span>
        </div>
        <div className={css.rangeRow}>
          <input
            type="range"
            className={css.rangeInput}
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
            className={css.numberBox}
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
        <div className={css.settingRowHead}><span className={css.settingToggleLabel}>{label}</span></div>
        <select
          className={css.selectInput}
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
      <div className={css.settingRowHead}><span className={css.settingToggleLabel}>{label}</span></div>
      <input
        type="text"
        className={css.textInput}
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
    <section className={css.settingGroup} data-access-section>
      <h3 className={css.sectionTitle}>{t('settings.group.access')}</h3>
      <p className={css.hint}>{t('access.defaultHint')}</p>
      <ul className={css.settingList}>
        <li className={css.settingRow} data-setting-key="aek-home.access">
          <div className={css.settingToggleRow}>
            <span className={css.settingToggleLabel}>{t('access.publicMode')}</span>
            <ToggleSwitch checked={publicMode} onChange={onPublicMode} label={t('access.publicMode')} />
          </div>
          <p className={css.hint}>{t('access.publicModeHint')}</p>
        </li>
        <li className={css.settingRow}>
          <div className={css.settingRowHead}><span className={css.settingToggleLabel}>{t('access.allowlist')}</span></div>
          <textarea
            className={css.accessTextarea}
            rows={4}
            value={allowlist}
            placeholder={t('access.allowlistPlaceholder')}
            aria-label={t('access.allowlist')}
            onChange={(event) =>{  accessStage({ allowlist: event.target.value }) }}
            onBlur={onTextBlur}
          />
          <p className={css.hint}>{t('access.allowlistHint')}</p>
        </li>
        {publicMode
          ? (
            <>
              <li className={css.settingRow}>
                <div className={css.settingRowHead}><span className={css.settingToggleLabel}>{t('access.username')}</span></div>
                <input
                  type="text"
                  className={css.textInput}
                  value={username}
                  autoComplete="off"
                  aria-label={t('access.username')}
                  onChange={(event) =>{  accessStage({ username: event.target.value }) }}
                  onBlur={onTextBlur}
                />
              </li>
              <li className={css.settingRow}>
                <div className={css.settingRowHead}><span className={css.settingToggleLabel}>{t('access.password')}</span></div>
                <input
                  type="password"
                  className={css.textInput}
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
      {missingCredentials ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{t('access.needCredentials')}</span></div> : null}
      {accessCommitError !== undefined
        ? (
          <div className={css.errorBanner}>
            <Icon name="alert" size={16} />
            <span>{accessCommitError === 'needCredentials' ? t('access.needCredentials') : accessCommitError}</span>
          </div>
        )
        : null}
      {notice !== undefined ? <p className={css.hint}>{notice}</p> : null}
      {dirty ? <p className={css.hint}>{t('access.stagedHint')}</p> : null}
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
    <section className={css.settingGroup}>
      <h3 className={css.sectionTitle}>{t('settings.group.permissions')}</h3>
      <ul className={css.infoList}>
        <li className={css.infoRow}>
          <span className={css.infoLabel}>{t('permissions.platform')}</span>
          <span className={css.infoValue}>
            {facts.facts === undefined ? t('common.loading') : `${facts.facts.platform} / ${facts.facts.arch}`}
          </span>
        </li>
      </ul>
      <div className={css.heroNote}>
        <span className={css.noteIcon}><Icon name="shield" size={16} /></span>
        <p>{t(noteKey)}</p>
      </div>
      <ul className={css.permList}>
        {bundles.map(bundle => (
          <li key={bundle.id} className={css.permRow}>
            <span className={css.featureIcon}><Icon name={APP_BUNDLE_ICON} size={16} /></span>
            <span className={css.permName}>{bundle.name}.app</span>
            <code className={css.pathValue}>{bundle.id}</code>
            <CopyButton value={bundle.id} label={t('common.copy')} />
          </li>
        ))}
      </ul>
      <div className={css.accessActions}>
        <button type="button" className={css.primaryButton} disabled={pending || !isMac} onClick={openPane}>
          {pending ? <Spinner /> : null}
          {t('permissions.open')}
        </button>
      </div>
      {notice !== undefined ? <p className={css.hint}>{notice}</p> : null}
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
    const flashClass = css.settingRowFlash
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
        ? <div className={css.dirtyBackdrop} role="presentation" onClick={onClose} />
        : null}
      <div className={css.dirtyPopover} role="dialog" aria-label={t('settings.dirty.title')}>
        <div className={css.dirtyPopoverHead}>
          <span className={css.dirtyPopoverTitle}>{t('settings.dirty.title')}</span>
          <button
            type="button"
            className={css.dirtySaveAll}
            title={t('settings.dirty.saveAll')}
            aria-label={`${t('settings.dirty.saveAll')} — ${t('settings.dirty.dot')}`}
            onClick={() => void saveAll()}
          >
            <Icon name="save" size={18} />
            {total > 0
              ? <span className={css.dirtySaveAllDot} aria-label={t('settings.dirty.dot')} />
              : null}
          </button>
        </div>
        {total === 0
          ? <p className={css.hint}>{t('settings.dirty.empty')}</p>
          : (
            <ul className={css.dirtyList}>
              {withAccess && access.dirty
                ? (
                  <li className={css.dirtyRow}>
                    <button type="button" className={css.dirtyRowLabel} title={t('settings.dirty.locate')} onClick={() =>{  locate('aek-home.access') }}>
                      {t('settings.access.item')}
                    </button>
                    <span className={css.dirtyRowValue}>—</span>
                    <button
                      type="button"
                      className={css.dirtyRowAction}
                      title={t('settings.dirty.undo')}
                      aria-label={t('settings.dirty.undo')}
                      onClick={() =>{  access.accessUndo() }}
                    >
                      <Icon name="restore" size={14} />
                    </button>
                    <button
                      type="button"
                      className={css.dirtyRowAction}
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
                  <li key={key} className={css.dirtyRow}>
                    <button type="button" className={css.dirtyRowLabel} title={t('settings.dirty.locate')} onClick={() =>{  locate(key) }}>
                      {label}
                    </button>
                    <span className={css.dirtyRowValue}>{String(draftValues[key] ?? '')}</span>
                    <button
                      type="button"
                      className={css.dirtyRowAction}
                      title={t('settings.dirty.undo')}
                      aria-label={t('settings.dirty.undo')}
                      onClick={() =>{  draftUndo(key) }}
                    >
                      <Icon name="restore" size={14} />
                    </button>
                    <button
                      type="button"
                      className={css.dirtyRowAction}
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
    <li key={field.key} className={css.settingRow} data-setting-key={field.key}>
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
  // K round: the dedicated TEST section — a real schema row (so it flows
  // through the draft/commit system exactly like every setting) but wired
  // to NOTHING; it exists so the user (and agents) can poke the settings
  // machinery without touching real settings.
  const testRows = visible.filter(field => field.group === 'test')

  return (
    <PanelCard>
      <div className={css.cardBody}>
        {/* G round: the settings toolbar is a control, not content — it stays
            pinned to the top of the viewport while the section list scrolls
            (the document is the scroll container; sticky + opaque surface +
            the F-round hairline below it). */}
        <div className={css.stickyPanelSearch}>
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder={t('settings.panelSearch')}
            badge={totalDirty > 0 ? <span className={css.dirtyDot} aria-hidden="true" /> : undefined}
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
        <div className={css.stickyDivider} aria-hidden="true" />
        {firstRailRows.length > 0
          ? (
            <section className={css.settingGroup}>
              <h3 className={css.sectionTitle}>{t('settings.group.sidebarFirst')}</h3>
              <p className={css.hint}>{t('settings.group.sidebarFirstHint')}</p>
              <ul className={css.settingList}>
                {firstRailRows.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {secondRailFields.length > 0
          ? (
            <section className={css.settingGroup}>
              <h3 className={css.sectionTitle}>{t('settings.group.sidebarSecond')}</h3>
              <p className={css.hint}>{t('settings.group.sidebarSecondHint')}</p>
              <ul className={css.settingList}>
                {secondRailFields.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {navigationRows.length > 0
          ? (
            <section className={css.settingGroup}>
              <h3 className={css.sectionTitle}>{t('settings.group.navigation')}</h3>
              <ul className={css.settingList}>
                {navigationRows.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {generalRows.length > 0
          ? (
            <section className={css.settingGroup}>
              <h3 className={css.sectionTitle}>{t('settings.group.general')}</h3>
              <ul className={css.settingList}>
                {generalRows.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {testRows.length > 0
          ? (
            <section className={css.settingGroup}>
              <h3 className={css.sectionTitle}>{t('settings.group.test')}</h3>
              <p className={css.hint}>{t('settings.group.testHint')}</p>
              <ul className={css.settingList}>
                {testRows.map(fieldRow)}
              </ul>
            </section>
          )
          : null}
        {matches(['access', 'lan', 'ip', 'cidr', 'basic auth', t('settings.group.access')]) ? <AccessSection /> : null}
        {matches(['permission', 'tcc', 'accessibility', t('settings.group.permissions')]) ? <PermissionsSection /> : null}
        {matches(['default', t('settings.group.defaults'), t('settings.restoreDefaults')])
          ? (
            <section className={css.settingGroup}>
              <h3 className={css.sectionTitle}>{t('settings.group.defaults')}</h3>
              <ul className={css.settingList}>
                <li className={css.settingRow}>
                  <div className={css.settingRowHead}>
                    <span className={css.settingToggleLabel}>{t('settings.restoreDefaults')}</span>
                  </div>
                  <p className={css.hint}>{t('settings.restoreDefaultsHint')}</p>
                  <div className={css.accessActions}>
                    <button
                      type="button"
                      className={css.secondaryButton}
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
                          className={css.primaryButton}
                          onClick={() => { void undoRestore() }}
                        >
                          {t('settings.undoRestore')}
                        </button>
                      )
                      : null}
                  </div>
                  {restore.phase === 'backedUp'
                    ? <p className={cx(css.noticeLine, css.noticeNeutral)}><Icon name="check" size={14} />{t('settings.backupDone')}</p>
                    : null}
                  {restore.phase === 'restored'
                    ? <p className={cx(css.noticeLine, css.noticeNeutral)}><Icon name="check" size={14} />{t('settings.restored')}</p>
                    : null}
                  {restore.phase === 'noBackup'
                    ? <p className={css.errorBanner}><Icon name="alert" size={16} /><span>{t('settings.noBackup')}</span></p>
                    : null}
                  {restore.phase === 'backupFailed'
                    ? <p className={css.errorBanner}><Icon name="alert" size={16} /><span>{t('settings.backupFailed')}</span></p>
                    : null}
                  {restore.phase === 'restoreFailed'
                    ? <p className={css.errorBanner}><Icon name="alert" size={16} /><span>{t('settings.restoreFailed')}</span></p>
                    : null}
                </li>
              </ul>
            </section>
          )
          : null}
        {visible.length === 0 && needle.length > 0
          ? <div className={css.emptyState}>{t('common.noMatch')}</div>
          : null}
      </div>
    </PanelCard>
  )
}

/**
 * The Web Search plugin's own settings page (Q round 14: "each plugin should
 * have its own settings page, not one giant Settings page"). Only plugins
 * that actually have user-facing settings get a page; this one owns the
 * ranking refresh interval. The display filters stay on the search page
 * itself.
 */
function WebSearchSettingsPanel({ refreshSignal }: { refreshSignal: number }) {
  const { t } = useI18n()
  const { reload } = useSettings()
  // I round: same draft layer as the base settings page (and the same
  // changed-items box, so edits made here show up on every settings surface).
  const { values: draftValues, draftSet, dirtyKeys } = useDraftSettings()
  const [query, setQuery] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const needle = query.trim().toLowerCase()
  const visible = WEBSEARCH_SETTINGS_SCHEMA.filter((field) => {
    if (needle.length === 0) return true
    return [t(field.labelKey), field.key, field.group].join(' ').toLowerCase().includes(needle)
  })

  useEffect(() => {
    if (refreshSignal > 0) reload()
  }, [refreshSignal, reload])

  return (
    <PanelCard>
      <div className={css.cardBody}>
        {/* G round: same sticky + condense toolbar as the base settings page. */}
        <div className={css.stickyPanelSearch}>
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder={t('settings.panelSearch')}
            badge={dirtyKeys.length > 0 ? <span className={css.dirtyDot} aria-hidden="true" /> : undefined}
            badgeAria={t('settings.dirty.title')}
            onBadgeClick={() =>{  setPopoverOpen(open => !open) }}
            condense
            condenseHold={dirtyKeys.length > 0}
          />
          <SettingsDirtyPopover open={popoverOpen && dirtyKeys.length > 0} onClose={() =>{  setPopoverOpen(false) }} withAccess={false} />
        </div>
        {/* L round: standalone divider (document flow, not part of the sticky box). */}
        <div className={css.stickyDivider} aria-hidden="true" />
        {visible.length > 0
          ? (
            <section className={css.settingGroup}>
              <h3 className={css.sectionTitle}>{t('settings.group.websearch')}</h3>
              <ul className={css.settingList}>
                {visible.map(field => (
                  <li key={field.key} className={css.settingRow} data-setting-key={field.key}>
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
            <div className={css.emptyState}>{t('common.noMatch')}</div>
          )}
      </div>
    </PanelCard>
  )
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
    <div className={css.rtPicker} role="listbox" aria-label={t('plugins.runtime.picker')}>
      <input
        className={css.rtPickerSearch}
        value={needle}
        onChange={(event) => { setNeedle(event.target.value) }}
        placeholder={t('plugins.runtime.pickerSearch')}
        aria-label={t('plugins.runtime.pickerSearch')}
      />
      <ul className={css.rtPickerList}>
        {/* X4: the one-click "carve out" — a fresh auto-numbered dedicated
            container for THIS plugin (the in-host reading is shared, so the
            only way to see its OWN number is to give it its own process). */}
        {onCarveOut !== undefined
          ? (
            <li
              className={cx(css.rtPickerItem, busy !== undefined ? css.rtPickerItemDisabled : undefined)}
              role="option"
              aria-selected={false}
              onClick={() => { if (busy === undefined) void onCarveOut() }}
            >
              <span className={css.rtPickerLabel}>
                {t('plugins.runtime.carveOut')}
              </span>
              <Icon name="plus" size={13} />
            </li>
          )
          : null}
        {visible.length === 0
          ? <li className={css.rtPickerEmpty}>{t('common.noMatch')}</li>
          : visible.map((row) => {
            const here = row.id === current
            return (
              <li
                key={row.id}
                className={cx(css.rtPickerItem, here ? css.rtPickerItemCurrent : undefined)}
                role="option"
                aria-selected={here}
                onClick={() => { if (!here) onPick(row.id) }}
              >
                <span className={css.rtPickerLabel}>
                  {row.label}
                  <span className={css.rtPickerMeta}>
                    {row.plugins.length > 0 ? `${row.plugins.length}` : ''}
                    {row.state === 'running' ? t('runtimes.state.running') : t('runtimes.state.stopped')}
                  </span>
                </span>
                {here ? <Icon name="check" size={13} /> : <Icon name="chevronDown" size={13} />}
              </li>
            )
          })}
      </ul>
      {busy !== undefined ? <div className={css.rtPickerBusy}><Spinner size={12} />{t('plugins.runtime.pickerBusy')}</div> : null}
    </div>
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
    <div className={css.pluginRuntimeLine}>
      <span className={cx(css.rtChip, resolved.state === 'running' ? css.rtStateRunning : undefined)}>
        runtime{String(resolved.number)}
      </span>
      <span className={css.pluginRuntimeText}>
        {isolatedRow !== undefined
          ? tf('plugins.runtime.lineIsolated', { n: String(isolatedRow.number) })
          : t('plugins.runtime.lineHost')}
        {` · ${t(resolved.state === 'running' ? 'runtimes.state.running' : 'runtimes.state.stopped')}`}
      </span>
      {/* X4: the number is always a real measured reading; the hover carries
          the WHY (in-host sharing / container cohabitation) in plain words. */}
      <span className={cx(css.rtChip, css.pluginMemChip)} title={chipTitle}>
        {chip}
      </span>
      {(moveTargets.length > 0 || carveOutable)
        ? (
          <span className={css.rtPickerWrap}>
            <button
              type="button"
              className={css.pluginRuntimeMove}
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
        return css.opsStepDone
      case 'failed':
        return css.opsStepFailed
      case 'active':
        return css.opsStepActive
      default:
        return css.opsStepPending
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
        ? <div className={css.dirtyBackdrop} role="presentation" onClick={onClose} />
        : null}
      <div className={css.opsPopover} role="dialog" aria-label={t('plugins.ops.title')}>
        <div className={css.opsPopHead}>
          <span className={css.opsPopTitle}><Icon name="activity" size={14} /><span>{t('plugins.ops.title')}</span></span>
          <button
            type="button"
            className={css.secondaryButton}
            disabled={busy}
            onClick={() =>{  void clear() }}
          >
            {t('plugins.ops.clearAll')}
          </button>
        </div>
        <ul className={css.opsPopList}>
          {rows.map((op) => {
            const percent = Math.round(progressOf(op) * 100)
            return (
              <li key={op.id} className={cx(css.opsRow, op.status === 'failed' ? css.opsRowFailed : undefined)}>
                <div className={css.opsRowTop}>
                  <span className={css.opsRowTitle}>{op.title}</span>
                  <span className={cx(css.opsRowState, op.status === 'running' ? css.opsRowRunning : (op.status === 'failed' ? css.opsRowFailed : css.opsRowDone))}>
                    {opsStateTitle(op.status)}
                  </span>
                  <span className={css.opsRowPercent}>{String(percent)}%</span>
                  <button
                    type="button"
                    className={css.opsRowRemove}
                    title={t('plugins.ops.remove')}
                    aria-label={t('plugins.ops.remove')}
                    disabled={busy}
                    onClick={() =>{  void dismiss(op.id) }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
                <div className={css.opsBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                  <span className={cx(css.opsBarFill, op.status === 'failed' ? css.opsBarFailed : undefined)} style={{ width: `${String(percent)}%` }} />
                </div>
                <ul className={css.opsSteps}>
                  {op.steps.map((step, index) => (
                    <li key={index} className={cx(css.opsStep, stepClassOf(step.state))}>
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
                    <div className={css.opsPendingHost}>
                      <span>{t('plugins.ops.pendingHostRestart')}</span>
                      <button
                        type="button"
                        className={css.secondaryButton}
                        onClick={() =>{  onRestartNow(op) }}
                      >
                        {t('plugins.ops.restartNow')}
                      </button>
                    </div>
                  )
                  : null}
                {op.note !== undefined && op.note !== ''
                  ? <div className={cx(css.opsNote, op.status === 'failed' ? css.opsNoteFailed : undefined)}>{op.note}</div>
                  : null}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

/** @returns the plugin management page. */
export function PluginsPanel({ refreshSignal }: { refreshSignal: number }) {
  const { t, tf } = useI18n()
  const facts = useConsoleFacts()
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
      <div className={css.cardBody}>
        {/* Z round: the search box keeps its slot, but the "8"-style hit
            count is gone; the slot now carries the operation-progress
            badge (activity icon + red dot, shown while the ledger has
            rows) that opens the floating 操作进度 box. */}
        <div className={css.opsBadgeRow}>
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder={t('plugins.search')}
            badge={ops !== undefined && ops.length > 0
              ? <span className={css.opsBadgeIcon}><Icon name="activity" size={12} /><span className={css.opsBadgeDot} aria-hidden="true" /></span>
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
            <p className={cx(css.noticeLine, notice.tone === 'success' ? css.noticeSuccess : css.noticeError)} role="status">
              <Icon name={notice.tone === 'success' ? 'check' : 'alert'} size={14} />
              <span>{notice.message}</span>
            </p>
          )
          : null}
        {facts.error !== undefined
          ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{tf('about.error', { message: facts.error })}</span></div>
          : null}
        {plugins.length === 0 && !facts.loading
          ? <div className={css.emptyState}>{t('common.noMatch')}</div>
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
              <h3 className={css.pluginGroupTitle}>
                <Icon name={ENTRIES_SECTION_ICON} size={14} />
                <span>{t('about.entries')}</span>
              </h3>
              <ul className={css.entryList}>
                {(facts.facts?.entries ?? []).map((entry) => {
                  // AA round: the entry rows carry the same "various info" as
                  // the plugin rows below them — a title row (name + copy +
                  // the 入口 tag) plus a chip row (version / A1-A2 class /
                  // languages) plus the description row — reusing the plugin
                  // row classes, so no new CSS. An older host without the
                  // chip fields simply renders no chip row.
                  const languages = entry.languages ?? []
                  const hasChips = (entry.version !== undefined && entry.version !== '')
                    || (entry.distribution !== undefined && entry.distribution !== '')
                    || languages.length > 0
                  return (
                    <li key={entry.id} className={css.pluginItem}>
                      <div className={css.pluginHead}>
                        <span className={css.featureIcon}><Icon name={ENTRY_ICONS[entry.id] ?? 'layout'} size={18} /></span>
                        <div className={css.pluginText}>
                          <div className={css.featureTitle}>
                            <span className={css.featureTitleName}>{entry.id}</span>
                            <CopyButton value={entry.packageName} size={12} label={t('common.copy')} className={css.featureCopy} />
                            <span className={css.entryTag}>{t('about.entry.tag')}</span>
                          </div>
                          {hasChips
                            ? (
                              <div className={css.featureText}>
                                {entry.version !== undefined && entry.version !== ''
                                  ? <span className={css.countChip}>{entry.version}</span>
                                  : null}
                                {entry.distribution !== undefined && entry.distribution !== ''
                                  ? <span className={css.stackChip}>{entry.distribution === 'A2' ? t('about.class.a2') : t('about.class.a1')}</span>
                                  : null}
                                {languages.length > 0
                                  ? <span className={css.stackText} title={languages.join(' · ')}>{languages.join(' · ')}</span>
                                  : null}
                              </div>
                            )
                            : null}
                          {entry.description
                            ? <div className={css.featureDesc}>{entry.description}</div>
                            : null}
                        </div>
                        {/* The empty actions column keeps this row's text column
                            the same width as the plugin rows under it. */}
                        <div className={css.pluginActions} aria-hidden="true" />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
          : null}
        {grouped.map(group => (
          <div key={group.bucket}>
            <h3 className={css.pluginGroupTitle}>
              <Icon name={bucketIconOf(group.bucket)} size={14} />
              <span>{bucketTitleOf(group.bucket, t)}</span>
            </h3>
            <ul className={css.pluginList}>
              {group.items.map((plugin) => {
                // T round: only cordis-loadable parts are switchable; the
                // host-identity / library / bundle rows are read-only roster
                // facts (older hosts report no flag → switchable, the old
                // behavior).
                const switchable = plugin.switchable !== false
                return (
                  <li key={plugin.id} className={css.pluginItem}>
                    <div className={css.pluginHead}>
                      {/* X2 item 17: the category icon (layers = real coraek plugins only). */}
                      <span className={css.featureIcon}><Icon name={bucketIconOf(plugin.bucket ?? 'plugins')} size={18} /></span>
                      <div className={css.pluginText}>
                        {/* X2 items 11 + 16: the lock travels with the title (never in the
                            button cluster), and the copy icon sits right after the name.
                            X3: the copy button is a COMPACT ghost (the generic 34px bordered
                            .iconButton reads as a door in the 13px title line). */}
                        <div className={css.featureTitle}>
                          <span className={css.featureTitleName}>{displayName(plugin.packageName)}</span>
                          <CopyButton value={plugin.packageName} size={12} label={t('common.copy')} className={css.featureCopy} />
                          {plugin.locked ? <Icon name="lock" size={13} className={css.featureTitleLock} /> : null}
                        </div>
                        {/* N2 fix: the merged row was one undifferentiated line
                            ("TypeScript · CSS AEK home surface: …" — no separators,
                            chips jammed against the version). Now: version + A1/A2 +
                            languages read as distinct chips on ONE line, and the
                            (long, colon-carrying) description gets its own line
                            below — the same two-line rhythm as the row above it. */}
                        <div className={css.featureText}>
                          <span className={css.countChip}>{plugin.version}</span>
                          {plugin.distribution !== ''
                            ? <span className={css.stackChip}>{plugin.distribution === 'A2' ? t('about.class.a2') : t('about.class.a1')}</span>
                            : null}
                          {switchable ? null : <span className={css.stackChip}>{t('plugins.switch.readonly')}</span>}
                          {plugin.languages.length > 0
                            ? <span className={css.stackText} title={plugin.languages.join(' · ')}>{plugin.languages.join(' · ')}</span>
                            : null}
                        </div>
                        {plugin.description !== ''
                          ? <div className={css.featureDesc}>{plugin.description}</div>
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
                          buttons), so the grid no longer drifts on locked rows. */}
                      <div className={css.pluginActions}>
                        {switchable
                          ? <ToggleSwitch
                            checked={plugin.enabled}
                            locked={plugin.locked}
                            onChange={(next) =>{  requestToggle(plugin.id, next) }}
                            label={plugin.locked ? t('plugins.switch.locked.root') : (plugin.enabled ? t('plugins.switch.on') : t('plugins.switch.off'))}
                          />
                          : <span className={css.pluginSwitchSlot} aria-hidden="true" />}
                        {switchable
                          ? PLUGIN_ACTIONS.map(action => (
                            <button
                              key={action.id}
                              type="button"
                              className={css.pluginIconButton}
                              disabled={pending !== undefined}
                              onClick={() =>{  act(plugin.id, action.id) }}
                              title={t(action.labelKey)}
                              aria-label={`${t(action.labelKey)} · ${displayName(plugin.packageName)}`}
                            >
                              <Icon name={action.icon} size={18} />
                            </button>
                          ))
                          : <span aria-hidden="true" />}
                      </div>
                    </div>
                    <CapabilityTags caps={plugin.capabilities} />
                    {confirming === plugin.id
                      ? (
                        <div className={css.pluginConfirm} role="alertdialog" aria-label={t('plugins.confirm.ok')}>
                          <span className={css.pluginConfirmText}>{tf('plugins.confirm.text', { name: displayName(plugin.packageName) })}</span>
                          <span className={css.pluginConfirmActions}>
                            <button type="button" className={css.secondaryButton} onClick={() =>{  setConfirming(undefined) }}>
                              {t('plugins.confirm.cancel')}
                            </button>
                            <button
                              type="button"
                              className={cx(css.primaryButton, css.dangerButton)}
                              onClick={() => { setConfirming(undefined); toggle(plugin.id, false) }}
                            >
                              {t('plugins.confirm.ok')}
                            </button>
                          </span>
                        </div>
                      )
                      : null}
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
 * The release marker of the running slot (C round). `release.mjs` records
 * `{ currentTag, previousTag }` in the slot home on every release; the next
 * slot has no such file → null → the About row stays hidden there.
 * @returns the release state, or null when the slot records none.
 */
function useReleaseState(): { currentTag?: string; previousTag?: string } | null {
  const [state, setState] = useState<{ currentTag?: string; previousTag?: string } | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/aek/release-state', { headers: { accept: 'application/json' } })
      .then(response => response.ok ? response.json() : {})
      .then((data: unknown) => {
        if (!live) return
        const record = data as { currentTag?: unknown; previousTag?: unknown }
        if (typeof record.currentTag === 'string') {
          const previousTag = typeof record.previousTag === 'string' ? record.previousTag : undefined
          setState(previousTag === undefined
            ? { currentTag: record.currentTag }
            : { currentTag: record.currentTag, previousTag })
          return
        }
        setState(null)
      })
      .catch(() => {
        if (live) setState(null)
      })
    return () => {
      live = false
    }
  }, [])
  return state
}

/**
 * Render one install-mode label (S round three-way split). Old hosts that
 * still report the legacy two-way `dev | npm` degrade to the matching mode
 * label instead of showing a missing key.
 * @param kind - the install kind from the inventory snapshot.
 * @returns the localized label.
 */
function installKindLabel(kind: 'dev' | 'build' | 'global' | 'npm' | undefined): string {
  const { t } = useI18n()
  switch (kind) {
    case 'dev':
      return t('about.mode.dev')
    case 'build':
      return t('about.mode.build')
    case 'global':
      return t('about.mode.global')
    case 'npm':
      // Legacy host: an npm install is the package-manager mode.
      return t('about.mode.global')
    default:
      return '—'
  }
}

/** @returns the About page with the three entry points marked. */
export function AboutPanel({
  inventory, refreshSignal, compactPlugins = false,
}: { inventory: InventoryState; refreshSignal: number; compactPlugins?: boolean }) {
  const { t, tf } = useI18n()
  const facts = useConsoleFacts()
  const release = useReleaseState()

  // Sidebar-row refresh (Q round): re-read both the inventory and the facts.
  useEffect(() => {
    if (refreshSignal > 0) {
      facts.refresh()
      inventory.refresh()
    }
  }, [refreshSignal, facts.refresh, inventory.refresh])
  const caps = useCapabilities()
  const providers = caps.facts?.providers ?? []
  // BB round: the "runtime modes" topology line was removed at the user's
  // ruling (it read as noise next to an empty section). The external
  // capabilities section now exists ONLY when a real provider is listed;
  // an empty section renders nothing — not even its divider.
  const showExternalSection = providers.length > 0
  const snapshot = inventory.snapshot
  const plugins = snapshot?.packages.filter(pkg => pkg.group === 'plugin') ?? []
  // X2 items 9 + 10: the 入口 section moved INTO the 插件与程序 card
  // (PluginsPanel), and the base-environment list is gone (the base bucket of
  // the roster carries it now).
  // Classification + languages are scanned on the host (never hardcoded in
  // the client bundle); match them onto the inventory rows by package name.
  const stackByPackage = new Map(
    (facts.facts?.plugins ?? []).map(plugin => [plugin.packageName, plugin]),
  )

  return (
    <PanelCard>
      <div className={css.cardBody}>
        {inventory.error !== undefined
          ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{tf('about.error', { message: inventory.error })}</span></div>
          : null}
        {snapshot === undefined && inventory.error === undefined
          ? <div className={css.loadingState}>{t('about.loading')}</div>
          : null}

        {/* INSTALLATION FIRST. The user explicitly asked for this block at the
            very top instead of sandwiched between entries and package lists. */}
        <ul className={css.infoList}>
          <li className={css.infoRow}>
            <span className={css.infoLabel}>{t('about.install')}</span>
            <span className={css.infoValue}>{installKindLabel(snapshot?.installKind)}</span>
          </li>
          {/* C round: the version marker a shipped update actually shows — the
              release tag the current slot records (next slot: none, hidden). */}
          {release?.currentTag !== undefined
            ? <li className={css.infoRow}>
              <span className={css.infoLabel}>{t('about.version')}</span>
              <span className={css.infoValue}>
                <code className={css.countChip}>{release.currentTag}</code>
                {release.previousTag !== undefined
                  ? <span className={css.stackText}>{tf('about.versionPrevious', { tag: release.previousTag })}</span>
                  : null}
              </span>
            </li>
            : null}
          <li className={css.infoRow}>
            <span className={css.infoLabel}>{t('about.source')}</span>
            <span className={css.infoValue}>{snapshot?.source ?? '—'}</span>
          </li>
        </ul>

        {/* X5b: the install self-check moved to the /setup first-run wizard
            (Setup.tsx) — the About card was the wrong carrier (user ruling
            2026-11-16); no card here anymore. */}

        {/* AA round: the unconditional divider after the info block was
            removed — every section below carries its OWN leading divider
            (the plugin group, the external section), so two adjacent lines
            can never render (in compact mode the plugin section is skipped
            entirely, which left the two dividers stacked). */}
        {/* X2 item 9: the 入口 section now lives in the 插件与程序 card. */}
        {!compactPlugins ? (
          <>
            <div className={css.divider} />
            <h3 className={css.sectionTitle}>{t('about.group.plugin')}</h3>
            <div className={css.hint}>{t('about.stackHint')}</div>
            <ul className={css.packageList}>
              {plugins.map((pkg) => {
                const meta = stackByPackage.get(pkg.name)
                const languages = meta?.languages ?? []
                return (
                  <li key={pkg.name} className={css.packageRow}>
                    <span className={css.providerName}>{displayName(pkg.name)}</span>
                    <span className={css.countChip}>{pkg.version}</span>
                    {meta?.distribution
                      ? <span className={css.stackChip}>{meta.distribution === 'A2' ? t('about.class.a2') : t('about.class.a1')}</span>
                      : null}
                    {languages.length > 0
                      ? <span className={css.stackText} title={languages.join(' · ')}>{languages.join(' · ')}</span>
                      : null}
                    <span className={css.badge}>{installKindLabel(pkg.kind)}</span>
                  </li>
                )
              })}
            </ul>
            {plugins.length === 0 ? <div className={css.emptyState}>{t('about.empty')}</div> : null}
          </>
        ) : null}

        {/* X2 item 10: the base-environment list is gone — the roster's base
            bucket shows those packages with their category icon. */}
        {/* EXTERNAL capability providers: rendered ONLY when the host lists
            at least one ACTUALLY-external (isolate-topology, non-container)
            provider. A class ① capability the operator set to `share` runs
            in-process and is NOT an external capability, so its inert
            registration must not be listed here (Y9); AEK's own v3 runtime
            containers are filtered out host-side (AA round). The compliance
            line is host-rendered from the provider's own self-description —
            the client bundle carries no upstream facts. BB round: the neutral
            "runtime modes" topology line that kept this section alive when no
            provider existed was removed at the user's ruling (noise, no
            meaning when empty) — an empty section renders nothing. */}
        {showExternalSection ? (
          <>
            <div className={css.divider} />
            <h3 className={css.sectionTitle}>{t('about.external.title')}</h3>
            <div className={css.hint}>{t('about.external.hint')}</div>
            <ul className={css.packageList}>
              {providers.map(provider => (
                <li key={provider.id} className={css.capabilityRow}>
                  <div className={css.packageRow}>
                    <span className={css.providerName}>{displayName(provider.name)}</span>
                    <span className={css.countChip}>{provider.state}</span>
                    {provider.spdx !== null
                      ? <span className={css.stackChip} title={provider.spdx}>{provider.spdx}</span>
                      : null}
                    {provider.runtime !== undefined
                      ? <span className={css.countChip} title={t('about.external.runtimeIsolated')}>{provider.runtime.reason}</span>
                      : null}
                  </div>
                  <div className={css.capabilityLine}>{provider.compliance}</div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
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
  // M round: the 关于 page is deliberately empty for now — its content moved
  // to 插件与程序管理. The nav entry stays (the user may fill it later).
  // Every InfoPanelId member is handled above, so `panel` is narrowed to 'about' here.
  const { t } = useI18n()
  return (
    <PanelCard>
      <div className={css.cardBody}>
        <p className={css.hint}>{t('panel.aboutEmpty')}</p>
      </div>
    </PanelCard>
  )
}
