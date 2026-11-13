/**
 * The web-search management panel.
 *
 * R1–R7 / R24 (2026-11-09):
 * - R7  a search box at the TOP filters providers and (inside an open pool)
 *       key rows, and highlights the matched text. Clearing restores all.
 * - R2  the add form is a tall <textarea>: one API key per line, imported in
 *       ONE host request.
 * - R3  an eye-all button reveals / hides every row at once.
 * - R4  every row has a copy button EVEN WHILE MASKED. It resolves the
 *       literal through the same explicit reveal channel on click and writes
 *       it straight to the clipboard — the value is never rendered.
 * - R5  deletion opens an in-app confirmation dialog naming the target;
 *       cancel performs no write at all.
 * - R1  a disabled row states WHY (`manual` / `balance` / `invalid` / `auto`).
 * - R6  deletion is a soft delete; the recycle bin supports restore and
 *       permanent purge, with the host-supplied retention window.
 * - R24 every collection here is an unordered `<ul>/<li>`; no tables, no <ol>.
 *
 * Security boundary (C4 + rule 13): the list shows masked tags only. A
 * plaintext literal is fetched ONLY when the user clicks an eye or a copy
 * button (`POST /api/aek/websearch/keys/reveal`). The agent never calls it.
 *
 * @module @cheezmil/aek-home/src/client/WebSearchPanel
 */
import { useEffect, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { formatDisplayPath, parsePathStyle } from './paths.ts'
import { css, cx } from './styles.ts'
import { CopyButton, PanelSearch, Spinner } from './ui-kit.tsx'
import { PREF_KEYS, oneOf, parseBoolean, usePref } from './preferences.tsx'
import { useWebsearchRanking } from './useWebsearchRanking.ts'
import type { FreeFilter, ProviderMeta } from './useWebsearchRanking.ts'
import { useKeyPool } from './useKeyPool.ts'
import type { DisableReason, KeyPoolEntry, KeyPoolState, RecycleEntry } from './useKeyPool.ts'
import type { ProviderStatus, WebsearchState } from './useWebsearchStatus.ts'
import type { ConsoleFactsState } from './useConsoleFacts.ts'

/** The two legal first-level values, shared by the preference parser. */
const FREE_TIER_VALUES: readonly FreeFilter[] = ['yes', 'no']
const parseFreeTier = oneOf(FREE_TIER_VALUES)

/**
 * Parse + clamp the ranking TTL setting (hours, 1–168).
 * @param raw - untrusted host value. @returns a valid hour count, or undefined.
 */
function parseTtlHours(raw: unknown): number | undefined {
  const numeric = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(numeric)) return undefined
  return Math.min(168, Math.max(1, Math.round(numeric)))
}

/** Props for {@link WebSearchPanel}. */
export interface WebSearchPanelProps {
  /** Shared live host state. */
  state: WebsearchState
  /**
   * Q round: how many sidebar "refresh this page" clicks are pending.
   * `> 0` forces a fresh status read AND a forced ranking re-fetch.
   */
  refreshSignal: number
  /** Host facts (home dir + platform) for the path display-style setting. */
  facts: ConsoleFactsState
}

/** One pending confirmation (soft delete or permanent purge). */
interface Confirmation {
  /** Which write the dialog would perform. */
  kind: 'delete' | 'purge'
  /** Row id (live key id or recycle id). */
  id: number
  /** Masked tag shown in the dialog. */
  masked: string
}

/**
 * Render the provider list with the per-provider key accordion.
 * @param props - shared host state.
 * @returns the panel.
 */
export function WebSearchPanel({ state, refreshSignal, facts }: WebSearchPanelProps) {
  const { t, tf, locale } = useI18n()
  const { status, disabled, error, pending, refresh, toggle } = state
  const loading = status === undefined && error === undefined && !disabled

  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  // C4: only ONE provider's pool is open at a time; `undefined` = all closed.
  const [expanded, setExpanded] = useState<string | undefined>(undefined)
  const pool = useKeyPool(expanded)

  // Level 1 is mandatory and exclusive ("yes" by default); level 2 is a
  // multi-select. All three live in the host data root, never localStorage.
  const [freeTier, setFreeTier] = usePref<FreeFilter>(PREF_KEYS.websearchFreeTier, 'yes', parseFreeTier)
  const [reqPhone, setReqPhone] = usePref(PREF_KEYS.websearchPhone, false, parseBoolean)
  const [reqCard, setReqCard] = usePref(PREF_KEYS.websearchCard, false, parseBoolean)
  const [filtersOpen, setFiltersOpen] = useState(true)
  // Q round: the refresh interval is a user setting (default 24 h), and the
  // sidebar refresh icon forces a fresh read (`force=1` bypasses caches).
  const [rankingTtlHours] = usePref(PREF_KEYS.websearchRankingTtlHours, 24, parseTtlHours)
  const [pathStyle] = usePref(PREF_KEYS.pathStyle, 'abbreviated', parsePathStyle)
  const ranking = useWebsearchRanking(
    { free: freeTier, phone: reqPhone, card: reqCard },
    { ttlHours: rankingTtlHours, forceSignal: refreshSignal },
  )

  // Sidebar-row refresh (Q round): re-read the status; the ranking part is
  // driven by the force signal above.
  useEffect(() => {
    if (refreshSignal > 0) refresh()
  }, [refreshSignal, refresh])

  // Explicitly revealed rows: id → literal. Reset whenever the accordion
  // changes target so nothing lingers across providers.
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  const [allRevealed, setAllRevealed] = useState(false)
  // Multi-line add / inline-edit state (scoped to the expanded provider).
  const [newKeys, setNewKeys] = useState('')
  const [editingId, setEditingId] = useState<number | undefined>(undefined)
  const [editValue, setEditValue] = useState('')
  const [revealError, setRevealError] = useState<string | undefined>(undefined)
  const [confirmation, setConfirmation] = useState<Confirmation | undefined>(undefined)
  useEffect(() => {
    setRevealed({})
    setAllRevealed(false)
    setNewKeys('')
    setRevealError(undefined)
    setEditingId(undefined)
    setEditValue('')
    setConfirmation(undefined)
  }, [expanded])

  const providers = (status?.providers ?? []).filter((provider) => {
    if (needle.length === 0) return true
    return provider.kind.toLowerCase().includes(needle)
      || t('websearch.pool').toLowerCase().includes(needle)
      || t('common.enabled').toLowerCase().includes(needle)
      || t('common.disabled').toLowerCase().includes(needle)
  })
  const batchCount = newKeys.split(/\r?\n/u).map(line => line.trim()).filter(line => line.length > 0).length

  /** Open/close one provider's accordion; switching drops any in-flight edit. */
  const toggleExpanded = (kind: string): void => {
    setExpanded(current => (current === kind ? undefined : kind))
  }

  /** R2: commit every non-empty line in one host request. */
  const submitBatch = (): void => {
    const keys = newKeys.split(/\r?\n/u).map(line => line.trim()).filter(line => line.length > 0)
    if (keys.length === 0) return
    pool.addMany(keys)
    setNewKeys('')
  }

  /** Commit an inline edit for one row. */
  const submitEdit = (id: number): void => {
    if (editValue.trim().length === 0) return
    pool.update(id, editValue)
    setEditingId(undefined)
    setEditValue('')
  }

  /** C4: the ONLY path that fetches one literal — an explicit per-row click. */
  const toggleReveal = (id: number): void => {
    if (revealed[id] !== undefined) {
      setRevealed((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setAllRevealed(false)
      return
    }
    void pool.reveal(id)
      .then((plain) => {
        if (plain !== undefined) setRevealed(current => ({ ...current, [id]: plain }))
      })
      .catch((cause: unknown) => {
        setRevealError(messageOf(cause))
      })
  }

  /** R3: one explicit click reveals every row, one click hides them again. */
  const toggleRevealAll = (): void => {
    if (allRevealed) {
      setRevealed({})
      setAllRevealed(false)
      return
    }
    void pool.revealAll()
      .then((items) => {
        if (items.length === 0) return
        setRevealed(Object.fromEntries(items.map(item => [item.id, item.plain])))
        setAllRevealed(true)
      })
      .catch((cause: unknown) => {
        setRevealError(messageOf(cause))
      })
  }

  /**
   * R4: resolve one literal for the clipboard. A revealed row already has it;
   * a masked row goes through the same explicit reveal route on click.
   * @param id - real row id.
   * @returns the literal without ever putting it in the DOM.
   */
  const resolveKey = (id: number) => async (): Promise<string | undefined> => {
    if (revealed[id] !== undefined) return revealed[id]
    try {
      return await pool.reveal(id)
    } catch (cause: unknown) {
      setRevealError(messageOf(cause))
      return undefined
    }
  }

  /** R5/R6: perform the confirmed write, or nothing at all on cancel. */
  const confirmWrite = (): void => {
    if (confirmation === undefined) return
    if (confirmation.kind === 'delete') pool.remove(confirmation.id)
    else pool.purge(confirmation.id)
    setConfirmation(undefined)
  }

  // The board is 100% data-driven: tier names, order, membership and rank all
  // come from the remote file. V round: the ranking hook only ever holds a
  // CLASSIFIED snapshot (or none), so a failed / unclassified read keeps the
  // last good board on screen with a stale notice — the layout shape never
  // changes; without any snapshot, the grouped skeleton holds the shape.
  const classified = ranking.snapshot !== undefined
  const metaByKind = new Map<string, ProviderMeta>(
    (ranking.snapshot?.providers ?? []).map(meta => [meta.kind, meta]),
  )
  const statusByKind = new Map<string, ProviderStatus>(providers.map(provider => [provider.kind, provider]))
  const groups = classified
    ? (ranking.snapshot?.groups ?? []).map(group => ({
      ...group,
      items: group.kinds
        .map(kind => statusByKind.get(kind))
        .filter((item): item is ProviderStatus => item !== undefined),
    }))
    : []
  const visibleCount = classified
    ? groups.reduce((total, group) => total + group.items.length, 0)
    : providers.length
  const tierLabel = (label: { zh: string; en: string }): string => locale === 'en-US' ? label.en : label.zh
  const failureReason = ranking.error ?? t('websearch.filter.unknown')

  /** Render one provider row, with optional remote rank/metadata badges. */
  const renderProvider = (provider: ProviderStatus, rank?: number, meta?: ProviderMeta): ReactNode => {
    const open = expanded === provider.kind
    /**
     * X round: clicking ANYWHERE on the row (name, chips, empty space) opens
     * the key pool — not just the chevron. Interactive children keep their
     * own behaviour: the toggle switch, the chevron and every button are
     * excluded here so a toggle click never also expands the pool.
     */
    const handleRowClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
      if ((event.target as Element).closest('button,a,input,[role="switch"]')) return
      toggleExpanded(provider.kind)
    }
    return (
      <li key={provider.kind} className={cx(css.providerItem, open && css.providerItemOpen)}>
        <div
          className={cx(css.providerRow, css.providerRowClickable)}
          onClick={handleRowClick}
        >
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
          <span className={css.providerIcon}><Icon name="search" size={16} /></span>
          <div className={css.providerMain}>
            <div className={css.providerName} title={meta?.note}>
              {/* X round: the ordinal sticks to the provider NAME instead of
                  floating between the name block and the chip cluster. */}
              {rank !== undefined
                ? <span className={css.rankChip}>{tf('websearch.ranking.rank', { n: rank })}</span>
                : null}
              {highlight(provider.kind, needle, css.mark)}
            </div>
            <div className={css.providerMeta}>
              {provider.hasPool ? t('websearch.pool') : t('websearch.noPool')}
            </div>
          </div>
          {meta?.freeTier === null
            ? (
              <span className={css.unknownChip} title={meta.note || t('websearch.filter.unknownNote')}>
                {t('websearch.filter.unknown')}
              </span>
            )
            : null}
          <span className={cx(css.countChip, provider.keyCount === undefined && css.chipOff)}>
            {provider.keyCount === undefined
              ? (provider.hasPool ? '—' : t('websearch.noPool'))
              : String(provider.keyCount)}
          </span>
          <span className={cx(css.badge, provider.enabled && css.badgeSuccess)}>
            <Icon name={provider.enabled ? 'check' : 'alert'} size={12} />
            {provider.enabled ? t('common.enabled') : t('common.disabled')}
          </span>
          <button
            type="button"
            className={css.iconButton}
            onClick={() => toggleExpanded(provider.kind)}
            aria-expanded={open}
            title={t('websearch.manageKeys')}
            aria-label={t('websearch.manageKeys')}
          >
            <Icon name="chevronDown" size={16} className={cx(css.chevron, open && css.chevronOpen)} />
          </button>
        </div>
        {open
          ? (
            <KeyPoolBody
              pool={pool}
              providerKind={provider.kind}
              needle={needle}
              newKeys={newKeys}
              onNewKeys={setNewKeys}
              onAdd={submitBatch}
              batchCount={batchCount}
              editingId={editingId}
              onEditStart={id => setEditingId(id)}
              onEditCancel={() => { setEditingId(undefined); setEditValue('') }}
              editValue={editValue}
              onEditValue={setEditValue}
              onEditSave={submitEdit}
              revealed={revealed}
              allRevealed={allRevealed}
              onToggleReveal={toggleReveal}
              onToggleRevealAll={toggleRevealAll}
              resolveKey={resolveKey}
              onAskDelete={entry => setConfirmation({ kind: 'delete', id: entry.id, masked: entry.masked })}
              onAskPurge={entry => setConfirmation({ kind: 'purge', id: entry.id, masked: entry.masked })}
              onSetDisabled={(id, disabled) => pool.setDisabled(id, disabled)}
              onRestore={pool.restore}
              revealError={revealError}
              confirmation={confirmation}
              onCancel={() => setConfirmation(undefined)}
              onConfirm={confirmWrite}
            />
          )
          : null}
      </li>
    )
  }

  /**
   * The providers-file line, Q round: the path is rendered in the user's
   * chosen display style (`~/…` · `%USERPROFILE%\…` · full) and a copy
   * button sits right after it — the copy ALWAYS carries the raw absolute
   * path, never the display form.
   */
  const providersFile = status?.providersFile
  const providersFileDisplay = providersFile !== undefined
    ? formatDisplayPath(providersFile, facts.facts?.home, facts.facts?.platform, pathStyle)
    : ''

  return (
    <section className={css.card}>
      <div className={css.cardBody}>
        <PanelSearch value={query} onChange={setQuery} placeholder={t('websearch.search')} count={visibleCount} />

        {/* Q round: while the FIRST read of the board is in flight (or has
            FAILED and no classified snapshot exists yet), render a FIXED-SHAPE
            skeleton (same groups, rows and heights as the real board, with a
            shimmer sweep) so the layout is stable from the first paint — no
            jump when the data lands. V round: a failed first read keeps the
            SAME skeleton shape (plus a notice) instead of a flat fallback
            list, so the shape never changes. */}
        {/* X round: the VERY FIRST paint (host status still in flight) also
            shows the skeleton — the user must see element shape immediately,
            never a lone spinner. The V-round case below covers the second-
            half (status loaded but no classified snapshot yet). */}
        {status === undefined && !disabled
          ? <RankingSkeleton filtersOpen={filtersOpen} />
          : null}
        {status !== undefined && !classified
          ? <RankingSkeleton filtersOpen={filtersOpen} />
          : null}

        {/* Level 1 is mandatory and exclusive; level 2 is a multi-select
            that NESTS under level 1 (they are related, not disjoint). The
            whole bar disappears when the remote ranking cannot be fetched. */}
        {classified
          ? (
            <div className={css.rankingFilters}>
              <div className={css.filterHead}>
                <span className={css.filterTitle}>{t('websearch.filter.title')}</span>
                <button
                  type="button"
                  className={css.actionButton}
                  onClick={() => setFiltersOpen(open => !open)}
                  aria-expanded={filtersOpen}
                >
                  {filtersOpen ? t('websearch.filter.hide') : t('websearch.filter.show')}
                </button>
              </div>
              {filtersOpen
                ? (
                  <>
                    <div className={css.filterBlock}>
                      {/* Level 1: one mandatory choice. Plain divs — a list
                          here would paint default `::marker` bullets next to
                          every chip (the user's `<::marker>` complaint). */}
                      <div className={css.filterRow}>
                        <span className={css.filterLabel}>{t('websearch.filter.primary')}</span>
                        <div className={css.filterChips}>
                          <button type="button" aria-pressed={freeTier === 'yes'} className={cx(css.filterChip, freeTier === 'yes' && css.filterChipActive)} onClick={() => setFreeTier('yes')}>
                            {t('websearch.filter.freeYes')}
                          </button>
                          <button type="button" aria-pressed={freeTier === 'no'} className={cx(css.filterChip, freeTier === 'no' && css.filterChipActive)} onClick={() => setFreeTier('no')}>
                            {t('websearch.filter.freeNo')}
                          </button>
                        </div>
                      </div>
                      {/* Level 2: optional multi-select, indented + connected
                          under level 1 so the hierarchy reads as ONE
                          structure instead of two disconnected bars. */}
                      <div className={css.filterRowSecondary}>
                        <span className={css.filterLabel}>{t('websearch.filter.secondary')}</span>
                        <div className={css.filterChips}>
                          <button type="button" aria-pressed={reqPhone} className={cx(css.filterChip, reqPhone && css.filterChipActive)} onClick={() => setReqPhone(current => !current)}>
                            {t('websearch.filter.phone')}
                          </button>
                          <button type="button" aria-pressed={reqCard} className={cx(css.filterChip, reqCard && css.filterChipActive)} onClick={() => setReqCard(current => !current)}>
                            {t('websearch.filter.card')}
                          </button>
                          {reqPhone || reqCard
                            ? (
                              <button type="button" className={css.actionButton} onClick={() => { setReqPhone(false); setReqCard(false) }}>
                                {t('websearch.filter.reset')}
                              </button>
                            )
                            : null}
                        </div>
                      </div>
                    </div>
                    <p className={css.filterHint}>{t('websearch.filter.requiresHint')}</p>
                    {freeTier === 'no' ? <p className={css.filterHint}>{t('websearch.filter.freeNoHint')}</p> : null}
                  </>
                )
                : null}
            </div>
          )
          : null}

        {/* V round: the layout shape never changes — with a classified board
            the notice sits NEXT TO the stale board; without one, it sits
            below the grouped skeleton above. */}
        {status !== undefined && ranking.error !== undefined
          ? (
            <div className={css.rankingNotice}>
              <Icon name="alert" size={16} />
              <span>
                {classified
                  ? tf('websearch.ranking.stale', { reason: failureReason, date: ranking.snapshot?.updatedAt ?? '—' })
                  : tf('websearch.ranking.failed', { reason: failureReason })}
              </span>
            </div>
          )
          : null}

        {/* W round: the "榜单更新于… 数据来自 GitHub 仓库 / 可见 N 家" meta row
            is gone (user: 去掉). Freshness now shows ONLY as a transient
            indicator: while the host serves a cache that is past its TTL and
            is refreshing in the background, a small chip says so — no
            permanent meta line. */}
        {classified && ranking.snapshot?.stale === true && ranking.error === undefined
          ? (
            <div className={css.rankingUpdating}>
              <Spinner />
              <span>{tf('websearch.ranking.updating', { date: ranking.snapshot.updatedAt || '—' })}</span>
            </div>
          )
          : null}

        {disabled
          ? (
            <div className={css.noticeBanner}>
              <Icon name="lock" size={16} />
              <span>{t('websearch.disabled')}</span>
            </div>
          )
          : null}

        {error !== undefined
          ? (
            <div className={css.errorBanner}>
              <Icon name="alert" size={16} />
              <span>{tf('websearch.error', { message: error })}</span>
            </div>
          )
          : null}

        {loading ? <div className={css.loadingState}><Spinner />{t('websearch.loading')}</div> : null}

        {/* Six remote groups. Original ranks are displayed as-is, so a filter
            never renumbers the board. Empty groups still show their header.
            Q round: groups fade/slide in with a small stagger (the
            "blingbling" entrance the user asked for) and carry a `--i`
            index for the delay. */}
        {status !== undefined && classified
          ? (
            <>
              {groups.map((group, at) => (
                <section
                  key={group.id}
                  className={cx(css.tierGroup, css.tierGroupIn)}
                  style={{ '--i': at } as CSSProperties}
                  aria-label={tierLabel(group.label)}
                >
                  <header className={css.tierHead}>
                    <h3 className={css.tierTitle}>{tierLabel(group.label)}</h3>
                    <span className={css.tierCount}>{tf('websearch.ranking.groupCount', { n: group.items.length })}</span>
                  </header>
                  {group.items.length > 0
                    ? (
                      <ul className={css.providerList}>
                        {group.items.map(provider => renderProvider(
                          provider,
                          group.ranks[provider.kind],
                          metaByKind.get(provider.kind),
                        ))}
                      </ul>
                    )
                    : null}
                </section>
              ))}
            </>
          )
          : null}

        {status !== undefined && visibleCount === 0
          ? (
            <div className={css.emptyState}>
              {needle.length > 0
                ? t('websearch.noMatch')
                : classified ? t('websearch.ranking.empty') : t('websearch.empty')}
            </div>
          )
          : null}

        {status !== undefined
          ? (
            <p className={css.hint}>
              <span>{t('websearch.config')}</span>
              <code className={css.code} title={providersFile}>{providersFileDisplay}</code>
              {/* Q round: copy icon right after the path; copies the RAW
                  absolute path regardless of the display style. */}
              <CopyButton value={providersFile ?? ''} label={t('common.copy')} size={13} className={css.pathCopy} />
            </p>
          )
          : null}
      </div>
    </section>
  )
}

/** The expanded key-pool body under one provider row. */
interface KeyPoolBodyProps {
  /** Live masked pool for the expanded provider. */
  pool: KeyPoolState
  /** The provider kind this body belongs to. */
  providerKind: string
  /** Lower-cased page search query. */
  needle: string
  /** Multi-line new-key draft. */
  newKeys: string
  /** Update the new-key draft. */
  onNewKeys: (value: string) => void
  /** Commit the add form. */
  onAdd: () => void
  /** How many keys the draft currently contains. */
  batchCount: number
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
  /** Whether the eye-all state is on. */
  allRevealed: boolean
  /** Toggle one row's literal. */
  onToggleReveal: (id: number) => void
  /** Toggle every row's literal. */
  onToggleRevealAll: () => void
  /** Build a clipboard resolver for one row (never renders the literal). */
  resolveKey: (id: number) => () => Promise<string | undefined>
  /** Open the soft-delete confirmation. */
  onAskDelete: (entry: KeyPoolEntry) => void
  /** Open the permanent-purge confirmation. */
  onAskPurge: (entry: RecycleEntry) => void
  /** Enable / disable one row. */
  onSetDisabled: (id: number, disabled: boolean) => void
  /** Restore one recycled row. */
  onRestore: (recycleId: number) => void
  /** Local error from an explicit reveal; `undefined` when none. */
  revealError: string | undefined
  /** The pending confirmation, if any. */
  confirmation: Confirmation | undefined
  /** Cancel the confirmation (no write). */
  onCancel: () => void
  /** Perform the confirmed write. */
  onConfirm: () => void
}

/** @param props - one expanded provider's key body. @returns the accordion content. */
function KeyPoolBody({
  pool, providerKind, needle, newKeys, onNewKeys, onAdd, batchCount, editingId, onEditStart,
  onEditCancel, editValue, onEditValue, onEditSave, revealed, allRevealed, onToggleReveal,
  onToggleRevealAll, resolveKey, onAskDelete, onAskPurge, onSetDisabled, onRestore,
  revealError, confirmation, onCancel, onConfirm,
}: KeyPoolBodyProps) {
  const { t, tf } = useI18n()
  const entries = (pool.entries ?? []).filter((entry) => {
    if (needle.length === 0) return true
    return entry.masked.toLowerCase().includes(needle)
      || providerKind.toLowerCase().includes(needle)
  })
  const recycle = pool.recycle.filter((entry) => {
    if (needle.length === 0) return true
    return entry.masked.toLowerCase().includes(needle)
  })

  return (
    <div className={css.keyAccordion}>
      <header className={css.keyAccordionHead}>
        <div>
          <h3 className={css.keyAccordionTitle}>{t('keys.title')} · {providerKind}</h3>
          <p className={css.cardSubtitle}>{t('keys.subtitle')}</p>
        </div>
        <button
          type="button"
          className={cx(css.iconButton, allRevealed && css.revealAllOn)}
          onClick={onToggleRevealAll}
          title={allRevealed ? t('keys.hideAll') : t('keys.showAll')}
          aria-label={allRevealed ? t('keys.hideAll') : t('keys.showAll')}
        >
          <Icon name="eyeAll" size={18} />
        </button>
      </header>

      {pool.error !== undefined || revealError !== undefined
        ? (
          <div className={css.errorBanner}>
            <Icon name="alert" size={16} />
            <span>{tf('keys.error', { message: pool.error ?? revealError ?? '' })}</span>
          </div>
        )
        : null}

      <form
        className={css.keyToolbar}
        onSubmit={(event) => { event.preventDefault(); onAdd() }}
      >
        <textarea
          className={css.keyBatchInput}
          value={newKeys}
          onChange={event => onNewKeys(event.target.value)}
          placeholder={t('keys.batchPlaceholder')}
          aria-label={t('keys.batchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          rows={5}
        />
        <div className={css.keyBatchBar}>
          <span className={css.keyBatchCount}>{batchCount > 0 ? tf('keys.batchCount', { n: batchCount }) : ''}</span>
          <button type="submit" className={css.primaryButton} disabled={pool.pending || batchCount === 0}>
            <Icon name="plus" size={16} />
            {batchCount > 1 ? t('keys.addMany') : t('keys.add')}
          </button>
        </div>
      </form>

      {pool.entries === undefined
        ? <div className={css.loadingState}><Spinner />{t('keys.loading')}</div>
        : null}
      {pool.entries !== undefined && entries.length === 0
        ? <div className={css.emptyState}>{needle.length > 0 ? t('keys.noMatch') : t('keys.empty')}</div>
        : null}

      {entries.length > 0
        ? (
          <ul className={css.keyList}>
            {entries.map(entry => (
              <li key={entry.id} className={css.keyRow}>
                <div className={css.keyRowMain}>
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
                      <span className={revealed[entry.id] !== undefined ? css.keyPlain : css.keyMasked}>
                        {highlight(revealed[entry.id] ?? entry.masked, needle, css.mark)}
                      </span>
                    )}
                  <button
                    type="button"
                    className={css.keyActionButton}
                    onClick={() => onToggleReveal(entry.id)}
                    title={revealed[entry.id] !== undefined ? t('keys.hide') : t('keys.show')}
                    aria-label={revealed[entry.id] !== undefined ? t('keys.hide') : t('keys.show')}
                  >
                    <Icon name={revealed[entry.id] !== undefined ? 'eyeOff' : 'eye'} size={15} />
                  </button>
                  {/* R4: present whether or not the row is revealed. */}
                  <CopyButton resolve={resolveKey(entry.id)} label={t('keys.copy')} size={15} />
                </div>
                <div className={css.keyRowState}>
                  <span className={cx(css.badge, !entry.disabled && css.badgeSuccess)}>
                    {entry.disabled ? t('common.disabled') : t('common.enabled')}
                  </span>
                  {entry.disabled && entry.disabledReason !== undefined
                    ? <span className={css.reasonTag}>{reasonText(entry.disabledReason, t)}</span>
                    : null}
                  {entry.failures > 0
                    ? <span className={css.hint}>{tf('keys.failures', { n: entry.failures })}</span>
                    : null}
                </div>
                <div className={css.keyRowActions}>
                  {editingId === entry.id
                    ? (
                      <ul className={css.keyActions}>
                        <li>
                          <button type="button" className={css.keyActionButton} onClick={() => onEditSave(entry.id)} title={t('keys.save')} aria-label={t('keys.save')} disabled={editValue.trim().length === 0}>
                            <Icon name="check" size={15} />
                          </button>
                        </li>
                        <li>
                          <button type="button" className={css.keyActionButton} onClick={onEditCancel} title={t('keys.cancel')} aria-label={t('keys.cancel')}>
                            <Icon name="close" size={15} />
                          </button>
                        </li>
                      </ul>
                    )
                    : (
                      <ul className={css.keyActions}>
                        <li>
                          <button type="button" className={css.keyActionButton} onClick={() => onEditStart(entry.id)} title={t('keys.edit')} aria-label={t('keys.edit')}>
                            <Icon name="edit" size={15} />
                          </button>
                        </li>
                        <li>
                          <button type="button" className={css.keyActionButton} onClick={() => onSetDisabled(entry.id, !entry.disabled)} title={entry.disabled ? t('keys.enable') : t('keys.disable')} aria-label={entry.disabled ? t('keys.enable') : t('keys.disable')} disabled={pool.pending}>
                            <Icon name={entry.disabled ? 'check' : 'alert'} size={15} />
                          </button>
                        </li>
                        <li>
                          <button type="button" className={cx(css.keyActionButton, css.keyActionDanger)} onClick={() => onAskDelete(entry)} title={t('keys.delete')} aria-label={t('keys.delete')} disabled={pool.pending}>
                            <Icon name="trash" size={15} />
                          </button>
                        </li>
                      </ul>
                    )}
                </div>
              </li>
            ))}
          </ul>
        )
        : null}

      {/* R6: recycle bin — every row is an <li>, never a table row. */}
      <div className={css.recycleHead}>
        <h4 className={css.recycleTitle}>{t('keys.recycle')}</h4>
        <span className={css.recycleCount}>{String(pool.recycle.length)}</span>
      </div>
      <p className={css.recycleHint}>{t('keys.recycleHint')}</p>
      {recycle.length === 0
        ? <div className={css.emptyState}>{t('keys.recycleEmpty')}</div>
        : (
          <ul className={css.recycleList}>
            {recycle.map(entry => (
              <li key={entry.id} className={css.recycleItem}>
                <span className={css.keyMasked}>{highlight(entry.masked, needle, css.mark)}</span>
                <ul className={css.recycleMeta}>
                  <li>{tf('keys.deletedAt', { date: new Date(entry.deletedAt).toLocaleString() })}</li>
                  <li>{tf('keys.purgeAt', { date: new Date(entry.purgeAt).toLocaleString() })}</li>
                </ul>
                <ul className={css.keyActions}>
                  <li>
                    <button type="button" className={css.keyActionButton} onClick={() => onRestore(entry.id)} title={t('keys.restore')} aria-label={t('keys.restore')} disabled={pool.pending}>
                      <Icon name="restore" size={15} />
                    </button>
                  </li>
                  <li>
                    <button type="button" className={cx(css.keyActionButton, css.keyActionDanger)} onClick={() => onAskPurge(entry)} title={t('keys.purge')} aria-label={t('keys.purge')} disabled={pool.pending}>
                      <Icon name="trash" size={15} />
                    </button>
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        )}

      <div className={css.note}>
        <Icon name="shield" size={18} className={css.noteIcon} />
        <span>{t('keys.note')}</span>
      </div>

      {/* R5: in-app confirmation. Cancel closes without touching the host. */}
      {confirmation !== undefined
        ? (
          <div className={css.modalBackdrop} role="presentation" onClick={onCancel}>
            <div
              className={css.modalCard}
              role="dialog"
              aria-modal="true"
              aria-label={t('keys.deleteConfirmTitle')}
              onClick={event => event.stopPropagation()}
            >
              <h4 className={css.modalTitle}>{t('keys.deleteConfirmTitle')}</h4>
              <p className={css.modalText}>
                {confirmation.kind === 'delete'
                  ? tf('keys.deleteConfirmText', { days: pool.retentionDays })
                  : t('keys.purgeConfirm')}
              </p>
              <p className={css.modalTarget}>{tf('keys.deleteTarget', { masked: confirmation.masked })}</p>
              <div className={css.modalActions}>
                <button type="button" className={css.secondaryButton} onClick={onCancel}>{t('keys.deleteConfirmCancel')}</button>
                <button type="button" className={cx(css.primaryButton, css.dangerButton)} onClick={onConfirm}>{t('keys.deleteConfirmOk')}</button>
              </div>
            </div>
          </div>
        )
        : null}
    </div>
  )
}

/**
 * Fixed-shape skeleton of the ranking board (Q round).
 *
 * It renders the SAME block sequence the real board will have — the filter
 * box, then six tier groups with a typical row shape — using fixed heights
 * that match the real CSS. The first paint already occupies the final
 * layout, so when the data lands there is no jump, only a shimmer→content
 * cross-fade. The shimmer itself is a pure CSS gradient sweep
 * (`@keyframes` + `background-position`, the standard skeleton pattern
 * borrowed from MUI / react-loading-skeleton / HeroUI).
 * @param props.filtersOpen - mirror of the filter box state.
 * @returns the skeleton board.
 */
function RankingSkeleton({ filtersOpen }: { filtersOpen: boolean }): ReactNode {
  // A typical remote board has six tiers; this shape approximates it.
  const shapes = [4, 3, 3, 3, 2, 2]
  return (
    <div className={css.boardSkeleton} aria-hidden="true">
      <div className={css.rankingFilters}>
        <div className={cx(css.skel, css.skelHead)} />
        {filtersOpen
          ? (
            <div className={css.filterBlock}>
              <div className={css.filterRow}>
                <div className={cx(css.skel, css.skelLabel)} />
                <div className={cx(css.skel, css.skelChips)} />
              </div>
              <div className={css.filterRowSecondary}>
                <div className={cx(css.skel, css.skelLabel)} />
                <div className={cx(css.skel, css.skelChips)} />
              </div>
            </div>
          )
          : null}
      </div>
      {shapes.map((rows, at) => (
        <section key={at} className={css.tierGroup}>
          <div className={cx(css.skel, css.skelGroupHead)} />
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className={cx(css.skel, css.skelRow)} />
          ))}
        </section>
      ))}
    </div>
  )
}

/**
 * @param reason - host-recorded disable reason.
 * @param t - translation function.
 * @returns the human-readable reason.
 */
function reasonText(reason: DisableReason, t: (key: string) => string): string {
  switch (reason) {
    case 'manual': return t('keys.reason.manual')
    case 'balance': return t('keys.reason.balance')
    case 'invalid': return t('keys.reason.invalid')
    default: return t('keys.reason.auto')
  }
}

/**
 * Highlight the matched part of a label without ever dangerously injecting
 * markup. Plain keys are masked by default; only an explicit reveal passes a
 * literal here, and it is rendered as text nodes.
 * @param text - label to render.
 * @param needle - lower-cased search query.
 * @param markClass - hashed CSS Module class for the <mark> (`undefined` is
 *   fine: CSS Modules maps are index signatures under noUncheckedIndexedAccess).
 * @returns text or highlighted text nodes.
 */
function highlight(text: string, needle: string, markClass: string | undefined): ReactNode {
  if (needle.length === 0) return text
  const index = text.toLowerCase().indexOf(needle)
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark className={markClass}>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  )
}

/** @param cause - unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
