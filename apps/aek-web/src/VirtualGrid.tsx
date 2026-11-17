/**
 * VirtualGrid — the app-wide virtualized grid (user iron rule: every list of
 * any size is virtualized; a data set never renders more DOM than its
 * viewport + overscan).
 *
 * A fixed-height, overflow-auto scroll box. The full item count sets the
 * virtual height; only the visible rows (+2 rows of overscan each side)
 * exist in the DOM. Fixed row unit: tile h-24 (96px) + gap-2 (8px) = 104px,
 * so the math stays integer-pixel stable.
 *
 * @module @cheezmil/aek-web/src/VirtualGrid
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/** 96px tile + 8px gap (matches the `gap-2` grid + `h-24` tiles). */
export const VIRTUAL_ROW_UNIT = 104
const OVERSCAN_ROWS = 2

/**
 * @param cols - user-adjustable column count (drives the row math).
 * @param items - the full (already filtered) item list.
 * @param height - the scroll box height in px.
 * @param renderTile - renders one tile for an absolute item index.
 */
export function VirtualGrid({
  cols,
  items,
  height,
  renderTile,
}: {
  cols: number
  items: readonly string[]
  height: number
  renderTile: (index: number) => ReactNode
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [top, setTop] = useState(0)

  // Native passive scroll listener, rAF-coalesced: one state update per
  // frame at most (React 18 batches the rest).
  useEffect(() => {
    const box = boxRef.current
    if (box === null) return
    let frame = 0
    const onScroll = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setTop(box.scrollTop)
      })
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      box.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  // When the item set shrinks (search) the box may sit past the new virtual
  // end; the browser clamps scrollTop on the next layout, and we clamp the
  // row math below.
  const rows = Math.max(1, Math.ceil(items.length / Math.max(1, cols)))
  const firstRow = Math.max(0, Math.min(rows - OVERSCAN_ROWS, Math.floor(top / VIRTUAL_ROW_UNIT) - OVERSCAN_ROWS))
  const visibleRows = Math.ceil(height / VIRTUAL_ROW_UNIT) + OVERSCAN_ROWS * 2
  const firstItem = firstRow * cols
  const lastItem = Math.min(items.length, firstItem + visibleRows * cols)
  const offset = firstRow * VIRTUAL_ROW_UNIT

  return (
    <div
      ref={boxRef}
      className="overflow-auto overscroll-contain"
      style={{ height }}
      data-virtual="grid"
    >
      <div style={{ height: rows * VIRTUAL_ROW_UNIT, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: offset,
            left: 0,
            right: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            columnGap: 8,
            rowGap: 8,
          }}
        >
          {Array.from({ length: lastItem - firstItem }, (_, i) => renderTile(firstItem + i))}
        </div>
      </div>
    </div>
  )
}
