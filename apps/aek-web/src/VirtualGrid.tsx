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
 * `height="document"` (the skill-manager library faces): NO inner scroll box.
 * The wrapper is a plain document-flow flex-1 item; the PAGE scrolls and the
 * visible-row math tracks the window, so a wheel over the grid can never be
 * trapped by an overflow context.
 *
 * @module @cheezmil/aek-web/src/VirtualGrid
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** 96px tile + 8px gap (matches the `gap-2` grid + `h-24` tiles). */
export const VIRTUAL_ROW_UNIT = 104
/** BQ18: the list's 2-row overscan was outrun by a fast trackpad flick
 * (the rAF→React-commit pipeline lags the wheel a frame or two, so the empty
 * spacer showed through — the skill-center "滑动快就白"). 4 rows keeps the
 * lead/lag filled; the tiles are heavier than list rows, so headroom matters
 * more here. */
const OVERSCAN_ROWS = 4

/**
 * @param cols - user-adjustable column count (drives the row math).
 * @param items - the full (already filtered) item list.
 * @param height - the scroll box height in px, or `'document'`: no inner
 *   scroll box — the wrapper sits in document flow (a flex item) and the
 *   page's scroll drives the visible-row math.
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
  height: number | 'document'
  renderTile: (index: number) => ReactNode
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

  // Box mode: native passive scroll listener, rAF-coalesced: one state
  // update per frame at most (React 18 batches the rest).
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
  // past the wrapper's document top (passive, rAF-coalesced). Two jank guards
  // (see VirtualList): the anchor is a ref with a 500ms heartbeat (content
  // above the grid can shift the wrapper), and state updates are quantized to
  // row units so scrolling only re-renders when a row of tiles is crossed.
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
      const row = Math.max(0, Math.floor((window.scrollY - docTopRef.current) / VIRTUAL_ROW_UNIT))
      if (row !== lastRow) {
        lastRow = row
        setTop(row * VIRTUAL_ROW_UNIT)
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
    // BQ18: content above the grid (the selection bar) shifts the wrapper's
    // document top; a 500ms heartbeat alone left up to half a second of stale
    // row math. Watch the wrapper's parent — the face's flex column — so any
    // size change in the content above re-anchors on the next frame.
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
  }, [doc, items.length])

  // When the item set shrinks (search) the box may sit past the new virtual
  // end; the clamps below keep the row math inside the dataset.
  const boxHeight = doc ? viewHeight : height
  const rows = Math.max(1, Math.ceil(items.length / Math.max(1, cols)))
  const firstRow = Math.max(0, Math.min(rows - OVERSCAN_ROWS, Math.floor(top / VIRTUAL_ROW_UNIT) - OVERSCAN_ROWS))
  const visibleRows = Math.ceil(boxHeight / VIRTUAL_ROW_UNIT) + OVERSCAN_ROWS * 2
  const firstItem = firstRow * cols
  const lastItem = Math.min(items.length, firstItem + visibleRows * cols)
  const offset = firstRow * VIRTUAL_ROW_UNIT

  return (
    <div
      ref={boxRef}
      className={cn('min-h-50 flex-1', doc ? undefined : 'overflow-auto overscroll-contain')}
      style={doc ? undefined : { height }}
      data-virtual="grid"
    >
      {/* Both modes: the inner spacer carries the full virtual height — in
          document mode it is what gives the flex wrapper its intrinsic
          height, so the page grows and the document scrolls. */}
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
