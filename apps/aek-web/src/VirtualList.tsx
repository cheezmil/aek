/**
 * VirtualList — the app-wide virtualized ROW list (the V6.5 iron rule for any
 * hundreds-of-rows display face).
 *
 * Two container modes:
 * - a NUMBER (the icon-manager art faces): a fixed-height, overflow-auto
 *   scroll box; only the visible rows + overscan exist in the DOM; native
 *   passive scroll listener, rAF-coalesced.
 * - `'document'` (the skill-manager library faces): NO inner scroll box. The
 *   wrapper is a plain document-flow flex-1 item; the PAGE scrolls and the
 *   visible-row math tracks the window, so a wheel over the list can never be
 *   trapped by an overflow context.
 *
 * @module @cheezmil/aek-web/src/VirtualList
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const OVERSCAN_ROWS = 2

/**
 * @param items - the full (already filtered) item list.
 * @param rowHeight - one row's height in px (uniform across the list).
 * @param height - the scroll box height in px, or `'document'`: no inner
 *   scroll box — the wrapper sits in document flow (a flex item) and the
 *   page's scroll drives the visible-row math.
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
  height: number | 'document'
  renderRow: (index: number) => ReactNode
}) {
  const doc = height === 'document'
  const boxRef = useRef<HTMLDivElement | null>(null)
  // Document mode: the wrapper's document-coordinate top, in which the
  // visible-row math is anchored. Re-read only on mount, resize, and item-set
  // change — the scroll path reads just window.scrollY, so frames never pay
  // for a layout read.
  const docTopRef = useRef(0)
  const [top, setTop] = useState(0)
  // Document mode: the visible band is the window, so the row math tracks the
  // viewport height (initial estimate until the first read).
  const [viewHeight, setViewHeight] = useState(420)

  // Box mode: native passive scroll listener, rAF-coalesced.
  useEffect(() => {
    if (doc) return
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
  }, [doc])

  // Document mode: the PAGE scrolls; track how far the window has scrolled
  // past the wrapper's document top (passive, rAF-coalesced). Two jank guards:
  // - the anchor is a ref re-read only on item-set change or a slow 500ms
  //   heartbeat (content above the list — the selection bar — can shift the
  //   wrapper; the heartbeat keeps the math honest without paying a layout
  //   read every frame);
  // - state updates are quantized to ROW units. The render output is identical
  //   for any two tops inside the same row, so scrolling only re-renders when
  //   a row boundary is crossed (≈ scroll speed ÷ 88px per second), not every
  //   frame — each render here swaps a full row card, so per-frame renders
  //   are the jank.
  useEffect(() => {
    if (!doc) return
    const box = boxRef.current
    if (box === null) return
    let frame = 0
    let lastRow = -1
    const refreshAnchor = (): void => {
      docTopRef.current = box.getBoundingClientRect().top + window.scrollY
    }
    const read = (): void => {
      cancelAnimationFrame(frame)
      frame = 0
      const nextView = Math.round(window.innerHeight)
      setViewHeight(prev => (prev === nextView ? prev : nextView))
      const row = Math.max(0, Math.floor((window.scrollY - docTopRef.current) / rowHeight))
      if (row !== lastRow) {
        lastRow = row
        setTop(row * rowHeight)
      }
    }
    refreshAnchor()
    read()
    const onFrame = (): void => {
      frame = requestAnimationFrame(read)
    }
    const onResize = (): void => {
      frame = requestAnimationFrame(() => {
        refreshAnchor()
        read()
      })
    }
    const heartbeat = window.setInterval(() => {
      refreshAnchor()
      read()
    }, 500)
    window.addEventListener('scroll', onFrame, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener('scroll', onFrame)
      window.removeEventListener('resize', onResize)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [doc, items.length, rowHeight])

  const totalRows = items.length
  const boxHeight = doc ? viewHeight : height
  const firstRow = Math.max(0, Math.min(totalRows - OVERSCAN_ROWS, Math.floor(top / rowHeight) - OVERSCAN_ROWS))
  const visibleRows = Math.ceil(boxHeight / rowHeight) + OVERSCAN_ROWS * 2
  const lastRow = Math.min(totalRows, firstRow + visibleRows)

  return (
    <div
      ref={boxRef}
      className={cn('min-h-50 flex-1', doc ? undefined : 'overflow-auto overscroll-contain')}
      style={doc ? undefined : { height }}
      data-virtual="list"
    >
      {/* Both modes: the inner spacer carries the full virtual height — in
          document mode it is what gives the flex wrapper its intrinsic
          height, so the page grows and the document scrolls. */}
      <div style={{ height: totalRows * rowHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: firstRow * rowHeight, left: 0, right: 0 }}>
          {Array.from({ length: lastRow - firstRow }, (_, i) => renderRow(firstRow + i))}
        </div>
      </div>
    </div>
  )
}
