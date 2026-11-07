/**
 * The AEK console application root. The dsh shell is not mounted in the AEK
 * web profile, so this surface owns the whole app root: a left navigation rail,
 * a top bar and a content column that switches between the overview, the
 * web-search admin table and the informational panels.
 *
 * All host facts flow through one `useWebsearchStatus` hook instance so the
 * sidebar badge, the overview stats and the provider table never disagree.
 *
 * @module @cheezmil/aek-home/src/client/Home
 */
import { useState } from 'react'
import { Icon } from './Icons.tsx'
import { InfoPanels } from './InfoPanels.tsx'
import { OverviewPanel } from './OverviewPanel.tsx'
import { Sidebar } from './Sidebar.tsx'
import type { PanelId } from './Sidebar.tsx'
import { css } from './styles.ts'
import { WebSearchPanel } from './WebSearchPanel.tsx'
import type { WebsearchState } from './useWebsearchStatus.ts'
import { useWebsearchStatus } from './useWebsearchStatus.ts'

/** Header copy for each panel. */
interface PanelMeta {
  /** Small uppercase kicker. */
  eyebrow: string
  /** Page heading. */
  title: string
  /** One-line explanation. */
  subtitle: string
}

/** Static header copy, keyed by panel. */
const META: Record<PanelId, PanelMeta> = {
  overview: { eyebrow: '工作台', title: '概览', subtitle: '本地实例的运行状态与快捷入口' },
  websearch: { eyebrow: '工作台 / Web Search', title: 'Web Search', subtitle: '管理多提供商搜索与密钥池状态' },
  plugins: { eyebrow: '管理 / 插件', title: '插件', subtitle: 'web profile 装配的 AEK 插件' },
  settings: { eyebrow: '管理 / 设置', title: '设置', subtitle: '运行环境与数据位置（只读）' },
  about: { eyebrow: '帮助 / 关于', title: '关于', subtitle: '技术栈与开源借鉴' },
}

/**
 * Props kept for API compatibility with earlier aek-home releases; the
 * console navigates internally and needs no external callback.
 */
export interface AekHomeProps {
  /** Optional advance callback (unused by the console). */
  onContinue?: (() => void) | undefined
}

/**
 * Select the content surface for the active panel.
 * @param panel - active panel id.
 * @param state - shared host state.
 * @param onOpen - navigation callback.
 * @returns the content surface.
 */
function renderPanel(panel: PanelId, state: WebsearchState, onOpen: (id: PanelId) => void) {
  switch (panel) {
    case 'overview':
      return <OverviewPanel state={state} onOpen={onOpen} />
    case 'websearch':
      return <WebSearchPanel state={state} />
    default:
      return <InfoPanels panel={panel} state={state} />
  }
}

/**
 * Render the AEK console.
 * @param _props - retained for API compatibility.
 * @returns the application root.
 */
export function AekHome(_props: AekHomeProps) {
  const [panel, setPanel] = useState<PanelId>('overview')
  const [collapsed, setCollapsed] = useState(false)
  const state = useWebsearchStatus()
  const meta = META[panel]

  return (
    <div className={css.app}>
      <Sidebar
        active={panel}
        onSelect={setPanel}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(value => !value)}
        providerCount={state.status?.providers.length}
      />

      <div className={css.main}>
        <header className={css.topbar}>
          <div className={css.breadcrumb}>
            <span>工作台</span>
            <Icon name="chevronRight" size={14} className={css.breadcrumbSep} />
            <span className={css.breadcrumbCurrent}>{meta.title}</span>
          </div>
          <div className={css.topbarActions}>
            <span className={css.topbarBadge}><Icon name="server" size={14} /> 本地实例</span>
            <button
              type="button"
              className={css.iconButton}
              onClick={state.refresh}
              title="刷新数据"
              aria-label="刷新数据"
            >
              <Icon name="refresh" size={16} className={state.status === undefined ? css.spinning : undefined} />
            </button>
          </div>
        </header>

        <main className={css.content}>
          <div className={css.pageHeader}>
            <p className={css.pageEyebrow}>{meta.eyebrow}</p>
            <h1 className={css.pageTitle}>{meta.title}</h1>
            <p className={css.pageSubtitle}>{meta.subtitle}</p>
          </div>
          {renderPanel(panel, state, setPanel)}
        </main>
      </div>
    </div>
  )
}
