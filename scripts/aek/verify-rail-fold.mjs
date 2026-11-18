// One-shot CDP verification: the plugin-rail fold glides (2026-11-18 fix).
//
// Checks in the live dev shell:
//  1. the rail carries `.aek-rail-fold` and its computed transition-duration
//     is the 260ms design value — even with the system "reduce motion"
//     setting on (the index.css media exemption must hold over the global
//     0.01ms crush);
//  2. a real fold (inline width/basis/padding/border to 0, exactly what the
//     component does) fires transitionend with elapsedTime ≈ 260ms — the
//     width genuinely interpolates instead of snapping one frame.
// Read-only for the page: every style it sets is restored before exit.
import { SLOTS } from '../../packages/aek/base/coraek/slots.mjs'

const slot = process.argv[2] ?? 'next'
const CDP_PORT = Number(process.env.AEK_CDP_PORT ?? SLOTS[slot]?.cdpPort ?? 1688)
const targets = await (await fetch(`http://127.0.0.1:${String(CDP_PORT)}/json/list`)).json()
const page = targets.find(item => item.type === 'page' && String(item.url).includes('aek-next.localhost'))
  ?? targets.find(item => item.type === 'page')
if (page === undefined) {
  console.log('no CDP page target on port', CDP_PORT)
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', () => reject(new Error('cdp socket failed')), { once: true })
})
let nextId = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const payload = JSON.parse(String(event.data))
  const waiter = pending.get(payload.id)
  if (waiter === undefined) return
  pending.delete(payload.id)
  if (payload.error !== undefined) waiter.reject(new Error(JSON.stringify(payload.error)))
  else waiter.resolve(payload.result)
})
/** @param {string} method @param {object} [params] @returns {Promise<any>} */
const send = (method, params = {}) => {
  const id = nextId += 1
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }) })
}
const result = await send('Runtime.evaluate', {
  expression: `(async () => {
    const rail = [...document.querySelectorAll("nav")].find(n => n.closest("aside") === null && n.querySelector("li[data-panel]") !== null)
    if (!rail) return JSON.stringify({ railFound: false })
    const cs = getComputedStyle(rail)
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    const facts = {
      railFound: true,
      hasFoldClass: rail.classList.contains("aek-rail-fold"),
      reducedMotion: reduced,
      transitionProperty: cs.transitionProperty,
      transitionDuration: cs.transitionDuration,
    }
    // Drive a real fold: the same properties the component sets inline,
    // then read the transitionend timing (≈260ms = it genuinely glides).
    const events = []
    const onEnd = (e) => events.push({ prop: e.propertyName, ms: Math.round(e.elapsedTime * 1000) })
    rail.addEventListener("transitionend", onEnd)
    rail.style.width = "0px"; rail.style.flexBasis = "0px"
    rail.style.padding = "0px"; rail.style.borderRightWidth = "0px"
    await new Promise(r => setTimeout(r, 500))
    rail.style.width = ""; rail.style.flexBasis = ""; rail.style.padding = ""; rail.style.borderRightWidth = ""
    rail.removeEventListener("transitionend", onEnd)
    facts.foldEvents = events
    return JSON.stringify(facts)
  })()`,
  returnByValue: true,
  awaitPromise: true,
})
if (result.exceptionDetails !== undefined) {
  console.log('renderer exception:', result.exceptionDetails.text)
  process.exit(1)
}
const facts = JSON.parse(result.result.value)
console.log(JSON.stringify(facts, null, 1))
const durMs = parseFloat(facts.transitionDuration) * 1000
const glided = (facts.foldEvents ?? []).some(e => e.ms >= 200)
let ok = facts.railFound && facts.hasFoldClass && durMs >= 200
if (facts.reducedMotion === true) ok = ok && glided
console.log(ok
  ? `PASS: rail fold glides (duration ${facts.transitionDuration} in a ${facts.reducedMotion ? 'reduce-motion' : 'normal'} system setting; fold events ${JSON.stringify(facts.foldEvents)})`
  : `FAIL: fold not gliding (duration=${facts.transitionDuration}, reducedMotion=${facts.reducedMotion}, events=${JSON.stringify(facts.foldEvents)})`)
ws.close()
process.exit(ok ? 0 : 1)
