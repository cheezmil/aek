/**
 * The AEK home landing — the AEK application shell. The dsh shell is not
 * mounted in the AEK web profile, so this surface owns the app root: a
 * greeting plus the AEK feature panels that live in this bundle.
 *
 * Identity text (the AEK wordmark and greeting) is plain localized copy,
 * like the brand-name span in @cheezmil/aek-base.
 * @module @cheezmil/aek-home/src/client/Home
 */

import { useState } from 'react'
import { WebSearchPanel } from './WebSearchPanel.tsx'

/** The panels the shell can show. */
type PanelId = 'home' | 'websearch'

/** No slot-owned props are required to render the home surface. */
export interface AekHomeProps {
  /** Optional click target that advances past the home surface. */
  onContinue?: () => void
}

/**
 * The AEK application shell: the greeting card plus the panel switcher.
 * @param props.onContinue - optional advance callback.
 * @returns the shell.
 */
export function AekHome({ onContinue }: AekHomeProps) {
  const [panel, setPanel] = useState<PanelId>('home')
  return (
    <div style={shellStyle}>
      <nav style={navStyle}>
        <button
          type="button"
          style={panel === 'home' ? activeTabStyle : tabStyle}
          onClick={() => setPanel('home')}
        >
          首页
        </button>
        <button
          type="button"
          style={panel === 'websearch' ? activeTabStyle : tabStyle}
          onClick={() => setPanel('websearch')}
        >
          Web Search
        </button>
      </nav>

      {panel === 'home'
        ? (
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
        )
        : (
          <div style={panelContainerStyle}>
            <WebSearchPanel />
          </div>
        )}
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

const shellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minHeight: '100vh',
  width: '100%',
  padding: '32px 24px 48px',
  boxSizing: 'border-box',
  background: 'radial-gradient(120% 120% at 50% 0%, #fffaf0 0%, #fff 60%)',
}

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '24px',
}

const tabStyle: React.CSSProperties = {
  padding: '8px 18px',
  fontSize: '14px',
  fontWeight: 600,
  color: '#78716c',
  background: 'transparent',
  border: '1px solid #e7e5e4',
  borderRadius: '999px',
  cursor: 'pointer',
}

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  color: '#ffffff',
  background: 'linear-gradient(135deg, #fb923c, #ea580c)',
  borderColor: 'transparent',
}

const panelContainerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '720px',
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
