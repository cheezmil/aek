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
  | 'eye' | 'eyeOff' | 'layers'

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

/** Props for {@link BrandMark}. */
export interface BrandMarkProps {
  /** Square size in px. */
  size?: number | undefined
  /** Optional extra class name. */
  className?: string | undefined
}

/**
 * The AEK orange-slice brand mark, matching the identity in
 * `@cheezmil/coraek`. Gradient ids are scoped with `useId` so the sidebar and
 * the hero can both render the mark in one document.
 * @param props - sizing.
 * @returns the svg element.
 */
export function BrandMark({ size = 34, className }: BrandMarkProps) {
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
      <g transform="translate(60 60) scale(1.2) translate(-60 -60)">
        <circle cx="60" cy="60" r="42" fill={`url(#${rind})`} />
        <circle cx="60" cy="60" r="34" fill="#fffbeb" />
        <circle cx="60" cy="60" r="30" fill={`url(#${flesh})`} />
        <path d="M60 30 L60 90 M30 60 L90 60 M40 40 L80 80 M80 40 L40 80" stroke="#ea580c" strokeWidth="2" opacity="0.5" />
        <circle cx="60" cy="60" r="8" fill="#fffebf" />
      </g>
    </svg>
  )
}
