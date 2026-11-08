/**
 * Inline SVG navigation icons for the AEK console.
 *
 * Shapes follow the Lucide icon set (ISC License, https://lucide.dev/license).
 * They are inlined rather than imported from an icon package so the frontend
 * stays exactly React + Vite + TS + lightningcss with zero extra runtime deps.
 *
 * Every glyph must match its meaning: `search` is a magnifier, `language` is
 * the A/文 translate mark. A globe was previously used for both and read as
 * a web-browser icon.
 *
 * @module @cheezmil/aek-home/src/client/Icons
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

/** Stroke-mode SVG fragments, drawn on a 24×24 viewBox. */
const ICONS: Record<IconName, ReactNode> = {
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
  /** Lucide `book-open`: Skill Manager. */
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
  /** A double eye: reveal ALL keys at once (2026-11-09 round). */
  eyeAll: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M1 12h2M21 12h2" />
    </>
  ),
}

/** Props for {@link Icon}. */
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
      <defs>
        <linearGradient id={rind} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fdba74" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id={flesh} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff0bc" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      {variant === 'text'
        ? <text x="60" y="78" textAnchor="middle" fontSize="58" fontWeight="700" fill="#ea580c">A</text>
        : (
          <g transform="translate(60 60) scale(1.2) translate(-60 -60)">
            {variant === 'square'
              ? <rect x="18" y="18" width="84" height="84" rx="16" fill={`url(#${rind})`} />
              : <circle cx="60" cy="60" r={variant === 'round' ? 46 : 42} fill={`url(#${rind})`} />}
            <circle cx="60" cy="60" r="34" fill="#fffbeb" />
            <circle cx="60" cy="60" r="30" fill={`url(#${flesh})`} />
            <path d="M60 30 L60 90 M30 60 L90 60 M40 40 L80 80 M80 40 L40 80" stroke="#ea580c" strokeWidth="2" opacity="0.5" />
            <circle cx="60" cy="60" r="8" fill="#fffebf" />
          </g>
        )}
    </svg>
  )
}
