/**
 * cdp-eval — run a read-only CDP expression against a dev shell's webui.
 *
 * The dev shell (next slot, `AEK_CDP_PORT` default 1688) exposes Chrome
 * DevTools Protocol over its HTTP endpoint; this runner evaluates one
 * expression in the page context with node's global WebSocket (no deps)
 * and prints the result as JSON. It existed as a throwaway in /tmp during
 * the III/III+ spacing rounds and was promoted here (repo rule: reusable
 * one-liners live in `scripts/aek`, no ad-hoc command stitching).
 *
 * CONVENTION (this repo's zero-arg-dry-run rule): a missing expression is
 * a safe no-op that prints usage — the script never navigates, writes, or
 * restarts anything by itself. Callers may navigate with the optional
 * `route` argument (a dev-shell document, `aek-next.localhost:1687<route>`),
 * but every expression must stay READ-ONLY (DOM queries, computed styles,
 * `localStorage`-free state reads); UI mutation belongs to cua-driver.
 *
 * Usage:
 *   node scripts/aek/cdp-eval.mjs [port] [route] <expression>
 *   port    dev shell CDP port (default 1688; `AEK_CDP_PORT` overrides)
 *   route   optional document route to load first (e.g. `/` or none)
 *   expression  JS evaluated in the page, awaited if it is a promise
 *
 * @module aek/scripts/aek/cdp-eval
 */
const host = process.env.AEK_CDP_HOST ?? 'aek-next.localhost'
// Positional interface (kept exactly as the throwaway /tmp version used it):
//   node scripts/aek/cdp-eval.mjs [port] [route] <expression>
// `route` may be the empty string (skip navigation, eval in the current page).
const port = process.argv[2] || process.env.AEK_CDP_PORT || '1688'
const route = process.argv[3]
const expr = process.argv[4]
if (!expr) {
  console.log('cdp-eval: usage: node scripts/aek/cdp-eval.mjs [port] [route] <readOnlyExpression>')
  console.log('          (no expression = safe no-op; route="" skips navigation)')
  process.exit(0)
}

const res = await fetch(`http://127.0.0.1:${port}/json`)
const targets = await res.json()
const page = targets.find(t => t.type === 'page')
if (!page) {
  console.error(`cdp-eval: no page target on ${host}:${port} (is the dev shell running?)`)
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const send = (method, params) => {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return id
}
let evalId = 0
ws.onopen = async () => {
  if (route) {
    const url = /^https?:\/\//.test(route) ? route : `http://${host}:1687${route}`
    send('Page.navigate', { url })
    await new Promise(resolve => setTimeout(resolve, 4000))
  }
  // The evaluate id depends on whether a navigation was sent first
  // (navigate=1, evaluate=2 vs evaluate=1) — track it, don't hardcode.
  evalId = send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
}
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id !== evalId) return
  if (msg.result?.exceptionDetails) {
    console.log(`EXC: ${JSON.stringify(msg.result.exceptionDetails).slice(0, 300)}`)
    process.exit(1)
  }
  console.log(JSON.stringify(msg.result?.result?.value ?? null, null, 1))
  ws.close()
  process.exit(0)
}
setTimeout(() => {
  console.error('cdp-eval: timeout (25s)')
  process.exit(2)
}, 25000)
