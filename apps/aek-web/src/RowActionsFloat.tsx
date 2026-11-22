import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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
 */
export const ROW_ACTIONS_HIDE_GRACE_MS = 350

/** @param props - the optional className and the action buttons. */
export function RowActionsFloat({ className, children }: { className?: string; children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(OFF_SCREEN)
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<number | null>(null)
  const place = useCallback((): void => {
    const card = cardRef.current
    const row = card?.parentElement
    if (row === null || card === null) return
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
    setVisible(true)
  }, [])

  /** BG round: start the hide grace window (the card fades out when it elapses). */
  const scheduleHide = useCallback((): void => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    // No-fade rail setting (`.aek-nav-no-fade` on an ancestor): instant hide.
    if (cardRef.current?.closest('.aek-nav-no-fade') !== null) {
      hideTimer.current = null
      setVisible(false)
      return
    }
    hideTimer.current = window.setTimeout((): void => {
      hideTimer.current = null
      setVisible(false)
    }, ROW_ACTIONS_HIDE_GRACE_MS)
  }, [])

  useEffect((): (() => void) | undefined => {
    const card = cardRef.current
    const row = card?.parentElement
    if (card === null || row === null) return
    const onRowEnter = (): void => { place(); show() }
    const onRowFocusIn = (): void => { place(); show() }
    const onRowFocusOut = (event: FocusEvent): void => {
      // The card is a DOM child of the row — focus moving onto it stays "inside".
      if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return
      scheduleHide()
    }
    card.addEventListener('mouseenter', show)
    card.addEventListener('mouseleave', scheduleHide)
    row.addEventListener('mouseenter', onRowEnter)
    row.addEventListener('mouseleave', scheduleHide)
    row.addEventListener('focusin', onRowFocusIn)
    row.addEventListener('focusout', onRowFocusOut)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      card.removeEventListener('mouseenter', show)
      card.removeEventListener('mouseleave', scheduleHide)
      row.removeEventListener('mouseenter', onRowEnter)
      row.removeEventListener('mouseleave', scheduleHide)
      row.removeEventListener('focusin', onRowFocusIn)
      row.removeEventListener('focusout', onRowFocusOut)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    }
  }, [place, show, scheduleHide])

  return (
    <div
      ref={cardRef}
      className={cn(ROW_ACTIONS_CARD, visible ? 'opacity-100' : 'opacity-0 pointer-events-none', className)}
      style={pos}
    >
      {children}
    </div>
  )
}
