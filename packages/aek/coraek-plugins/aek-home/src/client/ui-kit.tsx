/**
 * Small shared building blocks for the AEK console panels.
 *
 * One rule the user repeated (2026-11-09): EVERY list is an UNORDERED list.
 * The helpers here render `<ul>/<li>` only; there is no `<ol>` anywhere in the
 * console. Copy buttons, spinners, loading bars and the in-page search box are
 * shared so the runtime, settings, skills, prompts and websearch surfaces
 * look and behave identically. There is deliberately NO progress bar: the
 * user asked for spinners only (2026-11-09 round).
 *
 * @module @cheezmil/aek-home/src/client/ui-kit
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode, UIEvent } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'

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
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className={cx(css.iconButton, className)}
      title={label}
      aria-label={label}
      onClick={() => {
        void (async () => {
          const text = resolve !== undefined ? await resolve() : value
          if (text === undefined || text.length === 0) return
          await navigator.clipboard?.writeText(text)
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
    <span className={css.spinnerWrap} role="status" aria-label={label ?? t('common.loading')}>
      <span className={cx(css.spinnerRing, css.spinning)} />
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
  /** Number of matches shown beside the box; `undefined` hides it. */
  count?: number | undefined
  /**
   * G round: opt-in scroll-condensed toolbar for the sticky settings pages.
   * As the page scrolls down (0 → 240px) the hit-count chip and the hairline
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
  /** I round: makes the count chip a button (the changed-items box opens). */
  onCountClick?: (() => void) | undefined
  /** I round: extra aria text for the count chip. */
  countAria?: string | undefined
}

/**
 * The search box at the TOP of a content panel (Web Search / Settings / ...).
 * It filters the PAGE content, not the sidebar navigation.
 * @param props - query, setter, placeholder and optional hit count.
 * @returns the search field.
 */
export function PanelSearch({ value, onChange, placeholder, count, condense, condenseHold, onCountClick, countAria }: PanelSearchProps) {
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
    <div ref={rootRef} className={cx(css.panelSearchWrap, condense === true && css.searchCondense)}>
      <div className={css.navSearchWrap}>
        <span className={css.navSearchIcon}><Icon name="search" size={16} /></span>
        <input
          className={css.navSearchInput}
          type="search"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={event => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') onChange('') }}
        />
        {value.length > 0
          ? (
            <button
              type="button"
              className={css.navSearchClear}
              onClick={() => onChange('')}
              title={t('nav.clear')}
              aria-label={t('nav.clear')}
            >
              <Icon name="close" size={14} />
            </button>
          )
          : null}
      </div>
      {count !== undefined
        ? (
          onCountClick !== undefined
            ? (
              <button
                type="button"
                className={css.panelSearchCount}
                onClick={onCountClick}
                title={countAria}
                aria-label={countAria}
              >
                {String(count)}
              </button>
            )
            : <span className={css.panelSearchCount}>{String(count)}</span>
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
  return <section className={cx(css.card, className)}>{children}</section>
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

  const lineH = 21 // px, must match --aek-output-line-height in Home.module.css
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
      const entry = entries[0]
      if (entry !== undefined) setViewHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
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
      className={cx(css.outputView, failed && css.outputViewFailed, className)}
    >
      <div className={css.outputTrack} style={{ height: totalHeight }}>
        <div className={css.outputWindow} style={{ transform: `translateY(${aboveHeight}px)` }}>
          {window.map((line, at) => (
            <div key={start + at} className={css.outputLine} style={{ height: lineH }}>
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
export function ToggleSwitch({ checked, onChange, label, locked = false, className }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={locked}
      className={cx(css.toggleSwitch, checked && css.toggleOn, locked && css.toggleLocked, className)}
      onClick={() => { if (!locked) onChange(!checked) }}
    >
      <span className={css.toggleThumb} aria-hidden="true" />
    </button>
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
    <ul className={css.tagList}>
      {rows.map(row => (
        <li key={row.key} className={cx(css.capTag, row.on && css.capTagOn)}>{row.key}</li>
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
    <ul className={cx(css.bulletList, className)}>
      {items.map(item => <li key={item.id} className={css.bulletItem}>{item.content}</li>)}
    </ul>
  )
}
