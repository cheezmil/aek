/**
 * The web-search management panel: one provider table, with each provider row
 * expanding in place to manage its own key pool (C4: the separate "密钥管理"
 * card was removed — the list IS the entry point; clicking a provider's row
 * opens its keys).
 *
 * Security boundary (C4 + rule 13): the list shows masked tags only. A
 * plaintext literal is fetched ONLY when the user clicks the eye on one
 * exact row (`POST /api/aek/websearch/keys/reveal`), kept in no shared
 * cache, and hidden again on the next click or when the accordion closes.
 *
 * @module @cheezmil/aek-home/src/client/WebSearchPanel
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'
import { useKeyPool } from './useKeyPool.ts'
import type { ProviderStatus, WebsearchState } from './useWebsearchStatus.ts'

/** Props for {@link WebSearchPanel}. */
export interface WebSearchPanelProps {
  /** Shared live host state. */
  state: WebsearchState
}

/**
 * Render the provider table with the per-provider key accordion.
 * @param props - shared host state.
 * @returns the panel.
 */
export function WebSearchPanel({ state }: WebSearchPanelProps) {
  const { t, tf } = useI18n()
  const { status, error, pending, refresh, toggle } = state
  const loading = status === undefined && error === undefined

  // C4: only ONE provider's pool is open at a time; `undefined` = all closed.
  const [expanded, setExpanded] = useState<string | undefined>(undefined)
  const pool = useKeyPool(expanded)

  // Per-row reveal state: row id → the literal the user explicitly asked for.
  // Reset whenever the accordion changes target so nothing lingers.
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  useEffect(() => {
    setRevealed({})
  }, [expanded])

  // Add / inline-edit form state (scoped to the expanded provider).
  const [newKey, setNewKey] = useState('')
  const [editingId, setEditingId] = useState<number | undefined>(undefined)
  const [editValue, setEditValue] = useState('')
  // Local error slot for reveal failures (the pool hook owns the CRUD errors).
  const [revealError, setRevealError] = useState<string | undefined>(undefined)
  useEffect(() => {
    setRevealError(undefined)
  }, [expanded])

  /** Toggle the accordion for one provider; switching target also drops any
   *  in-flight inline edit so it can never apply to the wrong pool. */
  const toggleExpanded = (kind: string): void => {
    setExpanded(current => (current === kind ? undefined : kind))
    setEditingId(undefined)
    setEditValue('')
  }

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

  /** C4: the ONLY path that fetches a literal — an explicit per-row click. */
  const toggleReveal = (id: number): void => {
    if (revealed[id] !== undefined) {
      setRevealed((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      return
    }
    void pool.reveal(id)
      .then((plain) => {
        if (plain !== undefined) {
          setRevealed(current => ({ ...current, [id]: plain }))
        }
      })
      .catch((cause: unknown) => {
        setRevealError(messageOf(cause))
      })
  }

  /** @returns whether a row's literal is currently shown. */
  const isRevealed = (id: number): boolean => revealed[id] !== undefined

  return (
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
                      <th className={css.th} aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {status.providers.map((provider) => {
                      const open = expanded === provider.kind
                      return (
                        <ProviderRow
                          key={provider.kind}
                          provider={provider}
                          open={open}
                          onToggle={() => toggleExpanded(provider.kind)}
                          onToggleEnabled={() => toggle(provider.kind, !provider.enabled)}
                          enabledPending={pending === provider.kind}
                          t={t}
                        >
                          {open
                            ? (
                              <KeyPoolBody
                                pool={pool}
                                providerKind={provider.kind}
                                newKey={newKey}
                                onNewKey={setNewKey}
                                onAdd={submitNewKey}
                                editingId={editingId}
                                onEditStart={id => setEditingId(id)}
                                onEditCancel={() => { setEditingId(undefined); setEditValue('') }}
                                editValue={editValue}
                                onEditValue={setEditValue}
                                onEditSave={submitEdit}
                                revealed={revealed}
                                isRevealed={isRevealed}
                                onToggleReveal={toggleReveal}
                                onRemove={(id) => { if (globalThis.confirm?.(t('keys.deleteConfirm')) === true) pool.remove(id) }}
                                onSetDisabled={(id, disabled) => pool.setDisabled(id, disabled)}
                                revealError={revealError}
                                t={t}
                                tf={tf}
                              />
                            )
                            : null}
                        </ProviderRow>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {status.providers.length === 0
                ? <div className={css.emptyState}>{t('websearch.empty')}</div>
                : null}

              <p className={css.hint}>
                {t('websearch.config')} <span className={css.code}>{status.providersFile}</span>
              </p>
            </>
          )
          : null}
      </div>
    </section>
  )
}

/** One provider row + (when open) its key-pool body. */
interface ProviderRowProps {
  /** The provider facts. */
  provider: ProviderStatus
  /** Whether its key accordion is open. */
  open: boolean
  /** Open/close the accordion. */
  onToggle: () => void
  /** Flip the enabled switch. */
  onToggleEnabled: () => void
  /** Whether the enabled write is in flight. */
  enabledPending: boolean
  /** Translate. */
  t: (key: string) => string
  /** The accordion body, rendered inside the row's expanded region. */
  children: ReactNode
}

/** @param props - one expandable provider row. @returns the row pair. */
function ProviderRow({
  provider, open, onToggle, onToggleEnabled, enabledPending, t, children,
}: ProviderRowProps) {
  return (
    <>
      <tr className={cx(open && css.providerRowOpen)}>
        <td className={css.td}>
          <button
            type="button"
            role="switch"
            aria-checked={provider.enabled}
            aria-label={`${t('websearch.col.enabled')} ${provider.kind}`}
            className={cx(css.toggle, provider.enabled && css.toggleOn)}
            disabled={enabledPending}
            onClick={onToggleEnabled}
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
        <td className={css.td}>
          <button
            type="button"
            className={css.iconButton}
            onClick={onToggle}
            aria-expanded={open}
            title={t('websearch.manageKeys')}
            aria-label={t('websearch.manageKeys')}
          >
            <Icon name="chevronDown" size={16} className={cx(css.chevron, open && css.chevronOpen)} />
          </button>
        </td>
      </tr>
      {open
        ? <tr className={css.keyAccordionRow}><td className={css.td} colSpan={5}>{children}</td></tr>
        : null}
    </>
  )
}

/** The expanded key-pool body under one provider row. */
interface KeyPoolBodyProps {
  /** Live masked pool for the expanded provider. */
  pool: {
    entries: { id: number; masked: string; disabled: boolean; failures: number }[] | undefined
    error: string | undefined
    pending: boolean
    add: (key: string) => void
    update: (id: number, key: string) => void
    remove: (id: number) => void
    setDisabled: (id: number, disabled: boolean) => void
  }
  /** The provider kind this body belongs to. */
  providerKind: string
  /** New-key draft. */
  newKey: string
  /** Update the new-key draft. */
  onNewKey: (value: string) => void
  /** Commit the add form. */
  onAdd: () => void
  /** Row currently in inline-edit mode. */
  editingId: number | undefined
  /** Start inline editing a row. */
  onEditStart: (id: number) => void
  /** Cancel the inline edit. */
  onEditCancel: () => void
  /** Inline-edit draft. */
  editValue: string
  /** Update the inline-edit draft. */
  onEditValue: (value: string) => void
  /** Commit the inline edit. */
  onEditSave: (id: number) => void
  /** Explicitly revealed rows: id → literal (C4). */
  revealed: Record<number, string>
  /** @param id - row id. @returns whether its literal is shown. */
  isRevealed: (id: number) => boolean
  /** Toggle one row's literal (the only plaintext path). */
  onToggleReveal: (id: number) => void
  /** Remove one row (after the native confirm). */
  onRemove: (id: number) => void
  /** Enable / disable one row. */
  onSetDisabled: (id: number, disabled: boolean) => void
  /** Local error from the explicit reveal (C4); `undefined` when none. */
  revealError: string | undefined
  /** Translate. */
  t: (key: string) => string
  /** Translate with interpolation. */
  tf: (key: string, values: Readonly<Record<string, string | number>>) => string
}

/** @param props - one expanded provider's key body. @returns the accordion content. */
function KeyPoolBody({
  pool, providerKind, newKey, onNewKey, onAdd, editingId, onEditStart, onEditCancel,
  editValue, onEditValue, onEditSave, revealed, isRevealed, onToggleReveal, onRemove, onSetDisabled,
  revealError, t, tf,
}: KeyPoolBodyProps) {
  const entries = pool.entries
  const poolError = pool.error

  return (
    <div className={css.keyAccordion}>
      <header className={css.keyAccordionHead}>
        <div>
          <h3 className={css.keyAccordionTitle}>{t('keys.title')} · {providerKind}</h3>
          <p className={css.cardSubtitle}>{t('keys.subtitle')}</p>
        </div>
      </header>

      {poolError !== undefined
        ? (
          <div className={css.errorBanner}>
            <Icon name="alert" size={16} />
            <span>{tf('keys.error', { message: poolError })}</span>
          </div>
        )
        : null}

      {revealError !== undefined
        ? (
          <div className={css.errorBanner}>
            <Icon name="alert" size={16} />
            <span>{tf('keys.error', { message: revealError })}</span>
          </div>
        )
        : null}

      <form
        className={css.keyToolbar}
        onSubmit={(event) => { event.preventDefault(); onAdd() }}
      >
        <input
          className={css.keyInput}
          type="password"
          value={newKey}
          onChange={event => onNewKey(event.target.value)}
          placeholder={t('keys.placeholder')}
          aria-label={t('keys.placeholder')}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className={css.primaryButton}
          disabled={pool.pending || newKey.trim().length === 0}
        >
          <Icon name="plus" size={16} />
          {t('keys.add')}
        </button>
      </form>

      {entries === undefined
        ? <div className={css.loadingState}>{t('keys.loading')}</div>
        : null}
      {entries?.length === 0
        ? <div className={css.emptyState}>{t('keys.empty')}</div>
        : null}

      {entries !== undefined && entries.length > 0
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
                {entries.map(entry => (
                  <tr key={entry.id}>
                    <td className={css.td}>
                      <div className={css.keyCell}>
                        {editingId === entry.id
                          ? (
                            <input
                              className={css.keyEditInput}
                              type="password"
                              value={editValue}
                              onChange={event => onEditValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') { event.preventDefault(); onEditSave(entry.id) }
                                if (event.key === 'Escape') onEditCancel()
                              }}
                              placeholder={t('keys.editPlaceholder')}
                              aria-label={t('keys.editPlaceholder')}
                              autoComplete="off"
                              spellCheck={false}
                            />
                          )
                          : (
                            <>
                              {isRevealed(entry.id)
                                ? <span className={css.keyPlain}>{revealed[entry.id]}</span>
                                : <span className={css.keyMasked}>{entry.masked}</span>}
                              <button
                                type="button"
                                className={css.keyActionButton}
                                onClick={() => onToggleReveal(entry.id)}
                                title={isRevealed(entry.id) ? t('keys.hide') : t('keys.show')}
                                aria-label={isRevealed(entry.id) ? t('keys.hide') : t('keys.show')}
                              >
                                <Icon name={isRevealed(entry.id) ? 'eyeOff' : 'eye'} size={15} />
                              </button>
                            </>
                          )}
                      </div>
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
                                onClick={() => onEditSave(entry.id)}
                                title={t('keys.save')}
                                aria-label={t('keys.save')}
                                disabled={editValue.trim().length === 0}
                              >
                                <Icon name="check" size={15} />
                              </button>
                              <button
                                type="button"
                                className={css.keyActionButton}
                                onClick={onEditCancel}
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
                                onClick={() => onEditStart(entry.id)}
                                title={t('keys.edit')}
                                aria-label={t('keys.edit')}
                              >
                                <Icon name="edit" size={15} />
                              </button>
                              <button
                                type="button"
                                className={css.keyActionButton}
                                onClick={() => onSetDisabled(entry.id, !entry.disabled)}
                                title={entry.disabled ? t('keys.enable') : t('keys.disable')}
                                aria-label={entry.disabled ? t('keys.enable') : t('keys.disable')}
                                disabled={pool.pending}
                              >
                                <Icon name={entry.disabled ? 'check' : 'alert'} size={15} />
                              </button>
                              <button
                                type="button"
                                className={cx(css.keyActionButton, css.keyActionDanger)}
                                onClick={() => onRemove(entry.id)}
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

      <div className={css.note}>
        <Icon name="shield" size={18} className={css.noteIcon} />
        <span>{t('keys.note')}</span>
      </div>
    </div>
  )
}

/** @param cause - unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
