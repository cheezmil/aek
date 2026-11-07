/**
 * Inline SVG navigation icons for the AEK console.
 *
 * Shapes follow the Lucide icon set (ISC License, https://lucide.dev/license).
 * They are inlined rather than imported from an icon package so the frontend
 * stays exactly React + Vite + TS + lightningcss with zero extra runtime deps.
 *
 * @module @cheezmil/aek-home/src/client/Icons
 */
import { useId } from 'react'
import type { ReactNode } from 'react'

/** Every icon the console can render. */
export type IconName =
  | 'dashboard' | 'search' | 'plugins' | 'settings' | 'about'
  | 'chevronLeft' | 'chevronRight' | 'refresh' | 'arrowRight'
  | 'key' | 'shield' | 'alert' | 'check' | 'server' | 'external'
  | 'sparkles' | 'layers' | 'activity'

/** Stroke-mode SVG fragments, drawn on a 24×24 viewBox. */
const ICONS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
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
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3" />
      <path d="m16 7 3 3" />
      <path d="m19 4 3 3" />
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
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01" />
      <path d="M7 16.5h.01" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
      <path d="m19 15 .8 2 .2-.8L22 16l-2 .8-.8 2-.2-2-2-.8 2-.2.8-2Z" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
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
