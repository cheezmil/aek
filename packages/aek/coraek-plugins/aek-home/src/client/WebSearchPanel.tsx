/**
 * The web-search management panel: the provider table with a real enabled
 * toggle and key-pool facts. It owns no configuration state of its own — the
 * host file is the truth, so every read and write goes through the shared
 * `useWebsearchStatus` hook.
 *
 * @module @cheezmil/aek-home/src/client/WebSearchPanel
 */
import { Icon } from './Icons.tsx'
import { css, cx } from './styles.ts'
import type { WebsearchState } from './useWebsearchStatus.ts'

/** Props for {@link WebSearchPanel}. */
export interface WebSearchPanelProps {
  /** Shared live host state. */
  state: WebsearchState
}

/**
 * Render the provider table and its feedback states.
 * @param props - shared host state.
 * @returns the panel.
 */
export function WebSearchPanel({ state }: WebSearchPanelProps) {
  const { status, error, pending, refresh, toggle } = state
  const loading = status === undefined && error === undefined

  return (
    <section className={css.card}>
      <header className={css.cardHeader}>
        <div>
          <h2 className={css.cardTitle}>搜索提供商</h2>
          <p className={css.cardSubtitle}>启用开关直接写回宿主的 providers.yml；密钥数来自加密 key pool</p>
        </div>
        <button type="button" className={css.iconButton} onClick={refresh} title="刷新" aria-label="刷新">
          <Icon name="refresh" size={16} className={loading ? css.spinning : undefined} />
        </button>
      </header>

      <div className={css.cardBody}>
        {error !== undefined
          ? (
            <div className={css.errorBanner}>
              <Icon name="alert" size={16} />
              <span>操作失败：{error}</span>
            </div>
          )
          : null}

        {loading ? <div className={css.loadingState}>正在读取宿主配置…</div> : null}

        {status !== undefined
          ? (
            <>
              <div className={css.tableWrap}>
                <table className={css.table}>
                  <thead>
                    <tr>
                      <th className={css.th}>启用</th>
                      <th className={css.th}>提供商</th>
                      <th className={css.th}>密钥数</th>
                      <th className={css.th}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.providers.map(provider => (
                      <tr key={provider.kind}>
                        <td className={css.td}>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={provider.enabled}
                            aria-label={`启用 ${provider.kind}`}
                            className={cx(css.toggle, provider.enabled && css.toggleOn)}
                            disabled={pending === provider.kind}
                            onClick={() => toggle(provider.kind, !provider.enabled)}
                          >
                            <span className={css.toggleKnob} />
                          </button>
                        </td>
                        <td className={css.td}>
                          <div className={css.providerCell}>
                            <span className={css.providerIcon}><Icon name="search" size={16} /></span>
                            <div>
                              <div className={css.providerName}>{provider.kind}</div>
                              <div className={css.providerMeta}>
                                {provider.hasPool ? '已配置密钥池' : '无密钥池文件'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={css.td}>
                          <span className={cx(css.countChip, provider.keyCount === undefined && css.chipOff)}>
                            {provider.keyCount === undefined
                              ? (provider.hasPool ? '—' : '无')
                              : String(provider.keyCount)}
                          </span>
                        </td>
                        <td className={css.td}>
                          <span className={cx(css.badge, provider.enabled && css.badgeSuccess)}>
                            <Icon name={provider.enabled ? 'check' : 'alert'} size={12} />
                            {provider.enabled ? '已启用' : '已停用'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {status.providers.length === 0
                ? <div className={css.emptyState}>宿主没有报告任何提供商</div>
                : null}

              <p className={css.hint}>
                配置文件 <span className={css.code}>{status.providersFile}</span>
              </p>

              <div className={css.divider} />

              <div className={css.note}>
                <Icon name="shield" size={18} className={css.noteIcon} />
                <span>
                  开关会立即写入宿主的 providers.yml。密钥保存在加密池中，本面板只显示数量，
                  不读取也不展示密钥内容；刷新页面会重新以宿主文件为准。
                </span>
              </div>
            </>
          )
          : null}
      </div>
    </section>
  )
}
