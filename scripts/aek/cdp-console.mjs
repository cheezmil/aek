#!/usr/bin/env node
/**
 * cdp-console — dump a dev-shell page's console errors through CDP.
 *
 * The BQ4 round's SPA-in-iframe verify needed the iframe context's console
 * (cdp-eval is read-only DOM, capture-ui has no console tap). This runner
 * navigates the current page target to a URL (or stays put), enables
 * Runtime/Log, and collects page errors + console entries for a bounded
 * window. READ-ONLY: it only navigates + listens; it never clicks or writes.
 *
 * Usage:
 *   node scripts/aek/cdp-console.mjs [port] [url] [waitMs]
 *   port    dev shell CDP port (default 1688; AEK_CDP_PORT overrides)
 *   url     optional Page.navigate target; empty/omitted = stay on current
 *   waitMs  how long to listen (default 8000)
 *
 * @module aek/scripts/aek/cdp-console
 */
const port = process.argv[2] || process.env.AEK_CDP_PORT || '1688'
const url = process.argv[3] || ''
const waitMs = Number(process.argv[4] || 8000)

const res = await fetch(`http://127.0.0.1:${port}/json`)
const targets = await res.json()
const page = targets.find(t => t.type === 'page')
if (!page) {
  console.error(`cdp-console: no page target on ${port} (is the dev shell running?)`)
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
const entries = []
let seq = 0
const send = (method, params = {}) => {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
}
ws.onopen = () => {
  send('Runtime.enable')
  send('Log.enable')
  if (url) {
    send('Page.enable')
    send('Page.navigate', { url })
  }
  setTimeout(finish, waitMs)
}
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    entries.push({ kind: 'page-error', text: (d.exception?.description || d.text || '').slice(0, 600), url: d.urlLocator?.url || d.url || '' })
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const p = msg.params
    if (p.type === 'error' || p.type === 'warn') {
      entries.push({ kind: `console.${p.type}`, context: p.executionContextUniqueId?.slice(0, 8) || '', text: p.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 600) })
    }
  } else if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry
    if (e.level === 'error') entries.push({ kind: 'log-error', text: `${e.source} ${e.url || ''} ${e.text || ''}`.trim().slice(0, 400) })
  }
}
function finish() {
  const dedup = [...new Map(entries.map(e => [JSON.stringify(e), e])).values()]
  console.log(JSON.stringify({ count: dedup.length, entries: dedup.slice(0, 30) }, null, 1))
  ws.close()
  process.exit(0)
}
setTimeout(() => {
  console.error('cdp-console: websocket timeout (30s)')
  process.exit(2)
}, 30000)
