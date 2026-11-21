/**
 * Small shared building blocks for the AEK console panels.
 *
 * One rule the user repeated (2026-11-09): EVERY list is an UNORDERED list.
 * The helpers here render `<ul>/<li>` only; there is no `<ol>` anywhere in the
 * console. Copy buttons, spinners, loading bars and the in-page search box are
 * shared so the runtime, settings, skills, prompts and websearch surfaces
 * look and behave identically. Spinners stay for REFRESH / LOAD states only;
 * long-running ACTIONS carry the X2 operation pipelines (step chips + a
 * percentage bar, see `useOps` / `InfoPanels.OpsPipeline`) — the old
 * "spinners only, no progress bar" note (2026-11-09) is superseded by the
 * 2026-11-15 X2 round.
 *
 * @module @cheezmil/aek-web/src/ui-kit
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode, UIEvent } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { cn } from '@/lib/utils'
import { Switch as Uiswitch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

/* FF round: the old ui-kit module classes, now literal Tailwind utilities
   (1:1 from Home.module.css). One-off calc() math lives in index.css. */
const ICON_BUTTON = 'inline-flex items-center justify-center size-8.5 p-0 text-text-secondary bg-card border border-border rounded-sm cursor-pointer transition-[color,border-color,background-color] duration-150 ease-aek hover:text-primary hover:border-accent-border hover:bg-accent-soft disabled:opacity-50 disabled:cursor-not-allowed'
const SPINNER_WRAP = 'inline-flex items-center justify-center size-4.5'
const SPINNER_RING = 'block w-3.5 h-3.5 border-2 border-input border-t-primary rounded-full'
const PANEL_SEARCH_WRAP = 'flex items-center gap-2 mb-5 pb-4 border-b border-border'
const SEARCH_CONDENSE = 'relative border-b-0 gap-0'
const NAV_SEARCH_WRAP = 'relative flex items-center gap-2 h-9 mb-4 px-2 border border-border rounded-sm bg-surface-subtle transition-[border-color,background-color] duration-150 ease-aek focus-within:border-accent-border focus-within:bg-card'
const NAV_SEARCH_ICON = 'inline-flex shrink-0 text-text-muted'
const NAV_SEARCH_INPUT = 'min-w-0 h-full p-0 text-text bg-transparent border-0 outline-none text-xs-plus placeholder:text-text-muted'
const NAV_SEARCH_CLEAR = 'absolute top-0.5 left-0.5 size-5 p-0 text-text-muted bg-transparent border-0 rounded-2xs cursor-pointer hover:text-text hover:bg-surface-hover'
const PANEL_CARD = 'bg-card border border-border rounded-md shadow-sm'
const PANEL_SEARCH_COUNT = 'inline-flex items-center justify-center min-w-6 py-0.5 rounded-full bg-surface-subtle text-text-muted text-2xs text-center'
const OUTPUT_VIEW = 'max-h-120 overflow-auto p-3 border border-border rounded-sm bg-surface-subtle text-text font-mono text-2xs'
const OUTPUT_VIEW_FAILED = 'border-danger'
const OUTPUT_TRACK = 'relative w-full'
const OUTPUT_WINDOW = 'absolute top-0 left-0 right-0 will-change-transform'
const OUTPUT_LINE = 'leading-output whitespace-pre-wrap break-words'
const TAG_LIST = 'flex flex-wrap gap-1.5'
const BULLET_LIST = 'flex flex-col gap-1.5'
const BULLET_ITEM = 'list-none'

/** Props for {@link CopyButton}. */
export interface CopyButtonProps {
  /** Text placed on the clipboard. Ignored when `resolve` is given. */
  value?: string
  /**
   * R4: resolve the literal ONLY when the user clicks copy. Used for masked
   * key rows — the plaintext is fetched through the reveal channel on demand
   * and never rendered, so the copy icon can exist without exposing the key.
   */
  resolve?: () => Promise<string | undefined>
  /** Accessible label (i18n already resolved by the caller). */
  label: string
  /** Icon size. */
  size?: number
  /** Extra class names. */
  className?: string | undefined
}

/**
 * Copy one value to the clipboard. The icon flips to a check for a moment so
 * the user sees the action succeeded without a toast / alert.
 * @param props - value / resolver, label and optional size / class.
 * @returns the button.
 */
export function CopyButton({ value, resolve, label, size = 14, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() =>{  setCopied(false) }, 1400)
    return () =>{  clearTimeout(timer) }
  }, [copied])
  return (
    <button
      type="button"
      className={cn(ICON_BUTTON, className)}
      title={label}
      aria-label={label}
      onClick={() => {
        void (async () => {
          const text = resolve !== undefined ? await resolve() : value
          if (text === undefined || text.length === 0) return
          await navigator.clipboard.writeText(text)
          setCopied(true)
        })().catch(() => { /* clipboard or reveal may be blocked */ })
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={size} />
    </button>
  )
}

/**
 * A rotating spinner. Used for every refresh / load so the console never
 * shows a bare "loading…" line of text.
 * @param props.label - optional accessible label.
 * @returns the spinner element.
 */
export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <span className={SPINNER_WRAP} role="status" aria-label={label ?? t('common.loading')}>
      <span className={cn(SPINNER_RING, 'animate-spin')} />
    </span>
  )
}

/** Props for {@link PanelSearch}. */
export interface PanelSearchProps {
  /** Current query. */
  value: string
  /** Update the query. */
  onChange: (next: string) => void
  /** Input placeholder (already translated). */
  placeholder: string
  /**
   * BO round: a bare search row for use INSIDE a card (no wrap margin,
   * bottom border, or section spacing — those belong to the page-level
   * panels where the search sits on the plain page background).
   */
  plain?: boolean
  /**
   * Z round: a custom right-slot badge in place of the old numeric
   * hit-count chip — the user called the number "没有任何的意义" and asked
   * for it to go from EVERY panel's search box. The caller owns the
   * content (a plain red dot for the settings' unsaved-changes nudge, an
   * activity icon + red dot for the operation-progress indicator) and
   * decides when to render it at all; `undefined` = nothing beside the box.
   */
  badge?: ReactNode
  /** Z round: when set, the badge renders as a button (it opens a box). */
  onBadgeClick?: (() => void) | undefined
  /** Z round: accessible name for the badge. */
  badgeAria?: string | undefined
  /**
   * G round: opt-in scroll-condensed toolbar for the sticky settings pages.
   * As the page scrolls down (0 → 240px) the badge chip and the hairline
   * underline fade out while the search box fills the row width; scrolling
   * back up restores everything. The progress is a single CSS variable
   * (`--aek-search-p`) driven from `window.scrollY`, batched through
   * requestAnimationFrame — deliberately no setTimeout (occluded windows
   * clamp timers, D-round lesson).
   */
  condense?: boolean
  /**
   * I round: hold the condense progress at zero while set — the chip keeps
   * showing ("the changed-count must stay visible while scrolling down").
   * The settings page passes `condenseHold={dirtyCount > 0}`.
   */
  condenseHold?: boolean
}

/**
 * The search box at the TOP of a content panel (Web Search / Settings / ...).
 * It filters the PAGE content, not the sidebar navigation.
 * @param props - query, setter, placeholder, condense flags and an optional
 * badge (the Z-round replacement for the old numeric count chip).
 * @returns the search field.
 */
export function PanelSearch({
  value,
  onChange,
  placeholder,
  badge,
  condense,
  condenseHold,
  onBadgeClick,
  badgeAria,
  plain,
}: PanelSearchProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement | null>(null)
  // I round: read the hold flag through a ref so the scroll listener keeps
  // its identity (no re-subscribe on every dirty-count change).
  const holdRef = useRef(condenseHold)
  holdRef.current = condenseHold

  // G2: the scroll-driven condense progress. The variable is written
  // SYNCHRONOUSLY in the (passive) scroll handler — no requestAnimationFrame
  // batch, no timers: an rAF batch silently dies whenever the compositor
  // stalls (GPU-process crash, occluded window) and the variable gets
  // stuck at a stale value; a one-property write per scroll event is cheap
  // enough that batching buys nothing here.
  useEffect(() => {
    if (condense !== true) return undefined
    const update = (): void => {
      const el = rootRef.current
      if (el === null) return
      const progress = holdRef.current ? 0 : Math.min(1, Math.max(0, window.scrollY / 240))
      el.style.setProperty('--aek-search-p', String(progress))
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', update)
    }
  }, [condense])

  // I round: the hold flag can flip WITHOUT a scroll event (the user stages
  // an edit while the page is parked mid-scroll) — re-apply the variable at
  // the current scroll position whenever it changes.
  useEffect(() => {
    if (condense !== true) return
    const el = rootRef.current
    if (el === null) return
    const progress = condenseHold ? 0 : Math.min(1, Math.max(0, window.scrollY / 240))
    el.style.setProperty('--aek-search-p', String(progress))
  }, [condense, condenseHold])

  return (
    <div ref={rootRef} className={cn(PANEL_SEARCH_WRAP, condense === true && SEARCH_CONDENSE, plain === true && 'mb-0 pb-0 border-b-0')}>
      {/* `.panelSearchWrap > .navSearchWrap` (flex 1 1 auto, no margin) and
          `.panelSearchWrap .navSearchInput` (no 200px cap) are baked in. */}
      <div className={cn(NAV_SEARCH_WRAP, 'flex-1 m-0', plain === true && 'h-8 bg-background')}>
        <span className={NAV_SEARCH_ICON}><Icon name="search" size={16} /></span>
        <input
          className={cn(NAV_SEARCH_INPUT, 'flex-1 max-w-none')}
          type="search"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) =>{  onChange(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Escape') onChange('') }}
        />
        {value.length > 0
          ? (
            <button
              type="button"
              className={NAV_SEARCH_CLEAR}
              onClick={() =>{  onChange('') }}
              title={t('nav.clear')}
              aria-label={t('nav.clear')}
            >
              <Icon name="close" size={14} />
            </button>
          )
          : null}
      </div>
      {/* Z round: the numeric hit-count chip is gone (the user: such
          numbers "没有任何的意义" on every panel); this slot now carries
          the caller's badge — an indicator dot, or an icon + red dot that
          opens a floating box (the operation-progress badge / the settings'
          unsaved-changes nudge). */}
      {badge !== undefined
        ? (
          onBadgeClick !== undefined
            ? (
              <button
                type="button"
                className={cn(PANEL_SEARCH_COUNT, 'px-2 border-0 cursor-pointer', condense === true && 'aek-count-condensed')}
                onClick={onBadgeClick}
                title={badgeAria}
                aria-label={badgeAria}
              >
                {badge}
              </button>
            )
            : <span className={cn(PANEL_SEARCH_COUNT, 'px-1.5', condense === true && 'aek-count-condensed')}>{badge}</span>
        )
        : null}
    </div>
  )
}

/** Props for {@link PanelCard}. */
export interface PanelCardProps {
  /** Card content. The header (title / subtitle / refresh row) was removed in
      the Q round: the user called it "没有任何用处", and the page refresh now
      lives on the sidebar row's refresh icon instead. */
  children: ReactNode
  /** Extra class names. */
  className?: string
}

/**
 * A consistent surface for every management panel.
 *
 * Q round (2026-11-12): the card no longer renders a `cardHeader`
 * (title / subtitle / refresh row). Pages now lead straight into their
 * searchable / actionable body; the refresh affordance moved to the sidebar
 * row icons.
 *
 * @param props - content and optional class.
 * @returns the card.
 */
export function PanelCard({ children, className }: PanelCardProps) {
  return <section className={cn(PANEL_CARD, className)}>{children}</section>
}

/** Props for {@link OutputView}. */
export interface OutputViewProps {
  /** The full (untruncated) output text. */
  text: string
  /** Whether the command that produced it exited non-zero. */
  failed?: boolean
  /** Extra class names. */
  className?: string
}

/**
 * A virtualized `<pre>` for command output.
 *
 * Q round (2026-11-12): the host no longer truncates (the `plugin-console`
 * return limit was removed), so a single command can return a LOT of lines.
 * Rendering all of them into the DOM would freeze the page. This view keeps
 * the FULL text in memory but only materializes the lines that are visible
 * in the viewport (plus a small overscan) as `<div>` rows, and positions the
 * whole window with a single `transform: translateY`. The visible height is
 * kept honest with two absolutely-positioned spacers (above / below the
 * window), so the scrollbar and the "where am I" feel stay correct even at
 * 10^6+ lines.
 *
 * It is a fixed-row-height windowing list (the same technique the user asked
 * to "borrow", not reinvent): no external virtualization library.
 *
 * @param props - text and flags.
 * @returns the virtualized output box.
 */
export function OutputView({ text, failed = false, className }: OutputViewProps) {
  // Split into lines ONLY when the text itself changes. Scrolling re-renders
  // this component on every frame, and re-splitting a multi-megabyte string
  // per frame would defeat the whole virtualization — so the split is
  // memoized on the text value (the host only grows it, never rewrites it
  // in place).
  const linesRef = useRef<{ text: string; lines: string[] }>({ text: '', lines: [] })
  if (linesRef.current.text !== text) {
    linesRef.current = { text, lines: splitLines(text) }
  }
  const lines = linesRef.current.lines
  const count = lines.length
  const [scrollTop, setScrollTop] = useState(0)
  const [viewHeight, setViewHeight] = useState(0)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  // Auto-follow the tail unless the user scrolled away (re-armed at bottom).
  const stickRef = useRef(true)

  const lineH = 21 // px, must match --aek-output-line-height in index.css (the `leading-output` utility)
  const overscan = 14 // rows rendered above/below the viewport
  const start = Math.max(0, Math.floor(scrollTop / lineH) - overscan)
  const visible = viewHeight > 0 ? Math.ceil(viewHeight / lineH) + 2 * overscan : 200
  const end = Math.min(count, start + visible)
  const window = lines.slice(start, end)
  const totalHeight = Math.max(count * lineH, viewHeight)
  const aboveHeight = start * lineH

  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget
    setScrollTop(el.scrollTop)
    if (el.clientHeight !== 0) setViewHeight(el.clientHeight)
    // Stick-to-tail: once the user scrolls away from the very bottom we stop
    // auto-following; scrolling back to the bottom re-arms it.
    stickRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
  }

  // Keep the viewport size honest when the container resizes.
  useEffect(() => {
    const el = scrollerRef.current
    if (el === null) return
    const observer = new ResizeObserver((entries) => {
      if (entries.length > 0) setViewHeight(entries[0].contentRect.height)
    })
    observer.observe(el)
    return () =>{  observer.disconnect() }
  }, [])

  // Follow the tail while new output arrives (the common "log" case): if the
  // user was already at the bottom, keep them pinned to it.
  useEffect(() => {
    const el = scrollerRef.current
    if (el === null || !stickRef.current) return
    el.scrollTop = el.scrollHeight
  }, [count])

  // Structure: a SCROLLER (the fixed-height viewport) wraps a TRACK whose
  // height is the FULL line count (this is what the scrollbar is based on),
  // which in turn carries the absolutely-positioned WINDOW of visible rows,
  // moved with one `transform: translateY`. Only the window's rows exist in
  // the DOM, so the cost is O(viewport), never O(total).
  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className={cn(OUTPUT_VIEW, failed && OUTPUT_VIEW_FAILED, className)}
    >
      <div className={OUTPUT_TRACK} style={{ height: totalHeight }}>
        <div className={OUTPUT_WINDOW} style={{ transform: `translateY(${aboveHeight}px)` }}>
          {window.map((line, at) => (
            <div key={start + at} className={OUTPUT_LINE} style={{ height: lineH }}>
              {line === '' ? '\u00A0' : line}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Split text into lines.
 * @param text - the raw output. @returns the lines (an empty input gives []).
 */
function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.replace(/\r\n/g, '\n').split('\n')
}

/** Props for {@link ToggleSwitch}. */
export interface ToggleSwitchProps {
  /** Current state. */
  checked: boolean
  /** Called with the NEXT state when the user flips it. */
  onChange: (next: boolean) => void
  /** Accessible label AND hover tooltip (i18n already resolved). */
  label: string
  /** Renders locked: the state is shown but cannot be changed. */
  locked?: boolean
  /** Extra class names. */
  className?: string
}

/**
 * A real on/off switch.
 *
 * The user rejected the old pair of check / cross icon buttons (2026-11-09):
 * a switch states the CURRENT state and the single action in one control,
 * instead of offering "enable" and "disable" as two parallel buttons where
 * one of them is always a no-op. `role="switch"` keeps it keyboard reachable
 * (Space / Enter) and correctly announced by screen readers.
 *
 * @param props - state, change handler, label and the `locked` variant.
 * @returns the switch.
 */
/**
 * HH round: the hand-rolled toggle track + thumb is gone; the switch is the
 * shadcn (Radix) `Switch` primitive from `@/components/ui` — the standard
 * accessible design-system control. `locked` maps to `disabled` (busy or
 * not yet loaded: shows the current value, cannot flip).
 */
export function ToggleSwitch({ checked, onChange, label, locked = false, className }: ToggleSwitchProps) {
  return (
    <Uiswitch
      checked={checked}
      disabled={locked}
      aria-label={label}
      className={cn('shrink-0', className)}
      onCheckedChange={(next) => { if (!locked) onChange(next) }}
    />
  )
}

/** One capability tag value. */
export interface Capabilities {
  backend: boolean
  cli: boolean
  mcp: boolean
}

/**
 * Render the three capability tags for a plugin (backend process / CLI / MCP).
 * HH round: shadcn Badges (the house CAP_TAG pill classes are gone); the ON
 * state keeps the accent-soft highlight, the OFF state is a quiet outline.
 * @param props.caps - tags derived from the manifest on the host.
 * @returns an unordered list of tags.
 */
export function CapabilityTags({ caps }: { caps: Capabilities }) {
  const { t } = useI18n()
  const rows: Array<{ key: string; on: boolean }> = [
    { key: t('plugins.cap.backend'), on: caps.backend },
    { key: t('plugins.cap.cli'), on: caps.cli },
    { key: t('plugins.cap.mcp'), on: caps.mcp },
  ]
  return (
    <ul className={TAG_LIST}>
      {rows.map(row => (
        <li key={row.key}>
          <Badge
            variant={row.on ? 'secondary' : 'outline'}
            className={cn('text-2xs', row.on && 'bg-accent-soft text-accent-ink border-accent-border')}
          >{row.key}</Badge>
        </li>
      ))}
    </ul>
  )
}

/** Props for {@link BulletList}. */
export interface BulletListProps {
  /** Rows; each is already a rendered node. */
  items: readonly { id: string; content: ReactNode }[]
  /** Extra class names. */
  className?: string
}

/**
 * The ONLY list primitive used by the console: an unordered `<ul>`.
 * @param props - rows and optional class.
 * @returns the list.
 */
export function BulletList({ items, className }: BulletListProps) {
  return (
    <ul className={cn(BULLET_LIST, className)}>
      {items.map(item => <li key={item.id} className={BULLET_ITEM}>{item.content}</li>)}
    </ul>
  )
}
