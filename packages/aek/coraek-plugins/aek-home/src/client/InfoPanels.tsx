/**
 * Settings / 插件管理 / About surfaces (2026-11-09 round).
 *
 * - Settings is now SCHEMA-DRIVEN: `settings-schema.ts` is the single source of
 *   truth for keys, ranges, defaults, labels and CSS variables. Adding a
 *   setting means adding one row there, not editing this component. Every
 *   numeric control is a slider PLUS a number box, kept in sync, and may have a
 *   negative range. The top search box filters the page's own settings.
 * - 插件管理 lists every plugin scanned by the host, with backend / CLI / MCP
 *   capability tags and restart / enable / disable actions.
 * - About marks `apps/web`, `apps/cli`, `apps/aek-desktop` as ENTRY POINTS.
 * - Every collection is an unordered `<ul>/<li>` (user rule).
 *
 * @module @cheezmil/aek-home/src/client/InfoPanels
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { useSettings } from './preferences.tsx'
import type { PrefValue } from './preferences.tsx'
import { coerce, SETTINGS_SCHEMA } from './settings-schema.ts'
import type { SettingField } from './settings-schema.ts'
import { css } from './styles.ts'
import { CapabilityTags, LoadingBar, PanelCard, PanelSearch, Spinner } from './ui-kit.tsx'
import type { InventoryState } from './useInventory.ts'
import { useConsoleFacts } from './useConsoleFacts.ts'

/** Panels handled here. */
export type InfoPanelId = 'plugins' | 'settings' | 'about'

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
}

/**
 * Render ONE schema field's control. The value is always coerced to the
 * declared range before it reaches an input, so a stale host value can never
 * break the slider / number box pair.
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
        <label className={css.settingToggleRow}>
          <input
            type="checkbox"
            className={css.settingToggle}
            checked={value === true}
            onChange={event => onChange(event.target.checked)}
          />
          <span className={css.settingToggleLabel}>{label}</span>
        </label>
        {hint}
      </>
    )
  }
  if (field.kind === 'range') {
    const numeric = typeof value === 'number' ? value : Number(value)
    const unit = field.unit ?? ''
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
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={numeric}
            aria-label={label}
            onChange={event => onChange(Number(event.target.value))}
          />
          <input
            type="number"
            className={css.numberBox}
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={numeric}
            aria-label={`${label} (${unit})`}
            onChange={event => onChange(coerce(field, event.target.value))}
          />
          <span className={css.unitLabel}>{unit}</span>
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

/** @returns the schema-driven settings page. */
function SettingsPanel() {
  const { t } = useI18n()
  const { prefs, set, setMany } = useSettings()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = SETTINGS_SCHEMA.filter((field) => {
    if (needle.length === 0) return true
    return [t(field.labelKey), field.key, field.group].join(' ').toLowerCase().includes(needle)
  })
  const groups: readonly SettingField['group'][] = ['sidebar', 'navigation', 'general']

  /** Restore every schema default in ONE host write. */
  const resetAll = (): void => {
    setMany(Object.fromEntries(SETTINGS_SCHEMA.map(field => [field.key, field.default])))
  }

  return (
    <PanelCard
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
      actions={<button type="button" className={css.iconButton} onClick={resetAll} title={t('settings.reset')} aria-label={t('settings.reset')}><Icon name="restore" size={16} /></button>}
    >
      <div className={css.cardBody}>
        <PanelSearch value={query} onChange={setQuery} placeholder={t('settings.panelSearch')} count={visible.length} />
        {groups.map((group) => {
          const rows = visible.filter(field => field.group === group)
          if (rows.length === 0) return null
          return (
            <section key={group} className={css.settingGroup}>
              <h3 className={css.sectionTitle}>{t(`settings.group.${group}`)}</h3>
              <ul className={css.settingList}>
                {rows.map(field => (
                  <li key={field.key} className={css.settingRow}>
                    <SettingControl
                      field={field}
                      value={coerce(field, prefs[field.key] ?? field.default)}
                      onChange={next => set(field.key, next)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {visible.length === 0
          ? <div className={css.emptyState}>{t('common.noMatch')}</div>
          : null}
      </div>
    </PanelCard>
  )
}

/** Host route that queues one plugin action (see `console.ts`). */
const PLUGIN_ACTION_API = '/api/aek/plugins/action'

/** @returns the plugin management page. */
function PluginsPanel() {
  const { t, tf } = useI18n()
  const facts = useConsoleFacts()
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState<string | undefined>(undefined)
  const needle = query.trim().toLowerCase()
  const plugins = (facts.facts?.plugins ?? []).filter((plugin) => {
    if (needle.length === 0) return true
    return [plugin.id, plugin.packageName, plugin.description, plugin.version].join(' ').toLowerCase().includes(needle)
  })

  /** @param id - plugin directory name. @param action - requested action. */
  const act = (id: string, action: 'restart' | 'enable' | 'disable'): void => {
    setPending(`${id}:${action}`)
    setNotice(undefined)
    void fetch(PLUGIN_ACTION_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
      .then(async response => await response.json() as { status?: string; message?: string })
      .then(data => setNotice(`${displayName(id)} · ${String(data.status ?? data.message ?? 'ok')}`))
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setPending(undefined))
  }

  return (
    <PanelCard
      title={t('plugins.title')}
      subtitle={t('plugins.subtitle')}
      actions={(
        <>
          {facts.loading ? <Spinner /> : null}
          <button type="button" className={css.iconButton} onClick={facts.refresh} title={t('common.refresh')} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
        </>
      )}
    >
      <LoadingBar active={facts.loading} />
      <div className={css.cardBody}>
        <PanelSearch value={query} onChange={setQuery} placeholder={t('plugins.search')} count={plugins.length} />
        <p className={css.hint}>{t('plugins.action.note')}</p>
        {notice !== undefined ? <p className={css.hint}>{notice}</p> : null}
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
                <div>
                  <div className={css.featureTitle}>{displayName(plugin.packageName)}</div>
                  <div className={css.featureText}>{plugin.version} · {plugin.description}</div>
                </div>
              </div>
              <CapabilityTags caps={plugin.capabilities} />
              <div className={css.pluginActions}>
                <button type="button" className={css.primaryButton} disabled={pending !== undefined} onClick={() => act(plugin.id, 'restart')}>{t('plugins.action.restart')}</button>
                <button type="button" className={css.primaryButton} disabled={pending !== undefined} onClick={() => act(plugin.id, 'enable')}>{t('plugins.action.enable')}</button>
                <button type="button" className={css.primaryButton} disabled={pending !== undefined} onClick={() => act(plugin.id, 'disable')}>{t('plugins.action.disable')}</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </PanelCard>
  )
}

/** @returns the About page with the three entry points marked. */
function AboutPanel({ inventory }: { inventory: InventoryState }) {
  const { t, tf } = useI18n()
  const facts = useConsoleFacts()
  const snapshot = inventory.snapshot
  const plugins = snapshot?.packages.filter(pkg => pkg.group === 'plugin') ?? []
  const base = snapshot?.packages.filter(pkg => pkg.group === 'base') ?? []
  const entryLabel: Record<string, string> = {
    web: t('about.entry.web'),
    cli: t('about.entry.cli'),
    'aek-desktop': t('about.entry.desktop'),
  }

  return (
    <PanelCard
      title={t('about.title')}
      actions={<button type="button" className={css.iconButton} onClick={inventory.refresh} title={t('common.refresh')} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>}
    >
      <div className={css.cardBody}>
        {inventory.error !== undefined
          ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{tf('about.error', { message: inventory.error })}</span></div>
          : null}
        {snapshot === undefined && inventory.error === undefined
          ? <div className={css.loadingState}>{t('about.loading')}</div>
          : null}

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
        <ul className={css.infoList}>
          <li className={css.infoRow}>
            <span className={css.infoLabel}>{t('about.install')}</span>
            <span className={css.infoValue}>{snapshot?.installKind === 'dev' ? t('about.dev') : t('about.npm')}</span>
          </li>
          <li className={css.infoRow}>
            <span className={css.infoLabel}>{t('about.source')}</span>
            <span className={css.infoValue}>{snapshot?.source ?? '—'}</span>
          </li>
        </ul>

        <div className={css.divider} />
        <h3 className={css.sectionTitle}>{t('about.group.plugin')}</h3>
        <ul className={css.packageList}>
          {plugins.map(pkg => (
            <li key={pkg.name} className={css.packageRow}>
              <span className={css.providerName}>{displayName(pkg.name)}</span>
              <span className={css.countChip}>{pkg.version}</span>
              <span className={css.badge}>{pkg.kind === 'dev' ? t('about.dev') : t('about.npm')}</span>
            </li>
          ))}
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
      </div>
    </PanelCard>
  )
}

/**
 * Dispatch to one informational surface.
 * @param props - panel id and inventory.
 * @returns the selected surface.
 */
export function InfoPanels({ panel, inventory }: InfoPanelsProps) {
  if (panel === 'plugins') return <PluginsPanel />
  if (panel === 'settings') return <SettingsPanel />
  return <AboutPanel inventory={inventory} />
}
