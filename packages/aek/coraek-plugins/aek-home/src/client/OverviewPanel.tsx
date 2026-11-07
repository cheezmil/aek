/**
 * The console landing panel: a brand hero, live host facts and shortcuts into
 * the rest of the console. All numbers come from the shared web-search status
 * hook, so nothing here is a hard-coded placeholder.
 *
 * @module @cheezmil/aek-home/src/client/OverviewPanel
 */
import { BrandMark, Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import type { PanelId } from './Sidebar.tsx'
import { css, cx } from './styles.ts'
import type { WebsearchState } from './useWebsearchStatus.ts'

/** One shortcut tile. */
interface QuickLink {
  /** Target panel. */
  id: PanelId
  /** Tile heading. */
  title: string
  /** One-line explanation. */
  text: string
  /** Leading icon. */
  icon: IconName
}

/** Shortcut tiles, in display order. */
const QUICK_LINKS: readonly QuickLink[] = [
  { id: 'websearch', title: 'Web Search', text: '管理搜索提供商与密钥池', icon: 'search' },
  { id: 'plugins', title: '插件', text: '查看已注册的 AEK 插件', icon: 'plugins' },
  { id: 'settings', title: '设置', text: '运行环境与数据位置', icon: 'settings' },
  { id: 'about', title: '关于', text: '技术栈与开源借鉴', icon: 'about' },
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
  const providers = state.status?.providers ?? []
  const enabled = providers.filter(provider => provider.enabled).length
  const keys = providers.reduce((sum, provider) => sum + (provider.keyCount ?? 0), 0)

  return (
    <>
      <section className={css.hero}>
        <BrandMark size={84} className={css.heroMark} />
        <div className={css.heroContent}>
          <h2 className={css.heroTitle}>Hello, AEK</h2>
          <p className={css.heroText}>
            Agent Enhance Kit 管理面板。这里集中展示本地实例的运行状态、搜索提供商与插件信息；
            所有数据都来自宿主 API，刷新后以配置文件为准。
          </p>
          <div className={css.heroActions}>
            <button type="button" className={css.primaryButton} onClick={() => onOpen('websearch')}>
              <Icon name="search" size={16} />
              打开 Web Search
            </button>
            <button type="button" className={css.secondaryButton} onClick={() => onOpen('plugins')}>
              <Icon name="layers" size={16} />
              查看插件
            </button>
          </div>
        </div>
      </section>

      <h2 className={css.sectionTitle}>运行概况</h2>
      <div className={css.statGrid}>
        <div className={css.statCard}>
          <span className={css.statIcon}><Icon name="search" size={20} /></span>
          <div className={css.statBody}>
            <div className={css.statLabel}>搜索提供商</div>
            <div className={css.statValue}>{numberOrDash(state.status === undefined ? undefined : providers.length)}</div>
            <div className={css.statHint}>已启用 {numberOrDash(state.status === undefined ? undefined : enabled)} 个</div>
          </div>
        </div>
        <div className={css.statCard}>
          <span className={css.statIcon}><Icon name="key" size={20} /></span>
          <div className={css.statBody}>
            <div className={css.statLabel}>密钥池条目</div>
            <div className={css.statValue}>{numberOrDash(state.status === undefined ? undefined : keys)}</div>
            <div className={css.statHint}>来自加密 key pool</div>
          </div>
        </div>
        <div className={css.statCard}>
          <span className={css.statIcon}><Icon name="server" size={20} /></span>
          <div className={css.statBody}>
            <div className={css.statLabel}>配置目录</div>
            <div className={cx(css.statValue, css.statValueSmall)}>
              {state.status?.aekHome ?? '读取中…'}
            </div>
            <div className={css.statHint}>宿主实际读取的位置</div>
          </div>
        </div>
      </div>

      <h2 className={css.sectionTitle}>快捷入口</h2>
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
              <span className={css.quickTitle}>{link.title}</span>
              <span className={css.quickText}>{link.text}</span>
            </span>
            <span className={css.quickArrow}><Icon name="arrowRight" size={16} /></span>
          </button>
        ))}
      </div>

      <p className={css.hint}>
        数据接口 <span className={css.code}>GET /api/aek/websearch</span> · 由{' '}
        <span className={css.code}>@cheezmil/aek-websearch/admin</span> 提供
      </p>
    </>
  )
}
