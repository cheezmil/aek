/**
 * VirtualList — the app-wide virtualized ROW list (the V6.5 iron rule for any
 * hundreds-of-rows display face).
 *
 * Two container modes:
 * - a NUMBER: a fixed-height, overflow-auto scroll box; only the visible rows
 *   + overscan exist in the DOM; native passive scroll listener, rAF-coalesced
 *   (the icon-manager art faces use the equivalent box-mode VirtualGrid).
 * - `'document'` (the skill-manager library faces): NO inner scroll box. The
 *   wrapper is a plain document-flow flex-1 item; the PAGE scrolls and the
 *   visible-row math tracks the window, so a wheel over the list can never be
 *   trapped by an overflow context.
 *
 * Pitch contract (BQ18): `rowHeight` is one virtual SLOT's pitch, and the
 * primitive owns the geometry — every rendered row sits in its exact slot
 * (`top = index * rowHeight`, content top-aligned, the trailing gap is the
 * slot's headroom). The BQ18 bug: rows used to stack with no per-slot
 * placement, so an 80px card in an 88px slot drifted 8px/row and every
 * row-boundary re-render visibly snapped the band (the skill-center jitter).
 *
 * @module @cheezmil/aek-web/src/VirtualList
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Overscan in ROWS on each side of the viewport. 2 rows (~176px at the
 * 88px pitch) was too little headroom for a fast trackpad flick: the
 * rAF→setState→React-commit pipeline lags the wheel by a frame or two, so
 * the viewport outran the band and the empty spacer showed through (the
 * BQ18 "滑动快就白"). 4 rows keeps the lead/lag filled through a flick. */
const OVERSCAN_ROWS = 4

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
    // BQ18: content above the list (the selection bar) shifts the wrapper's
    // document top; a 500ms heartbeat alone left up to half a second of stale
    // row math (the skill-center jitter when selecting rows). Watch the
    // wrapper's parent — the face's flex column — so any size change in the
    // content above the list re-anchors on the next frame instead.
    let resizeOb: ResizeObserver | null = null
    const parent = box.parentElement
    if (typeof ResizeObserver !== 'undefined' && parent !== null) {
      resizeOb = new ResizeObserver(onResize)
      resizeOb.observe(parent)
    }
    window.addEventListener('scroll', onFrame, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      resizeOb?.disconnect()
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
          {Array.from({ length: lastRow - firstRow }, (_, i) => {
            const index = firstRow + i
            // BQ18: the primitive owns the pitch — each row renders inside a
            // fixed `rowHeight` slot that stacks in flow, so the row pitch is
            // exact no matter how short the renderer's content is (content is
            // top-aligned; the slot's headroom is the trailing gap). Without
            // this an 80px card in an 88px slot stacked at 80px and drifted
            // 8px/row off the virtual math — every boundary re-render snapped
            // the band (the skill-center jitter). key = the absolute item
            // index keeps rows that stay in the band reconciled, not remounted.
            return (
              <div key={index} style={{ height: rowHeight }}>
                {renderRow(index)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
