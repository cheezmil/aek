import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * BR round (m11298 ⑤): the rail row's hover action card, rendered OUTSIDE the
 * rail. The card used to sit `absolute` inside its own row (right-0.5 /
 * right-1), so it covered the option's right side ("悬浮框覆盖选项"), and
 * anything placed past the rail edge was clipped by the rail's
 * `overflow-hidden`. Now the card stays a DOM child of its row (the
 * `.aek-row-actions` fade timing in index.css + the `group-hover` /
 * `group-focus-within` reveal classes keep working), but it is
 * VIEWPORT-FIXED: on the row's first hover / focus it anchors to the row's
 * right edge + 8px — directly to the RIGHT of the option, never on top of
 * it, never above / below.
 *
 * @module @cheezmil/aek-web/src/RowActionsFloat
 */

/** The card's base classes (the fade timing lives in index.css under `.aek-row-actions`). */
const ROW_ACTIONS_CARD = 'aek-row-actions fixed z-50 -translate-y-1/2 flex items-center gap-0.5 p-0.5 border border-border rounded-sm bg-card shadow-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'

/** Off-screen until the row is first hovered / focused. */
const OFF_SCREEN = { top: -9999, left: -9999 }

/** @param props - the optional className and the action buttons. */
export function RowActionsFloat({ className, children }: { className?: string; children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(OFF_SCREEN)
  const place = useCallback((): void => {
    const card = cardRef.current
    const row = card?.parentElement
    if (row === null || card === null) return
    const r = row.getBoundingClientRect()
    const next = { top: r.top + r.height / 2, left: Math.min(r.right + 8, window.innerWidth - 180) }
    setPos(prev => (prev.top === next.top && prev.left === next.left ? prev : next))
  }, [])
  useEffect((): (() => void) | undefined => {
    const row = cardRef.current?.parentElement
    if (row === null) return
    row.addEventListener('mouseenter', place)
    row.addEventListener('focusin', place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      row.removeEventListener('mouseenter', place)
      row.removeEventListener('focusin', place)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [place])
  return (
    <div ref={cardRef} className={cn(ROW_ACTIONS_CARD, className)} style={pos}>
      {children}
    </div>
  )
}
