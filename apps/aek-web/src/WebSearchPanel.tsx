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
 * @module @cheezmil/aek-web/src/WebSearchPanel
 */
import { useEffect, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { formatDisplayPath, parsePathStyle } from './paths.ts'
import { cn } from '@/lib/utils'
import { CopyButton, PanelSearch, Spinner } from './ui-kit.tsx'
import { PREF_KEYS, oneOf, parseBoolean, usePref } from './preferences.tsx'
import { useWebsearchRanking } from './useWebsearchRanking.ts'
import type { FreeFilter, ProviderMeta } from './useWebsearchRanking.ts'
import { useKeyPool } from './useKeyPool.ts'
import type { DisableReason, KeyPoolEntry, KeyPoolState, RecycleEntry } from './useKeyPool.ts'
import type { ProviderStatus, WebsearchState } from './useWebsearchStatus.ts'
import type { ConsoleFactsState } from './useConsoleFacts.ts'

/* FF round: the old panel module classes, now literal Tailwind utilities (1:1
   from Home.module.css; off-scale values live in index.css @theme tokens —
   see the 2026-11-17 FF round notes). State modifiers use MUTUALLY EXCLUSIVE
   class sets, never stacked utilities fighting for cascade order. */
const CARD = 'bg-card border border-border rounded-lg shadow-sm'
const CARD_BODY = 'p-6'
const CARD_SUBTITLE = 'mt-1 text-xs text-text-muted'
const NOTE = 'flex gap-3 p-4 border border-dashed border-input rounded-sm bg-surface-subtle text-text-secondary text-xs-plus'
const NOTE_ICON = 'shrink-0 grow-0 text-primary'
const CODE = 'p-0.5 px-1.5 border border-border rounded-code bg-surface-subtle font-mono text-2xs text-text-secondary break-all'
const HINT = 'mt-4 text-text-secondary text-xs leading-160'
const LOADING_STATE = 'flex items-center justify-center gap-2 min-h-30 text-text-muted text-xs-plus'
const EMPTY_STATE = LOADING_STATE
const ERROR_BANNER = 'flex items-center gap-2 mb-4 p-3 px-4 border border-danger-border rounded-sm bg-danger-soft text-danger text-xs-plus'
const NOTICE_BANNER = 'flex items-center gap-2 mb-4 p-3 px-4 border border-accent-border rounded-sm bg-accent-soft text-accent-ink text-xs-plus'
const BADGE = 'inline-flex items-center gap-1.25 p-0.75 px-2.25 rounded-full text-2xs font-semibold border border-border bg-surface-subtle text-text-secondary'
const BADGE_SUCCESS = 'border-success-border bg-success-soft text-success'
const COUNT_CHIP = 'inline-flex items-center p-0.5 px-2.25 rounded-full text-xs font-semibold tabular-nums border border-border bg-surface-subtle text-text-secondary'
const CHIP_OFF = 'border-border bg-surface-subtle text-text-muted'
const PRIMARY_BUTTON = 'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-sm font-semibold cursor-pointer text-inverse bg-primary border border-primary shadow-aek-primary transition-[transform,background-color,border-color] duration-150 ease-aek hover:bg-accent-hover hover:border-accent-hover active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed'
const SECONDARY_BUTTON = 'inline-flex items-center justify-center gap-2 h-8.5 px-3.5 border border-input rounded-sm bg-card text-text-secondary text-xs-plus cursor-pointer hover:bg-surface-hover'
const DANGER_BUTTON = 'bg-danger border-danger'
const ACTION_BUTTON = 'p-1.25 px-3 border border-border rounded-sm bg-surface-subtle text-text text-xs cursor-pointer hover:not-disabled:border-accent-border hover:not-disabled:bg-accent-soft disabled:opacity-45 disabled:cursor-default'
const ICON_BUTTON = 'inline-flex items-center justify-center size-8.5 p-0 text-text-secondary bg-card border border-border rounded-sm cursor-pointer transition-[color,border-color,background-color] duration-150 ease-aek hover:text-primary hover:border-accent-border hover:bg-accent-soft disabled:opacity-50 disabled:cursor-not-allowed'
const MARK = 'px-0.25 bg-amber-200 text-inherit rounded-3xs'
const RANKING_FILTERS = 'mb-3 p-3 border border-border rounded-sm bg-surface-subtle'
const FILTER_HEAD = 'flex items-center justify-between gap-3 mb-2'
const FILTER_TITLE = 'text-xs font-semibold text-text'
const FILTER_ROW = 'flex flex-wrap items-center gap-2 mt-1.5'
const FILTER_LABEL = 'shrink-0 grow-0 min-w-20.5 text-text-muted text-2xs'
const FILTER_CHIPS = 'flex flex-wrap gap-1.5 m-0 p-0'
const FILTER_CHIP = 'p-1 px-2.75 border border-border rounded-full bg-card text-text-secondary text-2xs font-semibold cursor-pointer hover:border-accent-border hover:text-accent-ink'
const FILTER_CHIP_ACTIVE = 'border-accent-border bg-accent-soft text-accent-ink'
const FILTER_ROW_SECONDARY = 'flex flex-wrap items-center gap-2 mt-1.5 pt-0.5 pb-0.5 pl-3 border-l-2 border-input'
const FILTER_HINT = 'mt-2 text-text-muted text-2xs leading-160'
const FILTER_BLOCK = 'm-0'
const BOARD_SKELETON = 'mb-4'
const SKEL = 'aek-skeleton'
const SKEL_HEAD = 'aek-skeleton h-4.5 mb-2'
const SKEL_LABEL = 'aek-skeleton shrink-0 grow-0 w-21.5 h-5 m-0'
const SKEL_CHIPS = 'aek-skeleton grow shrink h-5 m-0'
const SKEL_GROUP_HEAD = 'aek-skeleton h-5 mb-2.5'
const SKEL_ROW = 'aek-skeleton h-12 mb-2 last:mb-0'
const TIER_GROUP = 'mb-4 last:mb-0'
const TIER_GROUP_IN = 'animate-tier-in'
const TIER_HEAD = 'flex items-center gap-2 mb-2'
const TIER_TITLE = 'text-xs-plus font-bold text-text'
const TIER_COUNT = 'text-text-muted text-2xs'
const RANKING_NOTICE = 'flex items-start gap-2 mb-3 p-3 border border-border rounded-sm bg-surface-subtle text-text-secondary text-xs leading-160'
const RANKING_UPDATING = 'flex items-center gap-2 mb-3 text-text-muted text-2xs'
const RANK_CHIP = 'inline mr-1.5 text-text-muted text-2xs font-medium tabular-nums'
const UNKNOWN_CHIP = 'shrink-0 grow-0 p-0.5 px-2 border border-border rounded-full bg-surface-subtle text-text-muted text-2xs'
const PROVIDER_LIST = 'flex flex-col gap-2 m-0 p-0'
const PROVIDER_ITEM = 'border border-border rounded-sm bg-card overflow-hidden'
const PROVIDER_ITEM_OPEN = 'border-accent-border bg-surface-subtle'
const PROVIDER_ROW = 'flex items-center gap-3 p-3 px-4'
const PROVIDER_ROW_CLICKABLE = 'cursor-pointer'
const PROVIDER_MAIN = 'grow shrink min-w-0'
const PROVIDER_ICON = 'inline-flex items-center justify-center shrink-0 grow-0 basis-8 size-8 rounded-sm bg-surface-hover text-primary'
const PROVIDER_NAME = 'text-text font-semibold'
const PROVIDER_META = 'text-2xs text-text-muted'
const PATH_COPY = 'ml-1 align-middle'
const CHEVRON = 'transition-transform duration-150 ease-aek'
const CHEVRON_OPEN = 'rotate-180'
const KEY_ACCORDION = 'my-3 ml-1 p-4 border border-border border-l-3 border-l-primary rounded-sm bg-surface-subtle'
const KEY_ACCORDION_HEAD = 'flex items-start justify-between gap-3 mb-3'
const KEY_ACCORDION_TITLE = 'mb-0.5 text-xs-plus font-semibold'
const REVEAL_ALL_ON = 'text-primary bg-accent-soft border-accent-border'
const KEY_TOOLBAR = 'flex flex-col items-stretch gap-2 mb-4'
const KEY_EDIT_INPUT = 'w-full min-w-35 h-9 px-2.5 text-text bg-card border border-border rounded-sm text-xs-plus focus:outline-2 focus:outline-primary focus:outline-offset-1'
const KEY_MASKED = 'text-text-secondary font-mono text-xs-plus'
const KEY_ACTIONS = 'flex items-center gap-1.5 m-0 p-0'
const KEY_ACTION_BUTTON = 'inline-flex items-center justify-center size-7.5 p-0 text-text-secondary bg-card border border-border rounded-sm cursor-pointer transition-[color,border-color,background-color] duration-150 ease-aek hover:text-primary hover:border-accent-border hover:bg-accent-soft disabled:opacity-50 disabled:cursor-not-allowed'
const KEY_ACTION_DANGER = 'hover:text-danger hover:border-danger-border hover:bg-danger-soft'
const KEY_LIST = 'flex flex-col gap-2 m-0 p-0'
const KEY_ROW = 'flex items-center gap-3 flex-wrap p-2 px-3 border border-border rounded-sm bg-card'
const KEY_ROW_MAIN = 'flex items-center gap-1.5 grow shrink basis-65 min-w-0'
const KEY_ROW_STATE = 'flex items-center gap-1.5 flex-wrap'
const KEY_ROW_ACTIONS = 'shrink-0 grow-0'
const KEY_BATCH_BAR = 'flex items-center justify-between gap-3'
const KEY_BATCH_INPUT = 'w-full min-h-27 p-2.5 resize-y text-text bg-card border border-border rounded-sm font-mono text-xs-plus leading-160 box-border focus:outline-2 focus:outline-primary focus:outline-offset-1'
const KEY_BATCH_COUNT = 'text-text-muted text-xs'
const KEY_PLAIN = 'text-text font-mono text-xs-plus break-all'
const REASON_TAG = 'p-0.5 px-2 border border-danger-border rounded-full bg-danger-soft text-danger text-2xs'
const RECYCLE_HEAD = 'flex items-center gap-2 mt-5'
const RECYCLE_TITLE = 'm-0 text-xs-plus font-semibold'
const RECYCLE_COUNT = 'min-w-5 p-0.5 px-1.5 rounded-full bg-surface-hover text-text-secondary text-2xs text-center'
const RECYCLE_HINT = 'mt-1 mb-3 text-text-muted text-xs'
const RECYCLE_LIST = 'flex flex-col gap-2 m-0 p-0'
const RECYCLE_META = 'grow shrink flex-col gap-0.5 text-text-muted text-2xs m-0 p-0'
const MODAL_BACKDROP = 'fixed inset-0 z-60 flex items-center justify-center p-5 bg-overlay/45 backdrop-blur-aek-2'
const MODAL_CARD = 'w-105 max-w-full p-5 border border-border rounded-md bg-card shadow-aek-modal'
const MODAL_TITLE = 'mb-2 text-sm-plus font-bold'
const MODAL_TEXT = 'mb-2 text-text-secondary text-xs-plus leading-160'
const MODAL_TARGET = 'mb-4 p-2 px-2.5 rounded-sm bg-surface-subtle text-text-secondary font-mono text-xs break-all'
const MODAL_ACTIONS = 'flex justify-end gap-2'
const TOGGLE = 'relative inline-block w-9.5 h-5.5 p-0 bg-input border border-transparent rounded-full cursor-pointer transition-[background-color] duration-180 ease-aek disabled:opacity-55 disabled:cursor-wait'
const TOGGLE_ON = 'bg-primary border-primary'
const TOGGLE_KNOB = 'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-aek-knob transition-transform duration-180 ease-aek'

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
  // Y round: the "不进行任何排行分类" switch — when on, the panel shows a flat
  // provider list and the ranking hook performs NO reads at all (the host
  // cache is kept, so switching back restores the board instantly).
  const [noRanking] = usePref(PREF_KEYS.websearchNoRanking, false, parseBoolean)
  const [pathStyle] = usePref(PREF_KEYS.pathStyle, 'abbreviated', parsePathStyle)
  const ranking = useWebsearchRanking(
    { free: freeTier, phone: reqPhone, card: reqCard },
    { ttlHours: rankingTtlHours, forceSignal: refreshSignal, enabled: !noRanking },
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
    // `in` mirrors the old `revealed[id] !== undefined` check: revealed
    // values are always real strings, never explicit `undefined`.
    if (id in revealed) {
      setRevealed((current) => {
        const { [id]: _dropped, ...next } = current
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
    if (id in revealed) return revealed[id]
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
  // Y round: the "不进行任何排行分类" switch — the snapshot's tier groups are
  // never rendered (flat list instead), so it does not count as classified.
  const classified = !noRanking && ranking.snapshot !== undefined
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
      <li key={provider.kind} className={cn(PROVIDER_ITEM, open && PROVIDER_ITEM_OPEN)}>
        <div
          className={cn(PROVIDER_ROW, PROVIDER_ROW_CLICKABLE)}
          onClick={handleRowClick}
        >
          <button
            type="button"
            role="switch"
            aria-checked={provider.enabled}
            aria-label={`${t('websearch.col.enabled')} ${provider.kind}`}
            className={cn(TOGGLE, provider.enabled && TOGGLE_ON)}
            disabled={pending === provider.kind}
            onClick={() =>{  toggle(provider.kind, !provider.enabled) }}
          >
            <span className={cn(TOGGLE_KNOB, provider.enabled && 'translate-x-4')} />
          </button>
          <span className={PROVIDER_ICON}><Icon name="search" size={16} /></span>
          <div className={PROVIDER_MAIN}>
            <div className={PROVIDER_NAME} title={meta?.note}>
              {/* X round: the ordinal sticks to the provider NAME instead of
                  floating between the name block and the chip cluster. */}
              {rank !== undefined
                ? <span className={RANK_CHIP}>{tf('websearch.ranking.rank', { n: rank })}</span>
                : null}
              {highlight(provider.kind, needle, MARK)}
            </div>
            <div className={PROVIDER_META}>
              {provider.hasPool ? t('websearch.pool') : t('websearch.noPool')}
            </div>
          </div>
          {meta?.freeTier === null
            ? (
              <span className={UNKNOWN_CHIP} title={meta.note || t('websearch.filter.unknownNote')}>
                {t('websearch.filter.unknown')}
              </span>
            )
            : null}
          <span className={cn(COUNT_CHIP, provider.keyCount === undefined && CHIP_OFF)}>
            {provider.keyCount === undefined
              ? (provider.hasPool ? '—' : t('websearch.noPool'))
              : String(provider.keyCount)}
          </span>
          <span className={cn(BADGE, provider.enabled && BADGE_SUCCESS)}>
            <Icon name={provider.enabled ? 'check' : 'alert'} size={12} />
            {provider.enabled ? t('common.enabled') : t('common.disabled')}
          </span>
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={() =>{  toggleExpanded(provider.kind) }}
            aria-expanded={open}
            title={t('websearch.manageKeys')}
            aria-label={t('websearch.manageKeys')}
          >
            <Icon name="chevronDown" size={16} className={cn(CHEVRON, open && CHEVRON_OPEN)} />
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
              onEditStart={(id) =>{  setEditingId(id) }}
              onEditCancel={() => { setEditingId(undefined); setEditValue('') }}
              editValue={editValue}
              onEditValue={setEditValue}
              onEditSave={submitEdit}
              revealed={revealed}
              allRevealed={allRevealed}
              onToggleReveal={toggleReveal}
              onToggleRevealAll={toggleRevealAll}
              resolveKey={resolveKey}
              onAskDelete={(entry) =>{  setConfirmation({ kind: 'delete', id: entry.id, masked: entry.masked }) }}
              onAskPurge={(entry) =>{  setConfirmation({ kind: 'purge', id: entry.id, masked: entry.masked }) }}
              onSetDisabled={(id, disabled) =>{  pool.setDisabled(id, disabled) }}
              onRestore={pool.restore}
              revealError={revealError}
              confirmation={confirmation}
              onCancel={() =>{  setConfirmation(undefined) }}
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
    <section className={CARD}>
      <div className={CARD_BODY}>
        <PanelSearch value={query} onChange={setQuery} placeholder={t('websearch.search')} />

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
        {/* Y round: with "不进行任何排行分类" on, there is no board and no
            skeleton — the flat provider list below is the content. */}
        {status !== undefined && !classified && !noRanking
          ? <RankingSkeleton filtersOpen={filtersOpen} />
          : null}

        {/* Level 1 is mandatory and exclusive; level 2 is a multi-select
            that NESTS under level 1 (they are related, not disjoint). The
            whole bar disappears when the remote ranking cannot be fetched. */}
        {classified
          ? (
            <div className={RANKING_FILTERS}>
              <div className={FILTER_HEAD}>
                <span className={FILTER_TITLE}>{t('websearch.filter.title')}</span>
                <button
                  type="button"
                  className={ACTION_BUTTON}
                  onClick={() =>{  setFiltersOpen(open => !open) }}
                  aria-expanded={filtersOpen}
                >
                  {filtersOpen ? t('websearch.filter.hide') : t('websearch.filter.show')}
                </button>
              </div>
              {filtersOpen
                ? (
                  <>
                    <div className={FILTER_BLOCK}>
                      {/* Level 1: one mandatory choice. Plain divs — a list
                          here would paint default `::marker` bullets next to
                          every chip (the user's `<::marker>` complaint). */}
                      <div className={FILTER_ROW}>
                        <span className={FILTER_LABEL}>{t('websearch.filter.primary')}</span>
                        <div className={FILTER_CHIPS}>
                          <button type="button" aria-pressed={freeTier === 'yes'} className={cn(FILTER_CHIP, freeTier === 'yes' && FILTER_CHIP_ACTIVE)} onClick={() =>{  setFreeTier('yes') }}>
                            {t('websearch.filter.freeYes')}
                          </button>
                          <button type="button" aria-pressed={freeTier === 'no'} className={cn(FILTER_CHIP, freeTier === 'no' && FILTER_CHIP_ACTIVE)} onClick={() =>{  setFreeTier('no') }}>
                            {t('websearch.filter.freeNo')}
                          </button>
                        </div>
                      </div>
                      {/* Level 2: optional multi-select, indented + connected
                          under level 1 so the hierarchy reads as ONE
                          structure instead of two disconnected bars. */}
                      <div className={FILTER_ROW_SECONDARY}>
                        <span className={FILTER_LABEL}>{t('websearch.filter.secondary')}</span>
                        <div className={FILTER_CHIPS}>
                          <button type="button" aria-pressed={reqPhone} className={cn(FILTER_CHIP, reqPhone && FILTER_CHIP_ACTIVE)} onClick={() =>{  setReqPhone(current => !current) }}>
                            {t('websearch.filter.phone')}
                          </button>
                          <button type="button" aria-pressed={reqCard} className={cn(FILTER_CHIP, reqCard && FILTER_CHIP_ACTIVE)} onClick={() =>{  setReqCard(current => !current) }}>
                            {t('websearch.filter.card')}
                          </button>
                          {reqPhone || reqCard
                            ? (
                              <button type="button" className={ACTION_BUTTON} onClick={() => { setReqPhone(false); setReqCard(false) }}>
                                {t('websearch.filter.reset')}
                              </button>
                            )
                            : null}
                        </div>
                      </div>
                    </div>
                    <p className={FILTER_HINT}>{t('websearch.filter.requiresHint')}</p>
                    {freeTier === 'no' ? <p className={FILTER_HINT}>{t('websearch.filter.freeNoHint')}</p> : null}
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
            <div className={RANKING_NOTICE}>
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
        {/* Y round: "后台更新中" is only honest while a refresh is GENUINELY
            in flight (host `stale`). Once the refresh FAILED, the host flips
            to `refreshFailed` and the chip must turn into an honest
            "更新失败" notice instead of spinning forever on a stale date. */}
        {classified && ranking.snapshot?.stale === true && ranking.error === undefined
          ? (
            <div className={RANKING_UPDATING}>
              <Spinner />
              <span>{tf('websearch.ranking.updating', { date: ranking.snapshot.updatedAt || '—' })}</span>
            </div>
          )
          : null}
        {classified && ranking.refreshFailed !== undefined
          ? (() => {
            // The host reports machine tokens ("network-error", …); translate
            // them, falling back to the raw token if a key is missing.
            const raw = ranking.refreshFailed.reason
            const reasonKey = `websearch.ranking.reason.${raw}`
            const reason = t(reasonKey) === reasonKey ? (raw.length > 0 ? raw : 'unknown') : t(reasonKey)
            return (
              <div className={RANKING_NOTICE}>
                <Icon name="alert" size={16} />
                <span>{tf('websearch.ranking.refreshFailed', {
                  reason,
                  date: ranking.snapshot?.updatedAt ?? '—',
                })}</span>
              </div>
            )
          })()
          : null}

        {disabled
          ? (
            <div className={NOTICE_BANNER}>
              <Icon name="lock" size={16} />
              <span>{t('websearch.disabled')}</span>
            </div>
          )
          : null}

        {error !== undefined
          ? (
            <div className={ERROR_BANNER}>
              <Icon name="alert" size={16} />
              <span>{tf('websearch.error', { message: error })}</span>
            </div>
          )
          : null}

        {loading ? <div className={LOADING_STATE}><Spinner />{t('websearch.loading')}</div> : null}

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
                  className={cn(TIER_GROUP, TIER_GROUP_IN)}
                  style={{ '--i': at } as CSSProperties}
                  aria-label={tierLabel(group.label)}
                >
                  <header className={TIER_HEAD}>
                    <h3 className={TIER_TITLE}>{tierLabel(group.label)}</h3>
                    <span className={TIER_COUNT}>{tf('websearch.ranking.groupCount', { n: group.items.length })}</span>
                  </header>
                  {group.items.length > 0
                    ? (
                      <ul className={PROVIDER_LIST}>
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

        {/* Y round: the "不进行任何排行分类" switch — one flat provider list,
            no tier groups, no rank numbers, no remote metadata chips: the
            ranking is not fetched at all in this mode. */}
        {status !== undefined && noRanking
          ? (
            <ul className={PROVIDER_LIST}>
              {providers.map(provider => renderProvider(provider))}
            </ul>
          )
          : null}

        {status !== undefined && visibleCount === 0
          ? (
            <div className={EMPTY_STATE}>
              {needle.length > 0
                ? t('websearch.noMatch')
                : classified ? t('websearch.ranking.empty') : t('websearch.empty')}
            </div>
          )
          : null}

        {status !== undefined
          ? (
            <p className={HINT}>
              <span>{t('websearch.config')}</span>
              <code className={CODE} title={providersFile}>{providersFileDisplay}</code>
              {/* Q round: copy icon right after the path; copies the RAW
                  absolute path regardless of the display style. */}
              <CopyButton value={providersFile ?? ''} label={t('common.copy')} size={13} className={PATH_COPY} />
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
    <div className={KEY_ACCORDION}>
      <header className={KEY_ACCORDION_HEAD}>
        <div>
          <h3 className={KEY_ACCORDION_TITLE}>{t('keys.title')} · {providerKind}</h3>
          <p className={CARD_SUBTITLE}>{t('keys.subtitle')}</p>
        </div>
        <button
          type="button"
          className={cn(ICON_BUTTON, allRevealed && REVEAL_ALL_ON)}
          onClick={onToggleRevealAll}
          title={allRevealed ? t('keys.hideAll') : t('keys.showAll')}
          aria-label={allRevealed ? t('keys.hideAll') : t('keys.showAll')}
        >
          <Icon name="eyeAll" size={18} />
        </button>
      </header>

      {pool.error !== undefined || revealError !== undefined
        ? (
          <div className={ERROR_BANNER}>
            <Icon name="alert" size={16} />
            <span>{tf('keys.error', { message: pool.error ?? revealError ?? '' })}</span>
          </div>
        )
        : null}

      <form
        className={KEY_TOOLBAR}
        onSubmit={(event) => { event.preventDefault(); onAdd() }}
      >
        <textarea
          className={KEY_BATCH_INPUT}
          value={newKeys}
          onChange={(event) =>{  onNewKeys(event.target.value) }}
          placeholder={t('keys.batchPlaceholder')}
          aria-label={t('keys.batchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          rows={5}
        />
        <div className={KEY_BATCH_BAR}>
          <span className={KEY_BATCH_COUNT}>{batchCount > 0 ? tf('keys.batchCount', { n: batchCount }) : ''}</span>
          <button type="submit" className={PRIMARY_BUTTON} disabled={pool.pending || batchCount === 0}>
            <Icon name="plus" size={16} />
            {batchCount > 1 ? t('keys.addMany') : t('keys.add')}
          </button>
        </div>
      </form>

      {pool.entries === undefined
        ? <div className={LOADING_STATE}><Spinner />{t('keys.loading')}</div>
        : null}
      {pool.entries !== undefined && entries.length === 0
        ? <div className={EMPTY_STATE}>{needle.length > 0 ? t('keys.noMatch') : t('keys.empty')}</div>
        : null}

      {entries.length > 0
        ? (
          <ul className={KEY_LIST}>
            {entries.map(entry => (
              <li key={entry.id} className={KEY_ROW}>
                <div className={KEY_ROW_MAIN}>
                  {editingId === entry.id
                    ? (
                      <input
                        className={KEY_EDIT_INPUT}
                        type="password"
                        value={editValue}
                        onChange={(event) =>{  onEditValue(event.target.value) }}
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
                      <span className={entry.id in revealed ? KEY_PLAIN : KEY_MASKED}>
                        {highlight(revealed[entry.id] ?? entry.masked, needle, MARK)}
                      </span>
                    )}
                  <button
                    type="button"
                    className={KEY_ACTION_BUTTON}
                    onClick={() =>{  onToggleReveal(entry.id) }}
                    title={entry.id in revealed ? t('keys.hide') : t('keys.show')}
                    aria-label={entry.id in revealed ? t('keys.hide') : t('keys.show')}
                  >
                    <Icon name={entry.id in revealed ? 'eyeOff' : 'eye'} size={15} />
                  </button>
                  {/* R4: present whether or not the row is revealed. */}
                  <CopyButton resolve={resolveKey(entry.id)} label={t('keys.copy')} size={15} />
                </div>
                <div className={KEY_ROW_STATE}>
                  <span className={cn(BADGE, !entry.disabled && BADGE_SUCCESS)}>
                    {entry.disabled ? t('common.disabled') : t('common.enabled')}
                  </span>
                  {entry.disabled && entry.disabledReason !== undefined
                    ? <span className={REASON_TAG}>{reasonText(entry.disabledReason, t)}</span>
                    : null}
                  {entry.failures > 0
                    ? <span className={HINT}>{tf('keys.failures', { n: entry.failures })}</span>
                    : null}
                </div>
                <div className={KEY_ROW_ACTIONS}>
                  {editingId === entry.id
                    ? (
                      <ul className={KEY_ACTIONS}>
                        <li>
                          <button type="button" className={KEY_ACTION_BUTTON} onClick={() =>{  onEditSave(entry.id) }} title={t('keys.save')} aria-label={t('keys.save')} disabled={editValue.trim().length === 0}>
                            <Icon name="check" size={15} />
                          </button>
                        </li>
                        <li>
                          <button type="button" className={KEY_ACTION_BUTTON} onClick={onEditCancel} title={t('keys.cancel')} aria-label={t('keys.cancel')}>
                            <Icon name="close" size={15} />
                          </button>
                        </li>
                      </ul>
                    )
                    : (
                      <ul className={KEY_ACTIONS}>
                        <li>
                          <button type="button" className={KEY_ACTION_BUTTON} onClick={() =>{  onEditStart(entry.id) }} title={t('keys.edit')} aria-label={t('keys.edit')}>
                            <Icon name="edit" size={15} />
                          </button>
                        </li>
                        <li>
                          <button type="button" className={KEY_ACTION_BUTTON} onClick={() =>{  onSetDisabled(entry.id, !entry.disabled) }} title={entry.disabled ? t('keys.enable') : t('keys.disable')} aria-label={entry.disabled ? t('keys.enable') : t('keys.disable')} disabled={pool.pending}>
                            <Icon name={entry.disabled ? 'check' : 'alert'} size={15} />
                          </button>
                        </li>
                        <li>
                          <button type="button" className={cn(KEY_ACTION_BUTTON, KEY_ACTION_DANGER)} onClick={() =>{  onAskDelete(entry) }} title={t('keys.delete')} aria-label={t('keys.delete')} disabled={pool.pending}>
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
      <div className={RECYCLE_HEAD}>
        <h4 className={RECYCLE_TITLE}>{t('keys.recycle')}</h4>
        <span className={RECYCLE_COUNT}>{String(pool.recycle.length)}</span>
      </div>
      <p className={RECYCLE_HINT}>{t('keys.recycleHint')}</p>
      {recycle.length === 0
        ? <div className={EMPTY_STATE}>{t('keys.recycleEmpty')}</div>
        : (
          <ul className={RECYCLE_LIST}>
            {recycle.map(entry => (
              <li key={entry.id} className={KEY_ROW}>
                <span className={cn(KEY_MASKED, 'shrink-0 grow-0')}>{highlight(entry.masked, needle, MARK)}</span>
                <ul className={RECYCLE_META}>
                  <li>{tf('keys.deletedAt', { date: new Date(entry.deletedAt).toLocaleString() })}</li>
                  <li>{tf('keys.purgeAt', { date: new Date(entry.purgeAt).toLocaleString() })}</li>
                </ul>
                <ul className={KEY_ACTIONS}>
                  <li>
                    <button type="button" className={KEY_ACTION_BUTTON} onClick={() =>{  onRestore(entry.id) }} title={t('keys.restore')} aria-label={t('keys.restore')} disabled={pool.pending}>
                      <Icon name="restore" size={15} />
                    </button>
                  </li>
                  <li>
                    <button type="button" className={cn(KEY_ACTION_BUTTON, KEY_ACTION_DANGER)} onClick={() =>{  onAskPurge(entry) }} title={t('keys.purge')} aria-label={t('keys.purge')} disabled={pool.pending}>
                      <Icon name="trash" size={15} />
                    </button>
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        )}

      <div className={NOTE}>
        <Icon name="shield" size={18} className={NOTE_ICON} />
        <span>{t('keys.note')}</span>
      </div>

      {/* R5: in-app confirmation. Cancel closes without touching the host. */}
      {confirmation !== undefined
        ? (
          <div className={MODAL_BACKDROP} role="presentation" onClick={onCancel}>
            <div
              className={MODAL_CARD}
              role="dialog"
              aria-modal="true"
              aria-label={t('keys.deleteConfirmTitle')}
              onClick={(event) =>{  event.stopPropagation() }}
            >
              <h4 className={MODAL_TITLE}>{t('keys.deleteConfirmTitle')}</h4>
              <p className={MODAL_TEXT}>
                {confirmation.kind === 'delete'
                  ? tf('keys.deleteConfirmText', { days: pool.retentionDays })
                  : t('keys.purgeConfirm')}
              </p>
              <p className={MODAL_TARGET}>{tf('keys.deleteTarget', { masked: confirmation.masked })}</p>
              <div className={MODAL_ACTIONS}>
                <button type="button" className={SECONDARY_BUTTON} onClick={onCancel}>{t('keys.deleteConfirmCancel')}</button>
                <button type="button" className={cn(PRIMARY_BUTTON, DANGER_BUTTON)} onClick={onConfirm}>{t('keys.deleteConfirmOk')}</button>
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
    <div className={BOARD_SKELETON} aria-hidden="true">
      <div className={RANKING_FILTERS}>
        <div className={cn(SKEL, SKEL_HEAD)} />
        {filtersOpen
          ? (
            <div className={FILTER_BLOCK}>
              <div className={FILTER_ROW}>
                <div className={cn(SKEL, SKEL_LABEL)} />
                <div className={cn(SKEL, SKEL_CHIPS)} />
              </div>
              <div className={FILTER_ROW_SECONDARY}>
                <div className={cn(SKEL, SKEL_LABEL)} />
                <div className={cn(SKEL, SKEL_CHIPS)} />
              </div>
            </div>
          )
          : null}
      </div>
      {shapes.map((rows, at) => (
        <section key={at} className={TIER_GROUP}>
          <div className={cn(SKEL, SKEL_GROUP_HEAD)} />
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className={cn(SKEL, SKEL_ROW)} />
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
