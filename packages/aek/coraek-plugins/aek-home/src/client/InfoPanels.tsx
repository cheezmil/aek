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
 *   pair always left one button as a no-op) plus a restart icon button.
 *   `aek-home` and `aek-websearch` are structural and render a locked switch.
 * - About marks `apps/web`, `apps/cli`, `apps/aek-desktop` as ENTRY POINTS.
 * - Every collection is an unordered `<ul>/<li>` (user rule). No progress
 *   bars: refresh states use `Spinner`.
 *
 * @module @cheezmil/aek-home/src/client/InfoPanels
 */
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { useAccessDraft, useDraftSettings, useSettings } from './preferences.tsx'
import type { PrefValue } from './preferences.tsx'
import { allSettingFields, coerce, SETTINGS_SCHEMA, WEBSEARCH_SETTINGS_SCHEMA } from './settings-schema.ts'
import type { SettingField } from './settings-schema.ts'
import { css, cx } from './styles.ts'
import { CapabilityTags, CopyButton, PanelCard, PanelSearch, Spinner, ToggleSwitch } from './ui-kit.tsx'
import type { InventoryState } from './useInventory.ts'
import { useConsoleFacts } from './useConsoleFacts.ts'
import { useCapabilities } from './useCapabilities.ts'

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
            onChange={event => onChange(Number(event.target.value))}
          />
          <input
            type="number"
            className={css.numberBox}
            min={min}
            max={max}
            step={field.step ?? 1}
            value={numeric}
            aria-label={`${label} (${unit})`}
            onChange={event => onChange(coerce(field, event.target.value))}
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
          onChange={event => onChange(event.target.value)}
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
        onChange={event => onChange(event.target.value)}
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
            onChange={event => accessStage({ allowlist: event.target.value })}
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
                  onChange={event => accessStage({ username: event.target.value })}
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
                  onChange={event => accessStage({ password: event.target.value })}
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
      .then(data => setNotice(data.ok === true ? t('permissions.opened') : String(data.reason ?? 'unknown')))
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setPending(false))
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
            <span className={css.featureIcon}><Icon name="layout" size={16} /></span>
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
    if (row === null || flashClass === undefined) return
    row.scrollIntoView({ block: 'center', behavior: 'instant' })
    row.classList.remove(flashClass)
    // Restart the animation even when the row was flashed seconds ago.
    void row.offsetWidth
    row.classList.add(flashClass)
  }

  useEffect(() => {
    if (open !== true || outsideClose !== true) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, outsideClose, onClose])

  if (open === false) return null

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
      {outsideClose === true
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
                    <button type="button" className={css.dirtyRowLabel} title={t('settings.dirty.locate')} onClick={() => locate('aek-home.access')}>
                      {t('settings.access.item')}
                    </button>
                    <span className={css.dirtyRowValue}>—</span>
                    <button
                      type="button"
                      className={css.dirtyRowAction}
                      title={t('settings.dirty.undo')}
                      aria-label={t('settings.dirty.undo')}
                      onClick={() => access.accessUndo()}
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
                    <button type="button" className={css.dirtyRowLabel} title={t('settings.dirty.locate')} onClick={() => locate(key)}>
                      {label}
                    </button>
                    <span className={css.dirtyRowValue}>{String(draftValues[key] ?? '')}</span>
                    <button
                      type="button"
                      className={css.dirtyRowAction}
                      title={t('settings.dirty.undo')}
                      aria-label={t('settings.dirty.undo')}
                      onClick={() => draftUndo(key)}
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
  return prefs?.['aek-home.dirtyPopoverOutsideClose'] === true
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
  const secondRailFields = visible.filter((field) => SECOND_RAIL_KEYS.has(field.key))
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
        value={coerce(field, (immediateKeys.has(field.key) ? (prefs?.[field.key] ?? field.default) : draftValues[field.key] ?? field.default))}
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
            count={totalDirty > 0 ? totalDirty : undefined}
            countAria={t('settings.dirty.title')}
            onCountClick={() => setPopoverOpen(open => !open)}
            condense
            condenseHold={totalDirty > 0}
          />
          <SettingsDirtyPopover open={popoverOpen && totalDirty > 0} onClose={() => setPopoverOpen(false)} withAccess />
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
                    ? <p className={css.noticeLine}><Icon name="check" size={14} />{t('settings.backupDone')}</p>
                    : null}
                  {restore.phase === 'restored'
                    ? <p className={css.noticeLine}><Icon name="check" size={14} />{t('settings.restored')}</p>
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
            count={dirtyKeys.length > 0 ? dirtyKeys.length : undefined}
            countAria={t('settings.dirty.title')}
            onCountClick={() => setPopoverOpen(open => !open)}
            condense
            condenseHold={dirtyKeys.length > 0}
          />
          <SettingsDirtyPopover open={popoverOpen && dirtyKeys.length > 0} onClose={() => setPopoverOpen(false)} withAccess={false} />
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
                      onChange={next => draftSet(field.key, next)}
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

/** @returns the plugin management page. */
export function PluginsPanel({ refreshSignal }: { refreshSignal: number }) {
  const { t, tf } = useI18n()
  const facts = useConsoleFacts()

  // Sidebar-row refresh (Q round): re-scan the plugin directory.
  useEffect(() => {
    if (refreshSignal > 0) facts.refresh()
  }, [refreshSignal, facts.refresh])
  const { prefs } = useSettings()
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | undefined>(undefined)
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
  const plugins = (facts.facts?.plugins ?? []).filter((plugin) => {
    if (needle.length === 0) return true
    return [plugin.id, plugin.packageName, plugin.description, plugin.version].join(' ').toLowerCase().includes(needle)
  })

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
      .then(data => setNotice(`${displayName(id)} · ${String(data.status ?? data.message ?? data.reason ?? 'ok')}`))
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)))
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
        setNotice(`${displayName(id)} · ${String(data.status ?? data.message ?? data.reason ?? 'ok')}`)
      })
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => {
        setPending(undefined)
        facts.refresh()
      })
  }

  return (
    <PanelCard>
      <div className={css.cardBody}>
        <PanelSearch value={query} onChange={setQuery} placeholder={t('plugins.search')} count={facts.loading ? undefined : plugins.length} />
        {notice !== undefined ? <p className={css.noticeLine}>{notice}</p> : null}
        {facts.error !== undefined
          ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{tf('about.error', { message: facts.error })}</span></div>
          : null}
        {plugins.length === 0 && !facts.loading
          ? <div className={css.emptyState}>{t('common.noMatch')}</div>
          : null}
        <ul className={css.pluginList}>
          {plugins.map(plugin => (
            <li key={plugin.id} className={css.pluginItem}>
              <div className={css.pluginHead}>
                <span className={css.featureIcon}><Icon name="layers" size={18} /></span>
                <div className={css.pluginText}>
                  <div className={css.featureTitle}>{displayName(plugin.packageName)}</div>
                  <div className={css.featureText}>{plugin.version} · {plugin.description}</div>
                </div>
                {/* Fixed three-column cluster (switch | lock slot | restart) so the
                    switch sits at the SAME x on every row. The lock slot is always
                    rendered: with an inline-flex cluster the locked rows carried one
                    extra child and the whole group slid left, which is exactly the
                    "排版错乱" the user saw on 2026-11-09. */}
                <div className={css.pluginActions}>
                  <ToggleSwitch
                    checked={plugin.enabled}
                    locked={plugin.locked}
                    onChange={next => requestToggle(plugin.id, next)}
                    label={plugin.locked ? t('plugins.switch.locked.root') : (plugin.enabled ? t('plugins.switch.on') : t('plugins.switch.off'))}
                  />
                  <span
                    className={css.pluginLockIcon}
                    title={plugin.locked ? t('plugins.switch.locked.root') : undefined}
                  >
                    {plugin.locked ? <Icon name="lock" size={14} /> : null}
                  </span>
                  {PLUGIN_ACTIONS.map(action => (
                    <button
                      key={action.id}
                      type="button"
                      className={css.pluginIconButton}
                      disabled={pending !== undefined}
                      onClick={() => act(plugin.id, action.id)}
                      title={t(action.labelKey)}
                      aria-label={`${t(action.labelKey)} · ${displayName(plugin.packageName)}`}
                    >
                      <Icon name={action.icon} size={18} />
                    </button>
                  ))}
                </div>
              </div>
              <CapabilityTags caps={plugin.capabilities} />
              {confirming === plugin.id
                ? (
                  <div className={css.pluginConfirm} role="alertdialog" aria-label={t('plugins.confirm.ok')}>
                    <span className={css.pluginConfirmText}>{tf('plugins.confirm.text', { name: displayName(plugin.packageName) })}</span>
                    <span className={css.pluginConfirmActions}>
                      <button type="button" className={css.secondaryButton} onClick={() => setConfirming(undefined)}>
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
          ))}
        </ul>
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
        if (typeof record?.currentTag === 'string') {
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

/** @returns the About page with the three entry points marked. */
export function AboutPanel({ inventory, refreshSignal }: { inventory: InventoryState; refreshSignal: number }) {
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
  // Selective class-① runtime-mode choices (id → 'share' | 'isolate'); the
  // host serves them with the capability registry, older hosts send none.
  const runtimeChoices = Object.values(caps.facts?.runtime?.choices ?? {})
  const sharedCount = runtimeChoices.filter(mode => mode === 'share').length
  const isolatedCount = runtimeChoices.length - sharedCount
  const showExternalSection = providers.length > 0 || runtimeChoices.length > 0
  const snapshot = inventory.snapshot
  const plugins = snapshot?.packages.filter(pkg => pkg.group === 'plugin') ?? []
  const base = snapshot?.packages.filter(pkg => pkg.group === 'base') ?? []
  const entryLabel: Record<string, string> = {
    web: t('about.entry.web'),
    cli: t('about.entry.cli'),
    'aek-desktop': t('about.entry.desktop'),
  }
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
            <span className={css.infoValue}>{snapshot?.installKind === 'dev' ? t('about.dev') : t('about.npm')}</span>
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

        <div className={css.divider} />
        <h3 className={css.sectionTitle}>{t('about.entries')}</h3>
        <ul className={css.entryList}>
          {(facts.facts?.entries ?? []).map(entry => (
            <li key={entry.id} className={css.entryRow}>
              <span className={css.entryIcon}><Icon name={entry.id === 'aek-desktop' ? 'layout' : (entry.id === 'cli' ? 'terminal' : 'activity')} size={16} /></span>
              <span className={css.entryName}>{entry.id}</span>
              <span className={css.entryTag}>{t('about.entry.tag')}</span>
              <span className={css.entryDesc}>{entryLabel[entry.id] ?? entry.description}</span>
            </li>
          ))}
        </ul>

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
                <span className={css.badge}>{pkg.kind === 'dev' ? t('about.dev') : t('about.npm')}</span>
              </li>
            )
          })}
        </ul>
        {plugins.length === 0 ? <div className={css.emptyState}>{t('about.empty')}</div> : null}

        <div className={css.divider} />
        <h3 className={css.sectionTitle}>{t('about.group.base')}</h3>
        <ul className={css.packageList}>
          {base.map(pkg => (
            <li key={pkg.name} className={css.packageRow}>
              <span className={css.providerName}>{displayName(pkg.name)}</span>
              <span className={css.countChip}>{pkg.version}</span>
              <span className={css.badge}>{pkg.kind === 'dev' ? t('about.dev') : t('about.npm')}</span>
            </li>
          ))}
        </ul>
        {base.length === 0 ? <div className={css.emptyState}>{t('about.empty')}</div> : null}

        {/* EXTERNAL capability providers: shown when the host reports at least
            one ACTUALLY-external (isolate-topology) provider, or when the
            operator has selective runtime-mode choices. The "external
            capabilities" title + "not part of AEK" hint only render when such
            a provider exists — a class ① capability the operator set to `share`
            runs in-process and is NOT an external capability, so its inert
            registration must not be listed under this heading (Y9). The
            "runtime modes" topology line stays (neutral, accurate). The
            compliance line is host-rendered from the provider's own
            self-description — the client bundle carries no upstream facts. */}
        {showExternalSection ? (
          <>
            <div className={css.divider} />
            {providers.length > 0 ? (
              <>
                <h3 className={css.sectionTitle}>{t('about.external.title')}</h3>
                <div className={css.hint}>{t('about.external.hint')}</div>
              </>
            ) : null}
            {runtimeChoices.length > 0
              ? <div className={css.hint}>{tf('about.external.runtimeChoices', { shared: sharedCount, isolated: isolatedCount })}</div>
              : null}
            {providers.length > 0 ? (
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
            ) : null}
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
export function InfoPanels({ panel, inventory, refreshSignal }: InfoPanelsProps) {
  // M round: the "插件管理" page no longer exists as its own nav entry — its
  // content (and the About content) is merged INTO the 插件与程序管理
  // (runtime) page, composed by Home. The panel id 'plugins' stays a valid
  // render target only through that composition.
  if (panel === 'plugins') return <PluginsPanel refreshSignal={refreshSignal} />
  if (panel === 'settings') return <SettingsPanel refreshSignal={refreshSignal} />
  if (panel === 'websearchSettings') return <WebSearchSettingsPanel refreshSignal={refreshSignal} />
  // M round: the 关于 page is deliberately empty for now — its content moved
  // to 插件与程序管理. The nav entry stays (the user may fill it later).
  if (panel === 'about') {
    const { t } = useI18n()
    return (
      <PanelCard>
        <div className={css.cardBody}>
          <p className={css.hint}>{t('panel.aboutEmpty')}</p>
        </div>
      </PanelCard>
    )
  }
  return <AboutPanel inventory={inventory} refreshSignal={refreshSignal} />
}
