/**
 * The AEK web-search management panel.
 *
 * The web profile replaces the dsh shell with the AEK home surface, so the
 * dsh Plugins page never renders and the websearch configuration card has
 * nowhere to live. This panel is that surface: it reads the provider facts
 * from the host over `GET /api/aek/websearch` (served by
 * `@cheezmil/aek-websearch/admin`) and toggles a provider with the matching
 * `POST`. The panel owns no state of its own — the host file is the truth,
 * so a refresh always shows what is actually configured.
 *
 * @module @cheezmil/aek-home/src/client/WebSearchPanel
 */

import { useCallback, useEffect, useState } from 'react'

/** The host route the panel talks to. */
const API_PATH = '/api/aek/websearch'

/** One provider's management facts, as the host reports them. */
interface ProviderStatus {
  /** The provider kind (adapter name). */
  kind: string
  /** Whether the provider is enabled in the host configuration. */
  enabled: boolean
  /** How many keys the encrypted pool holds; `undefined` when unreadable. */
  keyCount?: number | undefined
  /** Whether the provider has a key pool file at all. */
  hasPool: boolean
}

/** The status snapshot the host reports. */
interface WebsearchStatus {
  /** The AEK home directory the state lives in. */
  aekHome: string
  /** The providers configuration file. */
  providersFile: string
  /** One entry per known provider. */
  providers: ProviderStatus[]
}

/**
 * Fetch the current status from the host.
 * @returns the status snapshot.
 * @throws when the host does not answer with a usable payload.
 */
async function fetchStatus(): Promise<WebsearchStatus> {
  const response = await fetch(API_PATH, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await response.json() as WebsearchStatus
}

/**
 * Toggle one provider's enabled flag on the host.
 * @param kind - the provider kind to toggle.
 * @param enabled - the flag to write.
 * @returns the status snapshot the host answered with.
 */
async function writeEnabled(kind: string, enabled: boolean): Promise<WebsearchStatus> {
  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, enabled }),
  })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await response.json() as WebsearchStatus
}

/**
 * The web-search management panel: the provider list with its enabled flag
 * and key-pool facts, plus the toggle that writes the flag back.
 * @returns the panel.
 */
export function WebSearchPanel() {
  const [status, setStatus] = useState<WebsearchStatus | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void fetchStatus()
      .then((snapshot) => { if (!cancelled) setStatus(snapshot) })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { cancelled = true }
  }, [])

  const toggle = useCallback((kind: string, enabled: boolean) => {
    setPending(kind)
    setError(undefined)
    void writeEnabled(kind, enabled)
      .then(snapshot => setStatus(snapshot))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => setPending(undefined))
  }, [])

  return (
    <div style={panelStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>Web Search</h2>
        <p style={subtitleStyle}>多提供商搜索聚合 · 开关与密钥池状态</p>
      </header>

      {status === undefined && error === undefined
        ? <p style={hintStyle}>加载中…</p>
        : null}
      {error !== undefined
        ? <p style={errorStyle}>读取失败：{error}</p>
        : null}

      {status !== undefined
        ? (
          <>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>启用</th>
                  <th style={thStyle}>提供商</th>
                  <th style={thStyle}>密钥数</th>
                </tr>
              </thead>
              <tbody>
                {status.providers.map(provider => (
                  <tr key={provider.kind}>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={provider.enabled}
                        disabled={pending === provider.kind}
                        onChange={event => toggle(provider.kind, event.target.checked)}
                        aria-label={`启用 ${provider.kind}`}
                      />
                    </td>
                    <td style={tdStyle}>{provider.kind}</td>
                    <td style={tdStyle}>
                      {provider.keyCount === undefined
                        ? (provider.hasPool ? '—' : '无')
                        : String(provider.keyCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={hintStyle}>
              配置目录：{status.aekHome}
            </p>
          </>
        )
        : null}
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: '16px',
  border: '1px solid #f5f5f4',
  padding: '24px',
  boxShadow: '0 4px 20px rgba(234, 88, 12, 0.06)',
}

const headerStyle: React.CSSProperties = {
  marginBottom: '16px',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '18px',
  fontWeight: 700,
  color: '#1c1917',
}

const subtitleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: '13px',
  color: '#78716c',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '14px',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid #e7e5e4',
  color: '#78716c',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #f5f5f4',
  color: '#1c1917',
}

const hintStyle: React.CSSProperties = {
  margin: '12px 0 0',
  fontSize: '12px',
  color: '#a8a29e',
}

const errorStyle: React.CSSProperties = {
  margin: '12px 0 0',
  fontSize: '13px',
  color: '#dc2626',
}
