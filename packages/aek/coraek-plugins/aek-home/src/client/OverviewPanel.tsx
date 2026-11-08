/**
 * The console landing panel: a brand hero, live host facts and shortcuts into
 * the rest of the console. All numbers come from the shared web-search status
 * hook, so nothing here is a hard-coded placeholder. All copy comes from the
 * i18n dictionary so the footer language switch affects this page too.
 *
 * @module @cheezmil/aek-home/src/client/OverviewPanel
 */
import { BrandMark, Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import type { PanelId } from './Sidebar.tsx'
import { css, cx } from './styles.ts'
import { RuntimeModeCard } from './RuntimeModeCard.tsx'
import { useRuntimeMode } from './useRuntimeMode.ts'
import type { WebsearchState } from './useWebsearchStatus.ts'

/** One shortcut tile. */
interface QuickLink {
  /** Target panel. */
  id: PanelId
  /** i18n key of the tile heading. */
  titleKey: string
  /** i18n key of the one-line explanation. */
  textKey: string
  /** Leading icon. */
  icon: IconName
}

/** Shortcut tiles, in display order. */
const QUICK_LINKS: readonly QuickLink[] = [
  { id: 'websearch', titleKey: 'panel.websearch', textKey: 'quick.websearch', icon: 'search' },
  { id: 'plugins', titleKey: 'panel.plugins', textKey: 'quick.plugins', icon: 'plugins' },
  { id: 'settings', titleKey: 'panel.settings', textKey: 'quick.settings', icon: 'settings' },
  { id: 'about', titleKey: 'panel.about', textKey: 'quick.about', icon: 'about' },
]

/** Props for {@link OverviewPanel}. */
export interface OverviewPanelProps {
  /** Live host facts. */
  state: WebsearchState
  /** Navigate to another panel. */
  onOpen: (id: PanelId) => void
}

/** @param value - a number not yet loaded. @returns a display string. */
function numberOrDash(value: number | undefined): string {
  return value === undefined ? '—' : String(value)
}

/**
 * Render the landing panel.
 * @param props - host state and navigation.
 * @returns the overview surface.
 */
export function OverviewPanel({ state, onOpen }: OverviewPanelProps) {
  const { t, tf } = useI18n()
  const providers = state.status?.providers ?? []
  const enabled = providers.filter(provider => provider.enabled).length
  const keys = providers.reduce((sum, provider) => sum + (provider.keyCount ?? 0), 0)
  const pending = t('common.loading')
  const runtime = useRuntimeMode()

  return (
    <>
      <section className={css.hero}>
        <BrandMark size={84} className={css.heroMark} />
        <div className={css.heroContent}>
          <h2 className={css.heroTitle}>{t('overview.heroTitle')}</h2>
          <p className={css.heroText}>{t('overview.heroText')}</p>
          <div className={css.heroActions}>
            <button type="button" className={css.primaryButton} onClick={() => onOpen('websearch')}>
              <Icon name="search" size={16} />
              {t('overview.openWebsearch')}
            </button>
            <button type="button" className={css.secondaryButton} onClick={() => onOpen('plugins')}>
              <Icon name="layers" size={16} />
              {t('overview.viewPlugins')}
            </button>
          </div>
        </div>
      </section>

      <h2 className={css.sectionTitle}>{t('overview.stats')}</h2>
      <div className={css.statGrid}>
        <div className={css.statCard}>
          <span className={css.statIcon}><Icon name="search" size={20} /></span>
          <div className={css.statBody}>
            <div className={css.statLabel}>{t('stat.providers')}</div>
            <div className={css.statValue}>{numberOrDash(state.status === undefined ? undefined : providers.length)}</div>
            <div className={css.statHint}>
              {state.status === undefined ? pending : tf('stat.providersHint', { n: enabled })}
            </div>
          </div>
        </div>
        <div className={css.statCard}>
          <span className={css.statIcon}><Icon name="key" size={20} /></span>
          <div className={css.statBody}>
            <div className={css.statLabel}>{t('stat.keys')}</div>
            <div className={css.statValue}>{numberOrDash(state.status === undefined ? undefined : keys)}</div>
            <div className={css.statHint}>{t('stat.keysHint')}</div>
          </div>
        </div>
        <div className={css.statCard}>
          <span className={css.statIcon}><Icon name="server" size={20} /></span>
          <div className={css.statBody}>
            <div className={css.statLabel}>{t('stat.home')}</div>
            <div className={cx(css.statValue, css.statValueSmall)}>
              {state.status?.aekHome ?? pending}
            </div>
            <div className={css.statHint}>{t('stat.homeHint')}</div>
          </div>
        </div>
      </div>

      <h2 className={css.sectionTitle}>{t('overview.quick')}</h2>
      <div className={css.quickGrid}>
        {QUICK_LINKS.map(link => (
          <button
            key={link.id}
            type="button"
            className={css.quickCard}
            onClick={() => onOpen(link.id)}
          >
            <span className={css.quickIcon}><Icon name={link.icon} size={18} /></span>
            <span className={css.quickBody}>
              <span className={css.quickTitle}>{t(link.titleKey)}</span>
              <span className={css.quickText}>{t(link.textKey)}</span>
            </span>
            <span className={css.quickArrow}><Icon name="arrowRight" size={16} /></span>
          </button>
        ))}
      </div>

      <p className={css.hint}>
        {t('overview.apiHint')} <span className={css.code}>GET /api/aek/websearch</span> ·{' '}
        <span className={css.code}>@cheezmil/aek-websearch/admin</span>
      </p>

      <RuntimeModeCard state={runtime} />
    </>
  )
}
