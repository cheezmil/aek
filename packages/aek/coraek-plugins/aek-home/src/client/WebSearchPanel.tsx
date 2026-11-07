/**
 * The web-search management panel: provider table plus full key-pool CRUD.
 *
 * The provider table keeps the shared `useWebsearchStatus` hook as its single
 * source of truth. The new key manager talks only to
 * `/api/aek/websearch/keys`: it sends a literal on create/update and receives
 * masked tags only. Plaintext is never kept in state after submit and never
 * appears in an error message.
 *
 * @module @cheezmil/aek-home/src/client/WebSearchPanel
 */
import { useState } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'
import { useKeyPool } from './useKeyPool.ts'
import type { WebsearchState } from './useWebsearchStatus.ts'

/** Props for {@link WebSearchPanel}. */
export interface WebSearchPanelProps {
  /** Shared live host state. */
  state: WebsearchState
}

/**
 * Render the provider table and the key-pool manager.
 * @param props - shared host state.
 * @returns the panel.
 */
export function WebSearchPanel({ state }: WebSearchPanelProps) {
  const { t, tf } = useI18n()
  const { status, error, pending, refresh, toggle } = state
  const loading = status === undefined && error === undefined

  const [chosen, setChosen] = useState('')
  const [newKey, setNewKey] = useState('')
  const [editingId, setEditingId] = useState<number | undefined>(undefined)
  const [editValue, setEditValue] = useState('')

  const kinds = status?.providers.map(provider => provider.kind) ?? []
  const kind = kinds.includes(chosen) ? chosen : kinds[0]
  const pool = useKeyPool(kind)

  /** Commit the add form. */
  const submitNewKey = (): void => {
    if (newKey.trim().length === 0) return
    pool.add(newKey)
    setNewKey('')
  }

  /** Commit an inline edit for one row. */
  const submitEdit = (id: number): void => {
    if (editValue.trim().length === 0) return
    pool.update(id, editValue)
    setEditingId(undefined)
    setEditValue('')
  }

  return (
    <>
      <section className={css.card}>
        <header className={css.cardHeader}>
          <div>
            <h2 className={css.cardTitle}>{t('websearch.title')}</h2>
            <p className={css.cardSubtitle}>{t('websearch.subtitle')}</p>
          </div>
          <button type="button" className={css.iconButton} onClick={refresh} title={t('common.refresh')} aria-label={t('common.refresh')}>
            <Icon name="refresh" size={16} className={loading ? css.spinning : undefined} />
          </button>
        </header>

        <div className={css.cardBody}>
          {error !== undefined
            ? (
              <div className={css.errorBanner}>
                <Icon name="alert" size={16} />
                <span>{tf('websearch.error', { message: error })}</span>
              </div>
            )
            : null}

          {loading ? <div className={css.loadingState}>{t('websearch.loading')}</div> : null}

          {status !== undefined
            ? (
              <>
                <div className={css.tableWrap}>
                  <table className={css.table}>
                    <thead>
                      <tr>
                        <th className={css.th}>{t('websearch.col.enabled')}</th>
                        <th className={css.th}>{t('websearch.col.provider')}</th>
                        <th className={css.th}>{t('websearch.col.keys')}</th>
                        <th className={css.th}>{t('websearch.col.status')}</th>
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
                              aria-label={`${t('websearch.col.enabled')} ${provider.kind}`}
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
                                  {provider.hasPool ? t('websearch.pool') : t('websearch.noPool')}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className={css.td}>
                            <span className={cx(css.countChip, provider.keyCount === undefined && css.chipOff)}>
                              {provider.keyCount === undefined
                                ? (provider.hasPool ? '—' : t('websearch.noPool'))
                                : String(provider.keyCount)}
                            </span>
                          </td>
                          <td className={css.td}>
                            <span className={cx(css.badge, provider.enabled && css.badgeSuccess)}>
                              <Icon name={provider.enabled ? 'check' : 'alert'} size={12} />
                              {provider.enabled ? t('common.enabled') : t('common.disabled')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {status.providers.length === 0
                  ? <div className={css.emptyState}>{t('websearch.empty')}</div>
                  : null}

                <p className={css.hint}>
                  {t('websearch.config')} <span className={css.code}>{status.providersFile}</span>
                </p>

                <div className={css.divider} />

                <div className={css.note}>
                  <Icon name="shield" size={18} className={css.noteIcon} />
                  <span>{t('websearch.note')}</span>
                </div>
              </>
            )
            : null}
        </div>
      </section>

      <section className={css.card}>
        <header className={css.cardHeader}>
          <div>
            <h2 className={css.cardTitle}>{t('keys.title')}</h2>
            <p className={css.cardSubtitle}>{t('keys.subtitle')}</p>
          </div>
          <button
            type="button"
            className={css.iconButton}
            onClick={pool.refresh}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
          >
            <Icon name="refresh" size={16} />
          </button>
        </header>

        <div className={css.cardBody}>
          {pool.error !== undefined
            ? (
              <div className={css.errorBanner}>
                <Icon name="alert" size={16} />
                <span>{tf('keys.error', { message: pool.error })}</span>
              </div>
            )
            : null}

          <form
            className={css.keyToolbar}
            onSubmit={(event) => { event.preventDefault(); submitNewKey() }}
          >
            <select
              className={css.keySelect}
              value={kind ?? ''}
              onChange={(event) => { setChosen(event.target.value); setEditingId(undefined) }}
              aria-label={t('keys.provider')}
              disabled={kind === undefined}
            >
              {kinds.map(item => <option value={item} key={item}>{item}</option>)}
            </select>
            <input
              className={css.keyInput}
              type="password"
              value={newKey}
              onChange={event => setNewKey(event.target.value)}
              placeholder={t('keys.placeholder')}
              aria-label={t('keys.placeholder')}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className={css.primaryButton}
              disabled={pool.pending || kind === undefined || newKey.trim().length === 0}
            >
              <Icon name="plus" size={16} />
              {t('keys.add')}
            </button>
          </form>

          {pool.entries === undefined
            ? <div className={css.loadingState}>{t('keys.loading')}</div>
            : null}
          {pool.entries?.length === 0
            ? <div className={css.emptyState}>{t('keys.empty')}</div>
            : null}

          {pool.entries !== undefined && pool.entries.length > 0
            ? (
              <div className={css.tableWrap}>
                <table className={css.table}>
                  <thead>
                    <tr>
                      <th className={css.th}>{t('keys.col.key')}</th>
                      <th className={css.th}>{t('keys.col.state')}</th>
                      <th className={css.th}>{t('keys.col.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.entries.map(entry => (
                      <tr key={entry.id}>
                        <td className={css.td}>
                          {editingId === entry.id
                            ? (
                              <input
                                className={css.keyEditInput}
                                type="password"
                                value={editValue}
                                onChange={event => setEditValue(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') { event.preventDefault(); submitEdit(entry.id) }
                                  if (event.key === 'Escape') setEditingId(undefined)
                                }}
                                placeholder={t('keys.editPlaceholder')}
                                aria-label={t('keys.editPlaceholder')}
                                autoComplete="off"
                                spellCheck={false}
                              />
                            )
                            : <span className={css.keyMasked}>{entry.masked}</span>}
                        </td>
                        <td className={css.td}>
                          <span className={cx(css.badge, !entry.disabled && css.badgeSuccess)}>
                            {entry.disabled ? t('common.disabled') : t('common.enabled')}
                          </span>
                          {entry.failures > 0
                            ? <span className={css.hint}> {tf('keys.failures', { n: entry.failures })}</span>
                            : null}
                        </td>
                        <td className={css.td}>
                          <div className={css.keyActions}>
                            {editingId === entry.id
                              ? (
                                <>
                                  <button
                                    type="button"
                                    className={css.keyActionButton}
                                    onClick={() => submitEdit(entry.id)}
                                    title={t('keys.save')}
                                    aria-label={t('keys.save')}
                                    disabled={editValue.trim().length === 0}
                                  >
                                    <Icon name="check" size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    className={css.keyActionButton}
                                    onClick={() => { setEditingId(undefined); setEditValue('') }}
                                    title={t('keys.cancel')}
                                    aria-label={t('keys.cancel')}
                                  >
                                    <Icon name="close" size={15} />
                                  </button>
                                </>
                              )
                              : (
                                <>
                                  <button
                                    type="button"
                                    className={css.keyActionButton}
                                    onClick={() => { setEditingId(entry.id); setEditValue('') }}
                                    title={t('keys.edit')}
                                    aria-label={t('keys.edit')}
                                  >
                                    <Icon name="edit" size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    className={css.keyActionButton}
                                    onClick={() => pool.setDisabled(entry.id, !entry.disabled)}
                                    title={entry.disabled ? t('keys.enable') : t('keys.disable')}
                                    aria-label={entry.disabled ? t('keys.enable') : t('keys.disable')}
                                    disabled={pool.pending}
                                  >
                                    <Icon name={entry.disabled ? 'check' : 'alert'} size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    className={cx(css.keyActionButton, css.keyActionDanger)}
                                    onClick={() => {
                                      if (globalThis.confirm?.(t('keys.deleteConfirm')) === true) pool.remove(entry.id)
                                    }}
                                    title={t('keys.delete')}
                                    aria-label={t('keys.delete')}
                                    disabled={pool.pending}
                                  >
                                    <Icon name="trash" size={15} />
                                  </button>
                                </>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : null}

          <div className={css.divider} />
          <div className={css.note}>
            <Icon name="shield" size={18} className={css.noteIcon} />
            <span>{t('keys.note')}</span>
          </div>
        </div>
      </section>
    </>
  )
}
