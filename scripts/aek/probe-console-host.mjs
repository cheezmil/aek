#!/usr/bin/env node
/**
 * Live probe: does a console page opened on the loopback LITERAL hop to the
 * slot's canonical host?
 *
 * Why this matters (2026-11-10): Chromium keys site zoom by host and drops the
 * port, so `127.0.0.1:1685` shared one zoom level with every other local web UI
 * (`127.0.0.1:<port>`), including the DeepSeek Harness web UI. The console is
 * served under `aek.localhost`; `CanonicalHost.tsx` redirects a page that was
 * opened on the literal. A redirect is exactly the kind of thing that "looks
 * right" in a unit test and never fires in the browser, so this probe drives a
 * real navigation over CDP.
 *
 * READ-ONLY by default: reports the current URL of the running window.
 * `--yes` navigates the window to the literal, waits for the hop, then returns
 * it to the canonical URL (the window ends up where it started).
 *
 * Usage:
 *   node scripts/aek/probe-console-host.mjs          # report only
 *   node scripts/aek/probe-console-host.mjs --yes    # navigate + verify + restore
 *   node scripts/aek/probe-console-host.mjs --json
 */
import { SLOTS, webUrl } from '../../packages/aek/base/coraek/slots.mjs'

const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const GO = argv.includes('--yes')
const SLOT = 'aek'
const CFG = SLOTS[SLOT]
const CDP_PORT = Number(process.env.AEK_CDP_PORT ?? CFG.cdpPort)
const WEB_PORT = Number(process.env.AEK_WEB_PORT ?? CFG.webPort)
const CANONICAL = webUrl(SLOT, WEB_PORT)
const LITERAL = `http://127.0.0.1:${String(WEB_PORT)}/`

/** @param path @returns {Promise<any>} */
async function getJson(path) {
  const response = await fetch(`http://127.0.0.1:${String(CDP_PORT)}${path}`, { signal: AbortSignal.timeout(3000) })
  if (!response.ok) throw new Error(`CDP HTTP ${String(response.status)}`)
  return await response.json()
}

/** Minimal CDP client over the global WebSocket. */
class Cdp {
  /** @param url - the target's webSocketDebuggerUrl. */
  constructor(url) {
    this.url = url
    this.id = 0
    this.pending = new Map()
  }

  /** @returns {Promise<void>} */
  async open() {
    this.ws = new WebSocket(this.url)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => { resolve() }, { once: true })
      this.ws.addEventListener('error', () => { reject(new Error('CDP socket failed')) }, { once: true })
    })
    this.ws.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      const waiter = this.pending.get(payload.id)
      if (waiter === undefined) return
      this.pending.delete(payload.id)
      if (payload.error !== undefined) waiter.reject(new Error(JSON.stringify(payload.error)))
      else waiter.resolve(payload.result)
    })
  }

  /**
   * @param method - CDP method.
   * @param params - CDP params.
   * @returns {Promise<any>} the result.
   */
  async send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 15000)
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
    })
  }

  close() {
    this.ws.close()
  }
}

/** @param cdp @param expression @returns {Promise<any>} */
async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  })
  return result.result?.value
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let targets
try {
  targets = await getJson('/json/list')
} catch {
  process.stdout.write(`SKIPPED  no CDP endpoint on ${String(CDP_PORT)} — only the dev shell opens it\n`)
  process.exit(0)
}
const page = targets.find(item => item.type === 'page')
if (page === undefined) {
  process.stdout.write('SKIPPED  no page target\n')
  process.exit(0)
}

const cdp = new Cdp(page.webSocketDebuggerUrl)
await cdp.open()
await cdp.send('Page.enable')

const report = { canonical: CANONICAL, literal: LITERAL, before: await evaluate(cdp, 'location.href'), hop: undefined, restored: undefined }

if (GO) {
  await cdp.send('Page.navigate', { url: LITERAL })
  await sleep(2500)
  // `location.replace` is asynchronous from the test's point of view: poll a
  // few times instead of assuming one fixed delay is enough.
  for (let attempt = 0; attempt < 10; attempt++) {
    report.hop = await evaluate(cdp, 'location.href')
    if (typeof report.hop === 'string' && !report.hop.startsWith(LITERAL)) break
    await sleep(400)
  }
  await cdp.send('Page.navigate', { url: `${CANONICAL}/` })
  await sleep(1500)
  report.restored = await evaluate(cdp, 'location.href')
}

cdp.close()

const problems = []
if (GO) {
  const hopped = typeof report.hop === 'string' && report.hop.startsWith(`${CANONICAL}/`)
  if (!hopped) problems.push(`opening ${LITERAL} did not hop to ${CANONICAL} (stayed at ${String(report.hop)})`)
  if (typeof report.restored !== 'string' || !report.restored.startsWith(CANONICAL)) {
    problems.push(`the window was not restored to ${CANONICAL}`)
  }
} else {
  // Read-only mode still tells the truth about the current page.
  if (typeof report.before === 'string' && report.before.startsWith(LITERAL)) {
    problems.push(`the window is sitting on ${LITERAL} — that origin shares Chromium's zoom with every other local app`)
  }
}

if (JSON_OUT) console.log(JSON.stringify({ ...report, problems }, null, 2))
else {
  console.log(`[host] canonical ${CANONICAL}`)
  console.log(`[host] current   ${String(report.before)}`)
  if (GO) {
    console.log(`[host] after literal navigation → ${String(report.hop)}`)
    console.log(`[host] restored → ${String(report.restored)}`)
  }
  for (const problem of problems) console.log(`FAIL  ${problem}`)
  if (problems.length === 0) console.log('[host] loopback pages hop to the canonical host')
}
process.exit(problems.length === 0 ? 0 : 1)
