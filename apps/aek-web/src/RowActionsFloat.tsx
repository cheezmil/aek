import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * BR round (m11298 ⑤): the rail row's hover action card, rendered OUTSIDE the
 * rail. The card used to sit `absolute` inside its own row (right-0.5 /
 * right-1), so it covered the option's right side ("悬浮框覆盖选项"), and
 * anything placed past the rail edge was clipped by the rail's
 * `overflow-hidden`. Now the card stays a DOM child of its row, but it is
 * VIEWPORT-FIXED: on the row's first hover / focus it anchors to the row's
 * right edge + 8px — directly to the RIGHT of the option, never on top of
 * it, never above / below.
 *
 * BG round (m03469): the show / hide timing moved from CSS to a JS
 * HOVER-INTENT timer. The BL-round CSS linger (a 2.5s `transition-delay` on
 * the base state) was unreachable: `:hover` is hit-test based, so the moment
 * the pointer crossed the 8px gap between the row's right edge and the card,
 * the show state dropped — and `pointer-events` (not transitionable)
 * switched to `none` instantly. The card stayed visible for the whole 2.5s
 * but could no longer be grabbed, so moving the cursor toward it never
 * cancelled the fade (user: "鼠标移动过去的时候就消失了"). Now the card
 * keeps `pointer-events: auto` through a short grace window after the
 * pointer leaves the row AND the card, so crossing the gap re-enters the
 * card and cancels the pending hide.
 *
 * BK round (m05103 "悬浮框被遮住了"): the card is now PORTALED to
 * `document.body` — a viewport-`fixed` card that stays a DOM child of its
 * row is still painted inside that row's stacking / clipping context: the
 * plugin sub-rail's `nav.aek-rail-fold` is `sticky` + `overflow:hidden`
 * (its scroll container), so a card z-50 in there cannot beat the gallery
 * content's sticky `z-10` section bar — verified by a CDP z-bump to 99999
 * (still covered) and by releasing ancestors one by one (only releasing
 * that nav un-clips the card). Portal to <body> puts the card in the root
 * stacking context, where `fixed` + `z-50` really is on top of everything.
 * The component keeps a zero-size ANCHOR in the row's own tree so the row
 * element, `closest('.aek-nav-no-fade')` and the no-fade rail behavior all
 * still resolve exactly as before; every event listener stays a plain DOM
 * listener, so none of it is disturbed by the portal.
 *
 * @module @cheezmil/aek-web/src/RowActionsFloat
 */

/** The card's base classes (the fade itself lives in index.css under `.aek-row-actions`). */
const ROW_ACTIONS_CARD = 'aek-row-actions fixed z-50 -translate-y-1/2 flex items-center gap-0.5 p-0.5 border border-border rounded-sm bg-card shadow-md'

/** Off-screen until the row is first hovered / focused. */
const OFF_SCREEN = { top: -9999, left: -9999 }

/**
 * BG round: grace window (ms) after the pointer leaves the row AND the card
 * before the card hides. Long enough to carry the cursor across the 8px gap
 * (a normal move takes well under 200ms); short enough that a real leave
 * does not feel laggy. The no-fade rail setting bypasses it entirely.
 * BJ round (m04565): the default value — the user setting
 * `aek-home.animHoverGrace` overrides it per launch (0 = hide instantly on
 * leave).
 */
export const ROW_ACTIONS_HIDE_GRACE_MS = 350

/**
 * BK round: the card is portaled to <body>, so the row can no longer be
 * reached via `card.parentElement`. The row is always the anchor's parent
 * `li` (both call sites render the card directly inside their row) — with a
 * `closest` fallback for deeper nesting.
 */
function rowOf(anchor: HTMLElement): HTMLElement | null {
  const parent = anchor.parentElement
  if (parent === null) return null
  return parent.closest('li[data-panel], li[data-family]') ?? parent
}

/**
 * @param props - className, the optional row id (BK: locates the portaled
 * card via `data-aek-row-id`), the hover-grace window, the action buttons,
 * and the optional option NAME (BN round, m06297 ③): shown at the card's
 * right edge, to the right of the icons, whenever the row's own label is
 * not fully readable (collapsed rail, or an expanded rail whose label is
 * truncated to an ellipsis). Omitted when the label is fully visible.
 */
export function RowActionsFloat({
  className,
  rowId,
  name,
  children,
  graceMs,
}: {
  className?: string
  rowId?: string
  name?: string
  children: ReactNode
  graceMs?: number
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  /** BK round: zero-size anchor that stays in the row's DOM tree (see header). */
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState(OFF_SCREEN)
  const [visible, setVisible] = useState(false)
  /**
   * BJ round (m04661): `true` while the card is in its INSTANT-hide mode
   * (the pointer landed on a different option, or the no-fade rail won) —
   * the fade transition is suppressed for that change only, so the card
   * vanishes with no animation. `show()` always clears it.
   */
  const [instant, setInstant] = useState(false)
  const hideTimer = useRef<number | null>(null)
  /** BJ round: mirrors `visible` for the cross-instance registry below. */
  const visibleRef = useRef(false)
  /** BJ round (m04661): the effective grace window (the prop wins; 0 = instant hide). */
  const grace = graceMs ?? ROW_ACTIONS_HIDE_GRACE_MS
  const place = useCallback((): void => {
    const card = cardRef.current
    const anchor = anchorRef.current
    if (card === null || anchor === null) return
    const row = rowOf(anchor)
    if (row === null) return
    const r = row.getBoundingClientRect()
    const next = { top: r.top + r.height / 2, left: Math.min(r.right + 8, window.innerWidth - 180) }
    setPos(prev => (prev.top === next.top && prev.left === next.left ? prev : next))
  }, [])

  /** BG round: cancel a pending hide and show the card (CSS fades it in). */
  const show = useCallback((): void => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    setInstant(false)
    visibleRef.current = true
    setVisible(true)
  }, [])

  /**
   * BJ round (m04661): vanishing with NO animation — the user's ruling: when
   * the pointer lands on a DIFFERENT option, this card drops out instantly
   * (no grace window, no opacity fade). Sibling rows call it through the
   * module-level registry; the no-fade rail setting uses it too.
   */
  const hideInstant = useCallback((): void => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    visibleRef.current = false
    setInstant(true)
    setVisible(false)
  }, [])

  /** BG round: start the hide grace window (the card fades out when it elapses). */
  const scheduleHide = useCallback((): void => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    // No-fade rail setting (`.aek-nav-no-fade` on an ancestor): instant hide.
    // BK round: the card is portaled to <body>, so `closest` must run from
    // the in-row anchor, not the card.
    if (anchorRef.current?.closest('.aek-nav-no-fade') !== null) {
      hideTimer.current = null
      hideInstant()
      return
    }
    hideTimer.current = window.setTimeout((): void => {
      hideTimer.current = null
      visibleRef.current = false
      setVisible(false)
    }, Math.max(0, grace))
  }, [grace, hideInstant])

  useEffect((): (() => void) | undefined => {
    const card = cardRef.current
    const anchor = anchorRef.current
    if (card === null || anchor === null) return
    const row = rowOf(anchor)
    if (row === null) return
    // BJ round (m04661): register this card so every OTHER option row can
    // evict it the instant the pointer lands on that row ("不用动画，直接
    // 消失"). One module-level Set; entries self-clean on unmount.
    const entry: LiveCard = { row, visible: () => visibleRef.current, hideInstant }
    liveCards.add(entry)
    // BJ round (m04661): pointer / keyboard landing on THIS row evicts every
    // other visible card instantly and shows this one — one handler for
    // mouseenter and focusin (identical bodies; the lint gate forbids
    // duplicates, so they share it).
    const onRowEnter = (): void => {
      liveCards.forEach((other) => {
        if (other !== entry && other.visible()) other.hideInstant()
      })
      place()
      show()
    }
    const onRowFocusOut = (event: FocusEvent): void => {
      // The card is portaled OUT of the row (BK round), so "inside" now
      // means the row OR the card: focus moving between them stays inside.
      const next = event.relatedTarget
      if (next instanceof Node && (row.contains(next) || card.contains(next))) return
      scheduleHide()
    }
    card.addEventListener('mouseenter', show)
    card.addEventListener('mouseleave', scheduleHide)
    row.addEventListener('mouseenter', onRowEnter)
    row.addEventListener('mouseleave', scheduleHide)
    row.addEventListener('focusin', onRowEnter)
    row.addEventListener('focusout', onRowFocusOut)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      liveCards.delete(entry)
      card.removeEventListener('mouseenter', show)
      card.removeEventListener('mouseleave', scheduleHide)
      row.removeEventListener('mouseenter', onRowEnter)
      row.removeEventListener('mouseleave', scheduleHide)
      row.removeEventListener('focusin', onRowEnter)
      row.removeEventListener('focusout', onRowFocusOut)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    }
  }, [place, show, scheduleHide, hideInstant])

  return (
    <>
      {/* BK round: the row-side anchor — zero-size, stays in the row tree
          so `closest` + row resolution keep working for the portaled card. */}
      <span ref={anchorRef} style={{ display: 'none' }} />
      {createPortal(
        <div
          ref={cardRef}
          data-aek-row-id={rowId}
          className={cn(ROW_ACTIONS_CARD, visible ? 'opacity-100' : 'opacity-0 pointer-events-none', instant ? 'transition-none' : '', className)}
          style={pos}
        >
          {children}
          {/* BN round (m06297 ③): the option's name at the card's right edge,
              to the right of the icons — only when the row's own label is
              not readable (collapsed rail, or an ellipsized expanded label). */}
          {name
            ? (
              <span className="aek-row-actions-name border-l border-border pl-1.5 text-xs text-muted-foreground whitespace-nowrap">
                {name}
              </span>
            )
            : null}
        </div>,
        document.body,
      )}
    </>
  )
}

/**
 * BJ round (m04661): the live-card registry. Every rendered RowActionsFloat
 * registers itself here; when the pointer lands on a DIFFERENT option row,
 * that row's `onRowEnter` evicts every other VISIBLE card instantly. The
 * `row` member is retained for future per-list scoping; the identity check
 * happens on the caller's own entry object.
 */
type LiveCard = { row: HTMLElement; visible: () => boolean; hideInstant: () => void }
const liveCards = new Set<LiveCard>()
