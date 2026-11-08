/**
 * Skill Manager / Prompt Manager surfaces (2026-11-09 fourth round).
 *
 * - Skill Manager lists every directory inside `packages/aek/coraek-plugins`
 *   by default; the roster is scanned on the host, not hardcoded here.
 * - The "插件目录" path box was REMOVED: the user does not want that element.
 * - Prompt Manager is intentionally EMPTY for now — the user said they will
 *   decide what goes there later. Do not auto-fill it with the plugin roster.
 * - Permissions is no longer a standalone panel; it moved into Settings.
 * - No progress bars anywhere: refresh states use the shared `Spinner`.
 * - All collections are unordered `<ul>/<li>`.
 *
 * @module @cheezmil/aek-home/src/client/ConsolePanels
 */
import { useState } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { css } from './styles.ts'
import { CapabilityTags, PanelCard, PanelSearch, Spinner } from './ui-kit.tsx'
import { displayName } from './InfoPanels.tsx'
import { useConsoleFacts } from './useConsoleFacts.ts'

/** @returns the Skill Manager panel over the real plugin directory. */
export function SkillsPanel() {
  const { t } = useI18n()
  const facts = useConsoleFacts()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const plugins = (facts.facts?.plugins ?? []).filter((plugin) => {
    if (needle.length === 0) return true
    return [plugin.id, plugin.packageName, plugin.description, plugin.version].join(' ').toLowerCase().includes(needle)
  })

  return (
    <PanelCard
      title={t('skills.title')}
      subtitle={t('skills.subtitle')}
      actions={(
        <>
          {facts.loading ? <Spinner /> : null}
          <button type="button" className={css.iconButton} onClick={facts.refresh} title={t('common.refresh')} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
        </>
      )}
    >
      <div className={css.cardBody}>
        <PanelSearch value={query} onChange={setQuery} placeholder={t('skills.search')} count={facts.loading ? undefined : plugins.length} />
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
                <span className={css.featureIcon}><Icon name="book" size={18} /></span>
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

/** @returns the intentionally empty Prompt Manager surface. */
export function PromptsPanel() {
  const { t } = useI18n()
  return (
    <PanelCard title={t('prompts.title')} subtitle={t('prompts.subtitle')}>
      <div className={css.cardBody}>
        <div className={css.emptyState}>{t('prompts.empty')}</div>
      </div>
    </PanelCard>
  )
}
