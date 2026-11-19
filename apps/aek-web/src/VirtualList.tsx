/**
 * VirtualList — the app-wide virtualized ROW list (the V6.5 iron rule for any
 * hundreds-of-rows display face).
 *
 * Same mechanism as {@link VirtualGrid} (a fixed-height, overflow-auto scroll
 * box; only the visible rows + overscan exist in the DOM; native passive
 * scroll listener, rAF-coalesced), generalized from icon tiles to uniform
 * rows: one height parameter instead of the 104px tile unit.
 *
 * @module @cheezmil/aek-web/src/VirtualList
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const OVERSCAN_ROWS = 2

/**
 * @param items - the full (already filtered) item list.
 * @param rowHeight - one row's height in px (uniform across the list).
 * @param height - the scroll box height in px.
 * @param renderRow - renders one row for an absolute item index.
 */
export function VirtualList({
  items,
  rowHeight,
  height,
  renderRow,
}: {
  items: readonly unknown[]
  rowHeight: number
  height: number
  renderRow: (index: number) => ReactNode
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [top, setTop] = useState(0)

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

  const totalRows = items.length
  const firstRow = Math.max(0, Math.min(totalRows - OVERSCAN_ROWS, Math.floor(top / rowHeight) - OVERSCAN_ROWS))
  const visibleRows = Math.ceil(height / rowHeight) + OVERSCAN_ROWS * 2
  const lastRow = Math.min(totalRows, firstRow + visibleRows)

  return (
    <div
      ref={boxRef}
      className="overflow-auto overscroll-contain"
      style={{ height }}
      data-virtual="list"
    >
      <div style={{ height: totalRows * rowHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: firstRow * rowHeight, left: 0, right: 0 }}>
          {Array.from({ length: lastRow - firstRow }, (_, i) => renderRow(firstRow + i))}
        </div>
      </div>
    </div>
  )
}
