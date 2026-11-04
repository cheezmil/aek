import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * The AEK brand mark — an orange slice, at the requested square edge.
 * @param props.size - square edge in pixels.
 * @returns the orange-slice svg (aria-hidden; pair with the name for accessibility).
 */
export function AekBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="aek-brand-rind" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fdba74" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="aek-brand-flesh" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff0bc" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      <g transform="translate(60 60) scale(1.2) translate(-60 -60)">
        <circle cx="60" cy="60" r="42" fill="url(#aek-brand-rind)" />
        <circle cx="60" cy="60" r="34" fill="#fffbeb" />
        <circle cx="60" cy="60" r="30" fill="url(#aek-brand-flesh)" />
        <path d="M60 30 L60 90 M30 60 L90 60 M40 40 L80 80 M80 40 L40 80" stroke="#ea580c" strokeWidth="2" opacity="0.5" />
        <circle cx="60" cy="60" r="8" fill="#fffebf" />
      </g>
    </svg>
  )
}

/**
 * The AEK brand name wordmark.
 * @returns the AEK name as localized text.
 */
export function AekBrandName() {
  return <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>AEK</span>
}
