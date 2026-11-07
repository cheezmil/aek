/**
 * The informational surfaces behind the remaining menu entries: the AEK
 * plugin roster, the runtime/settings view, and the about page. They read the
 * same host snapshot as the overview so paths and counts stay truthful.
 *
 * @module @cheezmil/aek-home/src/client/InfoPanels
 */
import { Icon } from './Icons.tsx'
import type { IconName } from './Icons.tsx'
import { css, cx } from './styles.ts'
import type { WebsearchState } from './useWebsearchStatus.ts'

/** Panels handled here (the other two have dedicated components). */
export type InfoPanelId = 'plugins' | 'settings' | 'about'

/** Props for {@link InfoPanels}. */
export interface InfoPanelsProps {
  /** Which informational surface to render. */
  panel: InfoPanelId
  /** Shared live host state. */
  state: WebsearchState
}

/** One plugin tile. */
interface PluginEntry {
  /** Display name. */
  name: string
  /** Package id. */
  pkg: string
  /** What it does. */
  text: string
  /** Leading icon. */
  icon: IconName
  /** Small status label. */
  tag: string
}

/** The AEK plugin roster as mounted by the web profile bundle. */
const PLUGINS: readonly PluginEntry[] = [
  {
    name: 'coraek', pkg: '@cheezmil/coraek', icon: 'layers',
    text: '身份层、Cordis 类型统一入口与 aek CLI 的家', tag: '基础',
  },
  {
    name: 'aek-websearch', pkg: '@cheezmil/aek-websearch', icon: 'search',
    text: '多提供商搜索（Tavily / Exa）+ 本面板使用的管理 API', tag: '能力',
  },
  {
    name: 'aek-home', pkg: '@cheezmil/aek-home', icon: 'dashboard',
    text: '接管 #root 的 React 应用外壳，也就是当前管理面板', tag: '界面',
  },
  {
    name: 'aek-web-bundle', pkg: '@cheezmil/aek-web-bundle', icon: 'plugins',
    text: 'web profile 的 bundle 层，一次注册上面三个插件', tag: '装配',
  },
]

/** The declared frontend stack, shown on the about page. */
const STACK: readonly string[] = [
  'React', 'Vite', 'TypeScript', 'lightningcss', 'CSS Modules', 'Cordis',
]

/** @param label - row label. @param value - row value. @returns one info row. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={css.infoRow}>
      <span className={css.infoLabel}>{label}</span>
      <span className={css.infoValue}>{value}</span>
    </div>
  )
}

/** @param props - plugin roster surface. @returns the plugins card. */
function PluginsPanel() {
  return (
    <section className={css.card}>
      <header className={css.cardHeader}>
        <div>
          <h2 className={css.cardTitle}>已注册插件</h2>
          <p className={css.cardSubtitle}>web profile 通过 cordis.patch.yml 挂载的 AEK 插件</p>
        </div>
        <span className={cx(css.badge, css.badgeAccent)}>4 个</span>
      </header>
      <div className={css.cardBody}>
        <div className={css.featureGrid}>
          {PLUGINS.map(entry => (
            <div className={css.featureItem} key={entry.pkg}>
              <span className={css.featureIcon}><Icon name={entry.icon} size={18} /></span>
              <div>
                <div className={css.featureTitle}>
                  {entry.name}
                  <span className={css.badge}>{entry.tag}</span>
                </div>
                <div className={css.featureText}>{entry.pkg}</div>
                <div className={css.featureText}>{entry.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className={css.divider} />
        <div className={css.note}>
          <Icon name="activity" size={18} className={css.noteIcon} />
          <span>
            这份清单描述 web profile 的装配结构。运行时的真实插件清单接口尚未接入，
            因此此处不声称是从宿主动态读取的。
          </span>
        </div>
      </div>
    </section>
  )
}

/** @param props - settings surface. @returns the settings card. */
function SettingsPanel({ state }: { state: WebsearchState }) {
  return (
    <section className={css.card}>
      <header className={css.cardHeader}>
        <div>
          <h2 className={css.cardTitle}>运行环境</h2>
          <p className={css.cardSubtitle}>只读展示；修改请通过宿主配置或 aek CLI</p>
        </div>
        <span className={cx(css.badge, css.badgeSuccess)}>只读</span>
      </header>
      <div className={css.cardBody}>
        <div className={css.infoList}>
          <InfoRow label="界面入口" value="aek web（AEK 自己的命令）" />
          <InfoRow label="前端形态" value="apps/web + aek-home（React 根）" />
          <InfoRow label="配置目录" value={state.status?.aekHome ?? '读取中…'} />
          <InfoRow label="搜索配置" value={state.status?.providersFile ?? '读取中…'} />
          <InfoRow label="管理 API" value="/api/aek/websearch" />
          <InfoRow label="样式管线" value="CSS Modules → lightningcss 编译并注入" />
        </div>
        <div className={css.divider} />
        <div className={css.note}>
          <Icon name="alert" size={18} className={css.noteIcon} />
          <span>
            配置目录由宿主的数据层决定（homedir()/.aek），不是环境变量 AEK_HOME；
            页面显示的一定是真实被读取的那份文件。
          </span>
        </div>
      </div>
    </section>
  )
}

/** @returns the about card. */
function AboutPanel() {
  return (
    <>
      <section className={css.card}>
        <header className={css.cardHeader}>
          <div>
            <h2 className={css.cardTitle}>关于 AEK</h2>
            <p className={css.cardSubtitle}>Agent Enhance Kit · 一次性分叉自 deepseek-harness</p>
          </div>
          <span className={cx(css.badge, css.badgeAccent)}>
            <Icon name="sparkles" size={12} />
            本地控制台
          </span>
        </header>
        <div className={css.cardBody}>
          <p className={cx(css.hint, css.hintFlush)}>
            AEK 保留 dsh 的 Cordis 运行时架构，在其上建立 aek 插件体系；web profile
            关闭了整套 dsh UI，只由 aek-home 接管页面根节点。这个控制台就是这个根。
          </p>
          <h3 className={css.sectionTitle}>前端技术栈</h3>
          <div className={css.stackList}>
            {STACK.map(item => <span className={css.stackItem} key={item}>{item}</span>)}
          </div>
          <div className={css.divider} />
          <div className={css.infoList}>
            <InfoRow label="样式方案" value="CSS Modules + lightningcss，零运行时" />
            <InfoRow label="不使用" value="Tailwind / PostCSS 插件 / 预处理器 / 组件库" />
            <InfoRow label="图标" value="内联 SVG（形状参考 Lucide，ISC License）" />
            <InfoRow label="设计参考" value="prime-ui（MIT）、gends（CSS Modules tokens）" />
            <InfoRow label="数据接口" value="GET / POST /api/aek/websearch" />
          </div>
        </div>
      </section>
      <p className={css.hint}>
        技术栈由静态门禁 <span className={css.code}>verify:web-stack</span> 强制校验，
        任何 Tailwind / PostCSS / 预处理器依赖都会让门禁失败。
      </p>
    </>
  )
}

/**
 * Dispatch to one informational surface.
 * @param props - panel id and host state.
 * @returns the selected surface.
 */
export function InfoPanels({ panel, state }: InfoPanelsProps) {
  if (panel === 'plugins') return <PluginsPanel />
  if (panel === 'settings') return <SettingsPanel state={state} />
  return <AboutPanel />
}
