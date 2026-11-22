/**
 * hover-grace-probe — BG round (m03469): behavioral verification of the
 * row-actions hover-intent grace in RowActionsFloat.tsx.
 *
 * Drives SYNTHETIC mouse events at the rail row (read-only with respect to
 * any app state — no navigation, no clicks, no writes) and samples the
 * card's visibility class + computed pointer-events across the timing
 * window, proving the two properties the CSS-only BL round got wrong:
 *   1. AFTER the pointer leaves the row, the card stays GRABBABLE
 *      (pointer-events: auto, visible) through the 350ms grace window,
 *      so a cursor crossing the 8px gap re-enters the card and cancels
 *      the pending hide.
 *   2. Re-entering the card during the grace window KEEPS it visible
 *      past the original timer, and only a full leave of the card hides
 *      it again.
 *
 * Usage: node scripts/aek/hover-grace-probe.mjs [cdpPort=1691] [panel=skills]
 *
 * @module aek/scripts/aek/hover-grace-probe
 */
const port = process.argv[2] || process.env.AEK_CDP_PORT || '1691'
const panel = process.argv[3] || 'skills'

const res = await fetch(`http://127.0.0.1:${port}/json`)
const targets = await res.json()
const page = targets.find(t => t.type === 'page')
if (!page) {
  console.error(`hover-grace-probe: no page target on 127.0.0.1:${port} (is the shell running?)`)
  process.exit(1)
}

const expression = `
(async () => {
  const row = document.querySelector('li[data-panel="${panel}"]')
  if (!row) return { error: 'row not found', panel: "${panel}", url: location.href }
  const card = row.querySelector('.aek-row-actions')
  if (!card) return { error: 'card not found' }
  const sample = () => ({
    cls: card.className,
    visible: card.classList.contains('opacity-100'),
    pointerEvents: getComputedStyle(card).pointerEvents,
    opacity: getComputedStyle(card).opacity,
  })
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const report = { url: location.href, noFade: !!card.closest('.aek-nav-no-fade') }

  // 1. enter the row -> card shows (150ms fade).
  row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
  await wait(400)
  report.afterEnter = sample()

  // 2. leave the row -> pending hide, but grace window keeps it grabbable.
  row.dispatchEvent(new MouseEvent('mouseleave'))
  await wait(100)
  report.duringGrace = sample()

  // 3. cursor crosses the 8px gap onto the card inside the grace window.
  card.dispatchEvent(new MouseEvent('mouseenter'))
  await wait(600) // well past the original 350ms timer
  report.afterReenter = sample()

  // 4. full leave of the card -> hides after the grace window.
  card.dispatchEvent(new MouseEvent('mouseleave'))
  await wait(100)
  report.afterCardLeave_100ms = sample()
  await wait(450)
  report.afterCardLeave_550ms = sample()

  const g = report.duringGrace, r = report.afterReenter, f = report.afterCardLeave_550ms
  report.verdict =
    g.pointerEvents === 'auto' && g.visible === true &&
    r.visible === true &&
    f.visible === false && f.pointerEvents === 'none'
      ? 'PASS' : 'FAIL'
  return report
})()
`

const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const send = (method, params) => {
  seq += 1
  ws.send(JSON.stringify({ id: seq, method, params }))
  return seq
}
let evalId = 0
ws.onopen = () => {
  evalId = send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
}
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id !== evalId) return
  if (msg.result?.exceptionDetails) {
    console.log(`EXC: ${JSON.stringify(msg.result.exceptionDetails).slice(0, 400)}`)
    process.exit(1)
  }
  console.log(JSON.stringify(msg.result?.result?.value ?? null, null, 1))
  ws.close()
  process.exit(0)
}
setTimeout(() => {
  console.error('hover-grace-probe: timeout (30s)')
  process.exit(2)
}, 30000)
