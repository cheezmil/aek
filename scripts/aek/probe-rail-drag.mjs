#!/usr/bin/env node
/**
 * Probe the sidebar's drag-reorder with REAL pointer input.
 *
 * Why this exists: the reorder was "verified" with synthesised `DragEvent`s and
 * the user still saw the row move without the new order ever reaching
 * `<AEK_HOME>/preferences/aek-home.json`. Synthetic DnD proves the handlers are
 * wired; it says nothing about what Chromium does when a real pointer starts a
 * native drag. This script drives `Input.dispatchMouseEvent` (press, move,
 * release) over the live window through CDP and prints the DOM order plus the
 * persisted pref before and after, so "did it save" becomes a measurement.
 *
 * READ-ONLY BY DEFAULT: with no flags it only prints the current order.
 * `--yes` is required to actually drag (and therefore to write the pref).
 *
 * Usage:
 *   node scripts/aek/probe-rail-drag.mjs                 # print order, no input
 *   node scripts/aek/probe-rail-drag.mjs --yes           # drag row 0 below row 2
 *   node scripts/aek/probe-rail-drag.mjs --yes --from 0 --to 2
 *   node scripts/aek/probe-rail-drag.mjs --yes --restore # drag back to default
 *
 * @module scripts/aek/probe-rail-drag
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Walk up from this script until `pnpm-workspace.yaml` is found. */
function findRoot(start) {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}

const HERE = dirname(fileURLToPath(import.meta.url))
findRoot(HERE)
const CDP_PORT = Number(process.env.AEK_CDP_PORT ?? 1686)
const WEB_PORT = Number(process.env.AEK_WEB_PORT ?? 1685)
const argv = process.argv.slice(2)
const yes = argv.includes('--yes')
const restore = argv.includes('--restore')
/** @param flag @param fallback @returns {number} */
function num(flag, fallback) {
  const at = argv.indexOf(flag)
  const raw = at >= 0 ? argv[at + 1] : undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}
const FROM = num('--from', 0)
const TO = num('--to', 2)
// `--gap` releases the pointer in the gutter BETWEEN rows instead of on a row:
// the row-by-row drop handlers used to see no target at all there and threw the
// whole drag away, which is the likeliest reason "拖了但没保存".
const GAP = argv.includes('--gap')

/** @param path @returns {Promise<any>} */
async function getJson(path) {
  const response = await fetch(`http://127.0.0.1:${String(CDP_PORT)}${path}`)
  if (!response.ok) throw new Error(`CDP HTTP ${String(response.status)} for ${path}`)
  return await response.json()
}

/** Minimal CDP client over the global WebSocket. */
class Cdp {
  /** @param url - the target's webSocketDebuggerUrl. */
  constructor(url) {
    this.url = url
    this.id = 0
    this.pending = new Map()
    /** One-shot CDP event waiters. */
    this.listeners = []
  }

  /** @returns {Promise<void>} */
  async open() {
    this.ws = new WebSocket(this.url)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true })
      this.ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
    })
    this.ws.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (payload.id === undefined) {
        const index = this.listeners.findIndex(entry => entry.method === payload.method)
        if (index >= 0) {
          const [entry] = this.listeners.splice(index, 1)
          entry.deliver(payload.params)
        }
        return
      }
      const waiter = this.pending.get(payload.id)
      if (waiter === undefined) return
      this.pending.delete(payload.id)
      if (payload.error !== undefined) waiter.reject(new Error(JSON.stringify(payload.error)))
      else waiter.resolve(payload.result)
    })
  }

  /** @param method @param params @returns {Promise<any>} */
  send(method, params = {}) {
    return this.wait(this.fire(method, params), method)
  }

  /**
   * Send WITHOUT waiting for the reply. A pointer move inside an active native
   * drag never gets an answer, so awaiting it dead-locks the whole probe —
   * which is exactly what happened on the first attempt.
   * @param method @param params @returns {number} the request id
   */
  fire(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return id
  }

  /**
   * @param id - request id from {@link fire}.
   * @param method - for the error message.
   * @returns {Promise<any>} the reply.
   */
  wait(id, method) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 5000)
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
    })
  }

  /**
   * Resolve on the next CDP event of `method`.
   * @param method - e.g. `Input.dragIntercepted`.
   * @param timeoutMs - give up after this long.
   * @returns {Promise<any>} the event params.
   */
  once(method, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP event timeout: ${method}`)), timeoutMs)
      this.listeners.push({ method, deliver: (params) => { clearTimeout(timer); resolve(params) } })
    })
  }

  /** @param expression @returns {Promise<any>} */
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return result.result?.value
  }

  close() {
    this.ws.close()
  }
}

/** @param cdp @returns {Promise<Array<{label: string, x: number, y: number, h: number}>>} */
async function rows(cdp) {
  const value = await cdp.eval(`(() => [...document.querySelectorAll('aside nav li')].map((li) => {
    const box = li.getBoundingClientRect()
    return {
      label: (li.textContent ?? '').trim().slice(0, 14),
      x: Math.round(box.left + box.width / 2),
      y: Math.round(box.top + box.height / 2),
      h: Math.round(box.height),
    }
  }))()`)
  return Array.isArray(value) ? value : []
}

/** @returns {Promise<Record<string, unknown>>} */
async function prefs() {
  try {
    const response = await fetch(`http://127.0.0.1:${String(WEB_PORT)}/api/aek/preferences`)
    return await response.json()
  } catch {
    return {}
  }
}

const targets = await getJson('/json/list').catch(() => undefined)
if (targets === undefined) {
  process.stdout.write(`SKIPPED  no CDP endpoint on ${String(CDP_PORT)}\n`)
  process.exit(0)
}
const page = targets.find(item => item.type === 'page' && String(item.url).includes(String(WEB_PORT)))
if (page === undefined) {
  process.stdout.write(`SKIPPED  no console page on CDP ${String(CDP_PORT)}\n`)
  process.exit(0)
}

const cdp = new Cdp(page.webSocketDebuggerUrl)
await cdp.open()
await cdp.send('Page.enable')

const before = await rows(cdp)
const prefsBefore = await prefs()
process.stdout.write(`[before] dom    ${before.map(row => row.label).join(' | ')}\n`)
process.stdout.write(`[before] pref   ${String(prefsBefore['aek-home.order'] ?? '(none)')}\n`)

if (before.length === 0) {
  process.stdout.write('SKIPPED  sidebar has no rows (drawer collapsed?)\n')
  cdp.close()
  process.exit(0)
}
if (!yes) {
  process.stdout.write('[drag] dry run: pass --yes to drive a real pointer drag\n')
  cdp.close()
  process.exit(0)
}

// `--restore` is not a magic rewind: the caller names the two rows, which is
// the same information a real drag carries. Reject it early instead of
// silently doing nothing.
if (restore) {
  process.stdout.write('[drag] --restore is not a thing: pass --from/--to (indices in the rail)\n')
  cdp.close()
  process.exit(2)
}
const source = before[Math.min(FROM, before.length - 1)]
const target = before[Math.min(TO, before.length - 1)]
process.stdout.write(`[drag] ${source.label} (${String(source.x)},${String(source.y)}) → ${target.label} ${GAP ? 'gutter below' : 'bottom half'}\n`)

/**
 * Drive the native drag with drag interception on.
 *
 * Without interception, `Input.dispatchMouseEvent` stops answering the moment
 * Chromium hands the gesture to the platform drag loop (the same dead-lock as
 * `Page.reload`), which is how the first attempt hung. With `setInterceptDrags`
 * the browser reports `Input.dragIntercepted` and waits, and the probe then
 * feeds `dragEnter` / `dragOver` / `drop` back through `Input.dispatchDragEvent`
 * — real DnD semantics, deterministic timing.
 * @param cdp - the connected client.
 * @param from - source row.
 * @param to - target row.
 * @returns {Promise<void>}
 */
async function dragNative(cdp, from, to) {
  const landY = GAP ? Math.round(to.y + to.h / 2 + 3) : Math.round(to.y + to.h / 2 - 2)
  await cdp.send('Input.setInterceptDrags', { enabled: true })
  const intercepted = cdp.once('Input.dragIntercepted', 8000)
  // Fire-and-forget: replies stop coming once the drag loop owns the pointer.
  cdp.fire('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none', buttons: 0 })
  cdp.fire('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= 10; i++) {
    const y = Math.round(from.y + (landY - from.y) * (i / 10))
    cdp.fire('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y, button: 'left', buttons: 1 })
  }
  const { data } = await intercepted
  process.stdout.write(`[drag] intercepted items=${String(data?.items?.length ?? 0)}\n`)
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: from.x, y: from.y, data })
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: to.x, y: landY, data })
  await new Promise(resolve => setTimeout(resolve, 80))
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: to.x, y: landY, data })
  await cdp.send('Input.setInterceptDrags', { enabled: false })
  await new Promise(resolve => setTimeout(resolve, 700))
}

await dragNative(cdp, source, target)

const after = await rows(cdp)
const prefsAfter = await prefs()
process.stdout.write(`[after]  dom    ${after.map(row => row.label).join(' | ')}\n`)
process.stdout.write(`[after]  pref   ${String(prefsAfter['aek-home.order'] ?? '(none)')}\n`)
process.stdout.write(`[verdict] dom changed=${String(before.map(r => r.label).join() !== after.map(r => r.label).join())} pref changed=${String(prefsBefore['aek-home.order'] !== prefsAfter['aek-home.order'])}\n`)
cdp.close()
