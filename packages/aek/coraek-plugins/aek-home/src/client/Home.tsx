/**
 * The AEK home landing — a minimal hello-world surface shown before the dsh
 * onboarding/login flow. Identity text (the AEK wordmark and greeting) is
 * plain localized copy, like the brand-name span in @cheezmil/aek-base.
 * @module @cheezmil/aek-home/src/client/Home
 */

/** No slot-owned props are required to render the home surface. */
export interface AekHomeProps {
  /** Optional click target that advances past the home surface. */
  onContinue?: () => void
}

/**
 * The AEK hello-world landing: the orange-slice brand mark over a centered
 * greeting and a single continue affordance.
 * @param props.onContinue - optional advance callback.
 * @returns the centered home surface.
 */
export function AekHome({ onContinue }: AekHomeProps) {
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <AekHomeMark />
        <h1 style={titleStyle}>Hello, AEK</h1>
        <p style={subtitleStyle}>Agent Enhance Kit · home surface</p>
        {onContinue === undefined ? undefined : (
          <button type="button" style={buttonStyle} onClick={onContinue}>
            继续
          </button>
        )}
      </div>
    </div>
  )
}

/** The AEK orange-slice brand mark, matching @cheezmil/aek-base. */
function AekHomeMark() {
  return (
    <svg width="96" height="96" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="aek-home-rind" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fdba74" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="aek-home-flesh" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff0bc" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      <g transform="translate(60 60) scale(1.2) translate(-60 -60)">
        <circle cx="60" cy="60" r="42" fill="url(#aek-home-rind)" />
        <circle cx="60" cy="60" r="34" fill="#fffbeb" />
        <circle cx="60" cy="60" r="30" fill="url(#aek-home-flesh)" />
        <path d="M60 30 L60 90 M30 60 L90 60 M40 40 L80 80 M80 40 L40 80" stroke="#ea580c" strokeWidth="2" opacity="0.5" />
        <circle cx="60" cy="60" r="8" fill="#fffebf" />
      </g>
    </svg>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  width: '100%',
  padding: '48px 24px',
  boxSizing: 'border-box',
  background: 'radial-gradient(120% 120% at 50% 0%, #fffaf0 0%, #fff 60%)',
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  padding: '48px 40px',
  borderRadius: '20px',
  background: '#ffffff',
  boxShadow: '0 10px 40px rgba(234, 88, 12, 0.12)',
  textAlign: 'center',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '28px',
  fontWeight: 700,
  letterSpacing: '0.02em',
  color: '#1c1917',
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  color: '#78716c',
  letterSpacing: '0.04em',
}

const buttonStyle: React.CSSProperties = {
  marginTop: '8px',
  padding: '10px 28px',
  fontSize: '14px',
  fontWeight: 600,
  color: '#ffffff',
  background: 'linear-gradient(135deg, #fb923c, #ea580c)',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
}
