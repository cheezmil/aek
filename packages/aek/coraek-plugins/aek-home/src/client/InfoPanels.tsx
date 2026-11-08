/**
 * The informational surfaces behind the remaining menu entries.
 *
 * 2026-11-08 revision + polish pass:
 * - Settings holds the display preferences: auto-expand the sidebar on
 *   pointer hover (on by default) and the click-the-logo toggle (C10, on by
 *   default). Both persist on the HOST (C11), never in localStorage.
 * - About shows the live host inventory, split by ROLE into "AEK plugins" and
 *   "base environment". There is deliberately no "installed / registered"
 *   status column: the list is the answer, not a state badge.
 * - Plugins renders the AEK-plugin group of the same live inventory.
 * - C3: package names are shown WITHOUT their `@cheezmil/` scope — the scope
 *   is an internal build detail, not product copy, so it never renders in
 *   插件 / 关于.
 * - Explanatory notes / subtitles that restated how the data is read were
 *   removed; versions still come from the host at request time.
 *
 * @module @cheezmil/aek-home/src/client/InfoPanels
 */
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'
import type { InventoryPackage, InventoryState } from './useInventory.ts'

/** Panels handled here (runtime has its own panel, C5). */
export type InfoPanelId = 'plugins' | 'settings' | 'about'

/**
 * Display-only package name (C3): strip the `@cheezmil/` npm scope so the UI
 * shows `aek-home` instead of `@cheezmil/aek-home`. Names without a scope are
 * returned untouched.
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
  /** Current hover-to-expand preference. */
  hoverExpand: boolean
  /** Update the hover-to-expand preference. */
  onToggleHoverExpand: (next: boolean) => void
  /** Current click-the-logo toggle preference (C10). */
  logoToggle: boolean
  /** Update the click-the-logo toggle preference. */
  onToggleLogoToggle: (next: boolean) => void
}

/** @param label - row label. @param value - row value. @returns one info row. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={css.infoRow}>
      <span className={css.infoLabel}>{label}</span>
      <span className={css.infoValue}>{value}</span>
    </div>
  )
}

/** @param props - rows of one role group. @returns the version table. */
function PackageTable({ rows }: { rows: readonly InventoryPackage[] }) {
  const { t } = useI18n()
  return (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead>
          <tr>
            <th className={css.th}>{t('about.col.package')}</th>
            <th className={css.th}>{t('about.col.version')}</th>
            <th className={css.th}>{t('about.col.kind')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(pkg => (
            <tr key={pkg.name}>
              <td className={css.td}><span className={css.providerName}>{displayName(pkg.name)}</span></td>
              <td className={css.td}><span className={css.countChip}>{pkg.version}</span></td>
              <td className={css.td}>{pkg.kind === 'dev' ? t('about.dev') : t('about.npm')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** @param props - live inventory. @returns the AEK plugin roster. */
function PluginsPanel({ inventory }: { inventory: InventoryState }) {
  const { t, tf } = useI18n()
  const plugins = inventory.snapshot?.packages.filter(pkg => pkg.group === 'plugin') ?? []
  return (
    <section className={css.card}>
      <header className={css.cardHeader}>
        <div>
          <h2 className={css.cardTitle}>{t('plugins.title')}</h2>
          <p className={css.cardSubtitle}>{t('plugins.subtitle')}</p>
        </div>
        <span className={cx(css.badge, css.badgeAccent)}>{tf('plugins.count', { n: plugins.length })}</span>
      </header>
      <div className={css.cardBody}>
        {inventory.error !== undefined
          ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{tf('about.error', { message: inventory.error })}</span></div>
          : null}
        {inventory.snapshot === undefined && inventory.error === undefined
          ? <div className={css.loadingState}>{t('about.loading')}</div>
          : null}
        {inventory.snapshot !== undefined && plugins.length === 0
          ? <div className={css.emptyState}>{t('plugins.empty')}</div>
          : null}
        {plugins.length > 0
          ? (
            <div className={css.featureGrid}>
              {plugins.map(pkg => (
                <div className={css.featureItem} key={pkg.name}>
                  <span className={css.featureIcon}><Icon name="layers" size={18} /></span>
                  <div>
                    <div className={css.featureTitle}>
                      {displayName(pkg.name)}
                      <span className={css.badge}>{pkg.kind === 'dev' ? t('about.dev') : t('about.npm')}</span>
                    </div>
                    <div className={css.featureText}>v{pkg.version}</div>
                  </div>
                </div>
              ))}
            </div>
          )
          : null}
      </div>
    </section>
  )
}

/**
 * Props for {@link SettingsPanel}.
 */
interface SettingsPanelProps {
  /** Current hover-to-expand preference. */
  hoverExpand: boolean
  /** Update the hover-to-expand preference. */
  onToggleHoverExpand: (next: boolean) => void
  /** Current click-the-logo toggle preference (C10). */
  logoToggle: boolean
  /** Update the click-the-logo toggle preference. */
  onToggleLogoToggle: (next: boolean) => void
}

/** @param props - the two display preferences. @returns the settings card. */
function SettingsPanel({
  hoverExpand, onToggleHoverExpand, logoToggle, onToggleLogoToggle,
}: SettingsPanelProps) {
  const { t } = useI18n()
  return (
    <section className={css.card}>
      <header className={css.cardHeader}>
        <div>
          <h2 className={css.cardTitle}>{t('settings.title')}</h2>
          <p className={css.cardSubtitle}>{t('settings.subtitle')}</p>
        </div>
      </header>
      <div className={css.cardBody}>
        <label className={css.settingToggleRow}>
          <input
            type="checkbox"
            className={css.settingToggle}
            checked={hoverExpand}
            onChange={event => onToggleHoverExpand(event.target.checked)}
          />
          <span className={css.settingToggleLabel}>{t('settings.hover')}</span>
        </label>
        <p className={css.hint}>{t('settings.hoverHint')}</p>

        <div className={css.divider} />

        <label className={css.settingToggleRow}>
          <input
            type="checkbox"
            className={css.settingToggle}
            checked={logoToggle}
            onChange={event => onToggleLogoToggle(event.target.checked)}
          />
          <span className={css.settingToggleLabel}>{t('settings.logoToggle')}</span>
        </label>
        <p className={css.hint}>{t('settings.logoToggleHint')}</p>
      </div>
    </section>
  )
}

/** @param props - live inventory. @returns the grouped version card. */
function AboutPanel({ inventory }: { inventory: InventoryState }) {
  const { t, tf } = useI18n()
  const snapshot = inventory.snapshot
  const plugins = snapshot?.packages.filter(pkg => pkg.group === 'plugin') ?? []
  const base = snapshot?.packages.filter(pkg => pkg.group === 'base') ?? []
  return (
    <section className={css.card}>
      <header className={css.cardHeader}>
        <h2 className={css.cardTitle}>{t('about.title')}</h2>
        <button
          type="button"
          className={css.iconButton}
          onClick={inventory.refresh}
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
        >
          <Icon name="refresh" size={16} />
        </button>
      </header>
      <div className={css.cardBody}>
        {inventory.error !== undefined
          ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{tf('about.error', { message: inventory.error })}</span></div>
          : null}
        {snapshot === undefined && inventory.error === undefined
          ? <div className={css.loadingState}>{t('about.loading')}</div>
          : null}
        {snapshot !== undefined
          ? (
            <>
              <div className={css.infoList}>
                <InfoRow
                  label={t('about.install')}
                  value={snapshot.installKind === 'dev' ? t('about.dev') : t('about.npm')}
                />
                <InfoRow label={t('about.source')} value={snapshot.source} />
              </div>
              <div className={css.divider} />
              <h3 className={css.sectionTitle}>{t('about.group.plugin')}</h3>
              {plugins.length > 0
                ? <PackageTable rows={plugins} />
                : <div className={css.emptyState}>{t('about.empty')}</div>}
              <div className={css.divider} />
              <h3 className={css.sectionTitle}>{t('about.group.base')}</h3>
              {base.length > 0
                ? <PackageTable rows={base} />
                : <div className={css.emptyState}>{t('about.empty')}</div>}
            </>
          )
          : null}
      </div>
    </section>
  )
}

/**
 * Dispatch to one informational surface.
 * @param props - panel id, inventory and display preference.
 * @returns the selected surface.
 */
export function InfoPanels({
  panel, inventory, hoverExpand, onToggleHoverExpand, logoToggle, onToggleLogoToggle,
}: InfoPanelsProps) {
  if (panel === 'plugins') return <PluginsPanel inventory={inventory} />
  if (panel === 'settings') {
    return (
      <SettingsPanel
        hoverExpand={hoverExpand}
        onToggleHoverExpand={onToggleHoverExpand}
        logoToggle={logoToggle}
        onToggleLogoToggle={onToggleLogoToggle}
      />
    )
  }
  return <AboutPanel inventory={inventory} />
}
