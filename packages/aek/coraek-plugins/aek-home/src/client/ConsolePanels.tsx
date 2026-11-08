/**
 * Skill Manager / Prompt Manager / Permissions panels (2026-11-09 round).
 *
 * - Both managers list EVERY directory inside `packages/aek/coraek-plugins`
 *   by default; the roster is scanned on the host, not hardcoded here.
 * - Permissions detects the OS from host facts and guides the user to the
 *   correct privacy pane. On macOS no API can GRANT Accessibility (verified
 *   with aekws + Electron docs), so the action opens the pane where AEK and
 *   AEK Next are enabled by name.
 * - All collections are unordered `<ul>/<li>`.
 *
 * @module @cheezmil/aek-home/src/client/ConsolePanels
 */
import { useState } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'
import { CapabilityTags, CopyButton, LoadingBar, PanelCard, PanelSearch, Spinner } from './ui-kit.tsx'
import { displayName } from './InfoPanels.tsx'
import { useConsoleFacts } from './useConsoleFacts.ts'

/** Which manager is being rendered. */
export type ManagerKind = 'skills' | 'prompts'

/**
 * A manager surface over the real plugin directory.
 * @param props.kind - skills or prompts (changes copy + icon only).
 * @returns the panel.
 */
export function ManagerPanel({ kind }: { kind: ManagerKind }) {
  const { t } = useI18n()
  const facts = useConsoleFacts()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const plugins = (facts.facts?.plugins ?? []).filter((plugin) => {
    if (needle.length === 0) return true
    return [plugin.id, plugin.packageName, plugin.description, plugin.version].join(' ').toLowerCase().includes(needle)
  })
  const prefix = kind === 'skills' ? 'skills' : 'prompts'
  const directory = 'packages/aek/coraek-plugins'

  return (
    <PanelCard
      title={t(`${prefix}.title`)}
      subtitle={t(`${prefix}.subtitle`)}
      actions={(
        <>
          {facts.loading ? <Spinner /> : null}
          <button type="button" className={css.iconButton} onClick={facts.refresh} title={t('common.refresh')} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
        </>
      )}
    >
      <LoadingBar active={facts.loading} />
      <div className={css.cardBody}>
        <div className={css.pathBox}>
          <span className={css.pathLabel}>{t('managers.path')}</span>
          <code className={css.pathValue}>{directory}</code>
          <CopyButton value={facts.facts?.pluginsDir ?? directory} label={t('managers.copyPath')} />
        </div>
        <PanelSearch value={query} onChange={setQuery} placeholder={t(`${prefix}.search`)} count={plugins.length} />
        {facts.error !== undefined
          ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{facts.error}</span></div>
          : null}
        {plugins.length === 0 && !facts.loading
          ? <div className={css.emptyState}>{t('managers.empty')}</div>
          : null}
        <ul className={css.pluginList}>
          {plugins.map(plugin => (
            <li key={plugin.id} className={css.pluginItem}>
              <div className={css.pluginHead}>
                <span className={css.featureIcon}><Icon name={kind === 'skills' ? 'book' : 'sparkles'} size={18} /></span>
                <div>
                  <div className={css.featureTitle}>{displayName(plugin.packageName)}</div>
                  <div className={css.featureText}>{t('managers.version')} {plugin.version} · {plugin.description}</div>
                </div>
              </div>
              <CapabilityTags caps={plugin.capabilities} />
            </li>
          ))}
        </ul>
      </div>
    </PanelCard>
  )
}

/** @returns the Skill Manager panel. */
export function SkillsPanel() {
  return <ManagerPanel kind="skills" />
}

/** @returns the Prompt Manager panel. */
export function PromptsPanel() {
  return <ManagerPanel kind="prompts" />
}

/** Host route for the user-initiated "open privacy settings" action. */
const PERMISSIONS_OPEN_API = '/api/aek/permissions/open'

/** @returns the Permissions panel. */
export function PermissionsPanel() {
  const { t } = useI18n()
  const facts = useConsoleFacts()
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const isMac = facts.facts?.platform === 'darwin'
  const noteKey = facts.facts?.permissions.noteKey ?? 'permissions.note.other'
  const bundles = facts.facts?.permissions.bundles ?? []

  /** Open the OS privacy pane (an explicit, user-initiated action). */
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
    <PanelCard
      title={t('permissions.title')}
      subtitle={t('permissions.subtitle')}
      actions={(
        <>
          {facts.loading ? <Spinner /> : null}
          <button type="button" className={css.iconButton} onClick={facts.refresh} title={t('common.refresh')} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
        </>
      )}
    >
      <LoadingBar active={facts.loading} />
      <div className={css.cardBody}>
        <ul className={css.infoList}>
          <li className={css.infoRow}>
            <span className={css.infoLabel}>{t('permissions.platform')}</span>
            <span className={css.infoValue}>{facts.facts === undefined ? t('common.loading') : `${facts.facts.platform} / ${facts.facts.arch}`}</span>
          </li>
          <li className={css.infoRow}>
            <span className={css.infoLabel}>{t('permissions.accessibility')}</span>
            <span className={css.infoValue}>{isMac ? t('permissions.status.unknown') : '—'}</span>
          </li>
        </ul>

        <div className={css.heroNote}>
          <span className={css.noteIcon}><Icon name="shield" size={16} /></span>
          <p>{t(noteKey)}</p>
        </div>

        <h3 className={css.sectionTitle}>{t('permissions.bundles')}</h3>
        <ul className={css.permList}>
          {bundles.map(bundle => (
            <li key={bundle.id} className={css.permRow}>
              <span className={cx(css.featureIcon, css.permIcon)}><Icon name="layout" size={16} /></span>
              <span className={css.permName}>{bundle.name}.app</span>
              <code className={css.pathValue}>{bundle.id}</code>
              <CopyButton value={bundle.id} label={t('common.copy')} />
            </li>
          ))}
        </ul>

        <div className={css.divider} />
        <button
          type="button"
          className={css.primaryButton}
          disabled={pending || !isMac}
          onClick={openPane}
        >
          {pending ? <Spinner /> : null}
          {t('permissions.open')}
        </button>
        {notice !== undefined ? <p className={css.hint}>{notice}</p> : null}
      </div>
    </PanelCard>
  )
}
