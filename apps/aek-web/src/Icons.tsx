/**
 * Inline SVG navigation icons for the AEK console.
 *
 * Shapes follow the Lucide icon set (ISC License, https://lucide.dev/license).
 * They are inlined rather than imported from an icon package so the frontend
 * stays on the declared stack (React + Vite + TS + Tailwind v4 + shadcn/ui,
 * FF round) with no extra icon runtime.
 *
 * Every glyph must match its meaning: `search` is a magnifier, `language` is
 * the A/文 translate mark. A globe was previously used for both and read as
 * a web-browser icon.
 *
 * @module @cheezmil/aek-web/src/Icons
 */
import { useId } from 'react'
import type { ReactNode } from 'react'

/** Every icon the console can render. */
export type IconName =
  | 'activity' | 'search' | 'plugins' | 'settings' | 'about'
  | 'chevronDown' | 'refresh'
  | 'shield' | 'alert' | 'check'
  | 'language' | 'star' | 'plus' | 'trash' | 'edit' | 'close'
  | 'eye' | 'eyeOff' | 'eyeAll' | 'layers'
  | 'copy' | 'pin' | 'book' | 'sparkles' | 'terminal' | 'layout' | 'restore'
  | 'play' | 'stop'
  | 'lock' | 'grip'
  | 'save'
  | 'puzzle' | 'type'
  | 'globe'
  | 'bookOpenText'
  | 'arrowLeft'
  | 'columns'
  | 'maximize'
  | 'loader'
  | 'zap'
  | 'externalLink'
  | 'chevronLeft'
  | 'chevronRight'
  | 'list'
  | 'checkCircle'
  | 'shuffle'
  | 'sun'
  | 'moon'
  | 'contrast'
  | 'chart'
  | 'form'
  | 'table'
  | 'popover'
  | 'bell'
  | 'compass'
  | 'frame'
  | 'ellipsis'
  | 'grid'
  | 'users'

/** Stroke-mode SVG fragments, drawn on a 24×24 viewBox. */
export const ICONS: Record<IconName, ReactNode> = {
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  plugins: (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  settings: (
    <>
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
  check: <path d="m5 13 4 4L19 7" />,
  /** Lucide `languages`: a Latin "A" plus a CJK glyph — unmistakably i18n. */
  language: (
    <>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l11-11-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  /** Lucide `eye`: the "show plaintext" affordance on a key row (C4). */
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  /** Lucide `eye-off`: the "hide again" state of the same toggle. */
  eyeOff: (
    <>
      <path d="m2 2 20 20" />
      <path d="M6.7 6.7C3.9 8.3 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.5 4.9-1.3" />
      <path d="M10.6 5.1c.5-.1 1-.1 1.4-.1 6.5 0 10 7 10 7s-.7 1.4-2 2.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  // Three stacked diamonds; used by the plugins feature badge. Keep every
  // IconName member present here — a missing glyph is a TS2741 at build time.
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  /** Lucide `copy`: two overlapping sheets; used next to ports / paths / keys. */
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  /** Lucide `pin`: the per-option "keep at top" affordance in the drawer. */
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
    </>
  ),
  /** Lucide `book-open`: kept for capability badges (Q round: the Skill
      Manager sidebar icon moved to `puzzle` because "book" read as docs). */
  book: (
    <>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z" />
    </>
  ),
  /** Lucide `sparkles`: Prompt Manager. */
  sparkles: (
    <>
      <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
      <path d="m19 15 .7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7L19 15Z" />
      <path d="m5 17 .6 1.6L7.2 19l-1.6.6L5 21l-.6-1.4L2.8 19l1.6-.6L5 17Z" />
    </>
  ),
  /** Lucide `square-terminal`: CLI / backend capability. */
  terminal: (
    <>
      <path d="m7 11 2-2-2-2" />
      <path d="M11 13h4" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </>
  ),
  /** Lucide `layout-dashboard`: desktop window / entry point. */
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  /** Lucide `rotate-ccw`: restore from the key recycle bin. */
  restore: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  /**
   * Lucide `save` (floppy disk): the I-round "save all settings" action in
   * the changed-items box (the one that carries the red dot).
   */
  save: (
    <>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v7" />
      <path d="M7 3v4a2 2 0 0 0 2 2h4" />
    </>
  ),
  /**
   * Lucide `puzzle` (Q round): the jigsaw "pluggable capability block"
   * metaphor. Kept for the `extensions` plugin bucket. BB round (2026-11-16):
   * Skill Manager moved OFF this glyph (the jigsaw read as a gear next to the
   * settings entry, user: "换掉这个图标") onto the dedicated `skill`
   * graduation-cap above. The path here IS the official lucide `puzzle`
   * glyph (verified against lucide.dev 2026-11-16), not a misdrawn shape.
   */
  puzzle: <path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z" />,
  /**
   * Lucide `type`: Prompt Manager sidebar icon (Q round, user: "sparkles"
   * read as AI magic, but aekpm manages plain prompt TEXT blocks).
   */
  type: (
    <>
      <path d="M12 4v16" />
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <path d="M9 20h6" />
    </>
  ),
  /* (The BB-round `skill` mortarboard was removed on 2026-11-17: the user
     vetoed it ("谁让你用一个学士帽图标"); the Skill Manager mark is back to
     the Q-round `puzzle` jigsaw — see icon-registry.ts.) */
  /**
   * Lucide `globe` (BB round): the AEK-WEB console entry — an unambiguously
   * "a web app" mark (lucide's own tags: browser / internet / https / www).
   * Replaces the generic `activity` heartbeat that read as "is it alive?",
   * not "which program". Path verified against lucide.dev (2026-11-16).
   */
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </>
  ),
  /** HH round: the Skill Manager mark. Lucide `book-open-text` verbatim
   * (paths verified against the installed lucide-react 1.73 glyph source):
   * an open book with two text lines per page = a readable skill document.
   * Icon history: mortarboard (BB round) and puzzle (GG round) were both
   * user-vetoed; an open book of text lines says "skill document" without
   * the "academic" or "puzzle piece" readings. */
  bookOpenText: (
    <>
      <path d="M12 5v16" />
      <path d="M16 13h2" />
      <path d="M16 9h2" />
      <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />
      <path d="M6 13h2" />
      <path d="M6 9h2" />
    </>
  ),
  /** BM round: drill-through pages' back affordance. Lucide `arrow-left`. */
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  /** Lucide `play`: start one half of an instance. */
  play: <path d="m8 5 12 7-12 7Z" />,
  /** Lucide `square`: stop one half of an instance. */
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  /** Lucide `lock`: a plugin that cannot be switched off (console root). */
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  /** Lucide `grip-vertical`: affordance hint that a rail row can be dragged. */
  grip: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  /** A double eye: reveal ALL keys at once (2026-11-09 round). */
  eyeAll: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M1 12h2M21 12h2" />
    </>
  ),
  /** BO round: art-gallery TopBar's compare tab. Lucide `columns-2`. */
  columns: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 3v18" />
    </>
  ),
  /** Lucide `maximize`: enter the art-gallery immersive mode. */
  maximize: (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </>
  ),
  /** Lucide `loader-circle`: the spinner arc, spin via animate-spin. */
  loader: <path d="M21 12a9 9 0 1 1-9-9" />,
  /** Lucide `zap`: the motion-stage tab glyph. */
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  /** Lucide `external-link`: open the upstream repo of a palette entry. */
  externalLink: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  /** Lucide `chevron-left`. */
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  /** Lucide `chevron-right`. */
  chevronRight: <path d="m9 18 6-6-6-6" />,
  /** Lucide `list`: the stage's log/flow tab glyph. */
  list: (
    <>
      <path d="M3 6h.01" />
      <path d="M8 6h13" />
      <path d="M3 12h.01" />
      <path d="M8 12h13" />
      <path d="M3 18h.01" />
      <path d="M8 18h13" />
    </>
  ),
  /** Lucide `circle-check`: success state marks in the stage. */
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  /** Lucide `shuffle`: the gallery switcher's random-jump button. */
  shuffle: (
    <>
      <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.2 2-1.8 3.3-1.8H22" />
      <path d="m18 21 3-3-3-3" />
      <path d="M2 6h1.9c1.5 0 2.9.7 3.8 1.8l7.5 8.6c.9 1 2.2 1.6 3.6 1.6H22" />
      <path d="m18 3 3 3-3 3" />
    </>
  ),
  /** Lucide `sun`: the base-theme quick-toggle glyph in light mode. */
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41" />
    </>
  ),
  /** Lucide `moon`: the base-theme quick-toggle glyph in dark mode. */
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  /** Lucide `contrast`: the base-theme quick-toggle glyph in auto (follow-system) mode. */
  contrast: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 18a6 6 0 0 0 0-12v12Z" />
    </>
  ),
  /** BO round ⑫: the stage's "chart" tab. Lucide `chart-column` (bars on a
      baseline) — reads unambiguously as "data chart". */
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  /** BO round ⑫: the stage's "form" tab. Lucide `clipboard-list` (fields on
      a sheet) — reads as "a form to fill". */
  form: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </>
  ),
  /** BO round ⑫: the stage's "table" tab. Lucide `table` (a 3×3 grid of
      cells) — reads as "rows and columns of data". */
  table: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M12 3v18" />
    </>
  ),
  /** BP round ⑪: the stage's "overlays" tab. A card floating above a
       backdrop (Lucide `square` + a raised panel) — reads as "a layer that
       pops over the page". */
  popover: (
    <>
      <rect width="8" height="8" x="3" y="3" rx="2" />
      <path d="M7 21h10a2 2 0 0 0 2-2V7" />
      <rect width="12" height="12" x="9" y="9" rx="2" />
    </>
  ),
  /** BP round ⑪: the stage's "feedback" tab. Lucide `bell` — reads as
       "notifications / alerts". */
  bell: (
    <>
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    </>
  ),
  /** BP round ⑪: the stage's "navigation" tab. Lucide `compass` — reads as
       "finding your way through the UI". */
  compass: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" />
    </>
  ),
  /** BP round ⑪: the stage's "layout" tab. Lucide `layout-grid` — reads as
       "arranging panes and regions". */
  frame: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 3v18" />
      <path d="M3 12h18" />
    </>
  ),
  /** Lucide `ellipsis` (three dots; the upstream `more-horizontal` was
      renamed): the row/card overflow affordance on the skill library. */
  ellipsis: (
    <>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </>
  ),
  /** Lucide `layout-grid`: the list/grid view toggle's grid side. */
  grid: (
    <>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </>
  ),
  /** Lucide `users`: the per-row agent-linkage affordance. */
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M16 3.128a4 4 0 0 1 0 7.744" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <circle cx="9" cy="7" r="4" />
    </>
  ),
}

/** Props for {@link Icon}. */
/** IV round: the icon registry's name list (icon-manager panel + aekim CLI
    manifest). Declaration order of `IconName`; keep the two in sync. */
export const ICON_NAMES: readonly IconName[] = [
  'activity', 'search', 'plugins', 'settings', 'about',
  'chevronDown', 'refresh',
  'shield', 'alert', 'check',
  'language', 'star', 'plus', 'trash', 'edit', 'close',
  'eye', 'eyeOff', 'eyeAll', 'layers',
  'copy', 'pin', 'book', 'sparkles', 'terminal', 'layout', 'restore',
  'play', 'stop',
  'lock', 'grip',
  'save',
  'puzzle', 'type',
  'globe',
  'bookOpenText',
  'arrowLeft',
  'columns',
  'maximize',
  'loader',
  'zap',
  'externalLink',
  'chevronLeft',
  'chevronRight',
  'list',
  'checkCircle',
  'shuffle',
  'sun',
  'moon',
  'contrast',
  'chart',
  'form',
  'table',
  'popover',
  'bell',
  'compass',
  'frame',
  'ellipsis', 'grid', 'users',
]

export interface IconProps {
  /** Which glyph to draw. */
  name: IconName
  /** Square size in px. */
  size?: number | undefined
  /** Optional extra class name (for color / animation). */
  className?: string | undefined
}

/**
 * One inline SVG icon. Uses `currentColor` so it inherits the surrounding
 * text color and needs no CSS of its own.
 * @param props - icon identity and sizing.
 * @returns the svg element.
 */
export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  )
}

/** User-selectable logo shapes (Settings → sidebar → logo variant). */
export type BrandVariant = 'mark' | 'round' | 'square' | 'text'

/** Props for {@link BrandMark}. */
export interface BrandMarkProps {
  /** Square size in px. */
  size?: number | undefined
  /** Optional extra class name. */
  className?: string | undefined
  /** Which shape to draw; driven by a host-persisted setting. */
  variant?: BrandVariant | undefined
}

/**
 * The AEK orange-slice brand mark, matching the identity in
 * `@cheezmil/coraek`. Gradient ids are scoped with `useId` so the sidebar and
 * the hero can both render the mark in one document.
 * @param props - sizing.
 * @returns the svg element.
 */
export function BrandMark({ size = 34, className, variant = 'mark' }: BrandMarkProps) {
  const uid = useId().replace(/:/gu, '')
  const rind = `aek-rind-${uid}`
  const flesh = `aek-flesh-${uid}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* BQ round (m10857 item 1): the logo is a brand asset — every stop and
          stroke resolves to the FIXED --color-logo-* hex set (index.css),
          never to --color-primary/--aek-accent, so whole-webui skinning can
          not recolor the logo. */}
      <defs>
        <linearGradient id={rind} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--color-logo-amber)" />
          <stop offset="1" stopColor="var(--color-logo-tangerine)" />
        </linearGradient>
        <linearGradient id={flesh} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--color-logo-sand)" />
          <stop offset="1" stopColor="var(--color-logo-tangerine)" />
        </linearGradient>
      </defs>
      {variant === 'text'
        ? <text x="60" y="78" textAnchor="middle" fontSize="58" fontWeight="700" fill="var(--color-logo-amber)">A</text>
        : (
          <g transform="translate(60 60) scale(1.2) translate(-60 -60)">
            {variant === 'square'
              ? <rect x="18" y="18" width="84" height="84" rx="16" fill={`url(#${rind})`} />
              : <circle cx="60" cy="60" r={variant === 'round' ? 46 : 42} fill={`url(#${rind})`} />}
            <circle cx="60" cy="60" r="34" fill="var(--color-logo-cream)" />
            <circle cx="60" cy="60" r="30" fill={`url(#${flesh})`} />
            <path d="M60 30 L60 90 M30 60 L90 60 M40 40 L80 80 M80 40 L40 80" stroke="var(--color-logo-amber)" strokeWidth="2" opacity="0.5" />
            <circle cx="60" cy="60" r="8" fill="var(--color-logo-glow)" />
          </g>
        )}
    </svg>
  )
}
