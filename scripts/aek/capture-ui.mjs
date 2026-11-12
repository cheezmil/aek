#!/usr/bin/env node
/**
 * Capture the AEK console through the desktop shell's DevTools protocol.
 *
 * Why this exists: several layout complaints ("侧边栏收纳后样式错乱") can only be
 * judged by looking at the real window. Driving the AppKit window screenshot is
 * fragile and needs TCC approval, while the CDP port (1686) is already open for
 * the running shell. This script therefore asks Chromium for a PNG.
 *
 * READ-ONLY BY DEFAULT: with no flags it only prints the CDP targets. Writing
 * files requires `--yes`. It never mutates preferences permanently: the
 * collapsed-sidebar shot clicks the brand button, captures, then clicks back.
 *
 * Usage:
 *   node scripts/aek/capture-ui.mjs                        # list targets
 *   node scripts/aek/capture-ui.mjs --yes                  # expanded + collapsed
 *   node scripts/aek/capture-ui.mjs --slot next --yes      # the NEXT slot's shell (CDP 1688)
 *   node scripts/aek/capture-ui.mjs --yes --panel 设置     # open a panel first
 *   node scripts/aek/capture-ui.mjs --yes --clip 0,600,280,400,2
 *                                                          # zoomed viewport clip (x,y,w,h[,scale])
 *   node scripts/aek/capture-ui.mjs --yes --no-collapse    # only the current state
 *   node scripts/aek/capture-ui.mjs --yes --motion         # emulate a motion-ok viewer
 *   node scripts/aek/capture-ui.mjs --yes --scroll-top     # top of the panel
 *   node scripts/aek/capture-ui.mjs --yes --scroll-bottom
 *   node scripts/aek/capture-ui.mjs --yes --out <dir>
 *   node scripts/aek/capture-ui.mjs --yes --eval "<expr>"  # print a value, no PNG
 *
 * There is deliberately NO `--reload`: `Page.reload` never answers once the
 * renderer is torn down, and reconnecting a socket to the old target hangs as
 * well. In dev the profile hot-reloads `@cheezmil/aek-home/lib` on rebuild; for
 * a full page refresh restart the shell (`start-dev.mjs`).
 *
 * @module scripts/aek/capture-ui
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slotHome, SLOTS } from './shared-logic.mjs'

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
const ROOT = findRoot(HERE)
const argv = process.argv.slice(2)
// `--slot next` targets the sibling slot's dev shell (CDP 1688, console page on
// 1687). Default stays `aek` so every pre-existing invocation is unchanged.
// `AEK_CDP_PORT` (the launcher's env convention) still wins when set.
const slotIndex = argv.indexOf('--slot')
const slotName = slotIndex >= 0 ? argv[slotIndex + 1] : 'aek'
const slotCfg = SLOTS[slotName]
if (slotCfg === undefined) {
  process.stderr.write(`unknown --slot ${String(slotName)} — expected ${Object.keys(SLOTS).join(' | ')}\n`)
  process.exit(2)
}
const CDP_PORT = Number(process.env.AEK_CDP_PORT ?? slotCfg.cdpPort)
const yes = argv.includes('--yes')
const panelIndex = argv.indexOf('--panel')
const PANEL = panelIndex >= 0 ? argv[panelIndex + 1] : undefined
const scroll = argv.includes('--scroll-bottom')
// The console keeps its scroll position between captures, so a shot of the TOP
// of a panel needs an explicit reset; `--scroll-top` is that reset.
const scrollTop = argv.includes('--scroll-top')
// `--no-collapse` keeps whatever rail state the window is in: the default
// sequence assumes an expanded rail, so with a persisted collapsed pref the
// two shots came out swapped.
const noCollapse = argv.includes('--no-collapse')
// This machine has macOS "Reduce motion" switched on, so `prefers-reduced-motion`
// collapses every transition to 0.01ms and animations cannot be observed (or
// screenshotted mid-flight). `--motion` emulates a normal-motion viewer.
const forceMotion = argv.includes('--motion')
// `--eval <expr>` prints one expression's value and exits without writing a
// PNG. Handy for checking layout facts (row order, computed styles) instead of
// eyeballing a screenshot.
const evalIndex = argv.indexOf('--eval')
const EVAL = evalIndex >= 0 ? argv[evalIndex + 1] : undefined
const outIndex = argv.indexOf('--out')
const OUT = outIndex >= 0 && argv[outIndex + 1] !== undefined
  ? argv[outIndex + 1]
  : join(slotHome(slotCfg.slot), 'shots')
// `--clip <x,y,w,h[,scale]>` captures ONE zoomed viewport region and exits:
// the layout-eyeballing zoom shot (a full-frame PNG of a dense 2560px console
// loses the spacing detail). Implemented as `Page.captureScreenshot` with a
// `clip`, so no image library is needed — the renderer does the crop.
const clipIndex = argv.indexOf('--clip')
const CLIP = clipIndex >= 0 ? argv[clipIndex + 1] : undefined

/**
 * GET one CDP HTTP path with a per-request timeout and a short retry.
 *
 * The Chromium DevTools HTTP server can accept the TCP connect and then sit
 * quiet for a while (the renderer is busy, e.g. right after a panel click).
 * A bare `fetch` would hang forever; this bounds each attempt and retries a
 * couple of times before giving up.
 * @param path - the CDP HTTP path, e.g. `/json/list`.
 * @returns {Promise<any>} the parsed JSON body.
 */
async function getJson(path) {
  const url = `http://127.0.0.1:${String(CDP_PORT)}${path}`
  let last
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (!response.ok) throw new Error(`CDP HTTP ${String(response.status)} for ${path}`)
      return await response.json()
    } catch (error) {
      last = error
      await new Promise(resolve => setTimeout(resolve, 400))
    }
  }
  throw last
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
      // Same stall mode as the HTTP endpoint: bound it, or this script wedges
      // the whole screenshot loop.
      const bail = setTimeout(() => reject(new Error('CDP socket open timed out')), 10000)
      this.ws.addEventListener('open', () => { clearTimeout(bail); resolve() }, { once: true })
      this.ws.addEventListener('error', () => { clearTimeout(bail); reject(new Error('CDP socket failed')) }, { once: true })
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
   * One CDP call with a response timeout and one automatic session rebuild.
   *
   * On this machine a CDP session can WEDGE: the target keeps answering every
   * fresh session but stops answering the one we hold (observed: mid
   * collapse/restore, the session's next RPC never comes back while a second
   * session evaluates in 3ms). Retrying on the SAME socket cannot recover;
   * opening a fresh session can. The rebuild RE-FETCHES the current page
   * target, because a page reload orphans the old target's WS url.
   * @param method - CDP method name.
   * @param params - CDP parameters.
   * @param options - `{ timeoutMs }`, default 15s.
   * @returns {Promise<any>} the method result.
   */
  async send(method, params = {}, options = {}) {
    const timeoutMs = options.timeoutMs ?? 15000
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = ++this.id
      const reply = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new Error(`CDP ${method} timed out after ${String(timeoutMs)}ms`))
        }, timeoutMs)
        timer.unref?.()
        this.pending.set(id, { resolve, reject })
      })
      this.ws.send(JSON.stringify({ id, method, params }))
      try {
        return await reply
      } catch (error) {
        if (attempt === 0) {
          // Abandon the wedged session entirely (its pending replies can
          // never come) and retry the call on a fresh socket pointed at the
          // CURRENT page target.
          this.pending.clear()
          this.close()
          const fresh = await getJson('/json/list')
          const live = fresh.find(item => item.type === 'page' && String(item.url).includes(String(slotCfg.webPort)))
          this.url = (live ?? fresh.find(item => item.type === 'page'))?.webSocketDebuggerUrl ?? this.url
          await this.open()
          continue
        }
        throw error
      }
    }
    throw new Error(`CDP ${method} failed twice (see above)`)
  }

  close() {
    this.ws.close()
  }
}

/** @param cdp @param path @returns {Promise<void>} */
async function shot(cdp, path) {
  await new Promise(resolve => setTimeout(resolve, 450))
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path, Buffer.from(result.data, 'base64'))
  process.stdout.write(`[shot] ${path}\n`)
}

let targets
try {
  targets = await getJson('/json/list')
} catch {
  // A packaged shell runs without `--remote-debugging-port`, so the port is
  // simply closed. That is a normal state, not an error: say so and exit 0.
  process.stdout.write(`SKIPPED  no CDP endpoint on ${String(CDP_PORT)} — only the dev shell opens it\n`)
  process.exit(0)
}
const page = targets.find(item => item.type === 'page' && String(item.url).includes(String(slotCfg.webPort)))
if (page === undefined) {
  process.stdout.write(`SKIPPED  no console page on CDP ${String(CDP_PORT)} — is the ${slotCfg.productName} dev shell running?\n`)
  process.exit(0)
}
process.stdout.write(`[cdp] ${String(page.title)} → ${String(page.url)}\n`)
if (!yes) {
  process.stdout.write('[shot] dry run: pass --yes to write PNGs\n')
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
// Never let one wedged CDP session park the whole screenshot loop: a hard
// global stop makes the caller's retry (fresh shell half if needed) kick in.
const globalWatchdog = setTimeout(() => {
  process.stderr.write('[shot] global timeout — CDP wedged; exiting so the caller can retry\n')
  process.exit(1)
}, 90000)
globalWatchdog.unref?.()
let cdp = new Cdp(page.webSocketDebuggerUrl)
await cdp.open()
await cdp.send('Page.enable')

if (forceMotion) {
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  })
}

// The shell may still be painting right after a restart; wait for the React
// root before clicking anything, otherwise the panel click lands on nothing.
let ready = false
for (let i = 0; i < 40; i++) {
  const probe = await cdp.send('Runtime.evaluate', {
    expression: "document.querySelector('aside nav') !== null",
    returnByValue: true,
  })
  if (probe.result?.value === true) { ready = true; break }
  await new Promise(resolve => setTimeout(resolve, 250))
}
process.stdout.write(`[shot] console ready=${String(ready)}\n`)

// `--clip` is a standalone zoomed capture: grab the requested viewport region
// (the renderer crops it, no image library) and exit. It runs AFTER the ready
// wait so the renderer is up, but BEFORE any panel click (the region is what
// is on screen now).
if (CLIP !== undefined) {
  const parts = String(CLIP).split(',').map(s => s.trim())
  const clip = {
    x: Number(parts[0] ?? 0),
    y: Number(parts[1] ?? 0),
    width: Number(parts[2] ?? 200),
    height: Number(parts[3] ?? 200),
    scale: Number(parts[4] ?? 2),
  }
  // x / y may be 0 (the top-left corner); width / height / scale must be > 0.
  if (!Number.isFinite(clip.x) || !Number.isFinite(clip.y) || clip.x < 0 || clip.y < 0 ||
    clip.width <= 0 || clip.height <= 0 || clip.scale <= 0) {
    process.stderr.write(`invalid --clip "${CLIP}" (expected x,y,w,h[,scale]; x,y >= 0; w,h,scale > 0)\n`)
    process.exit(2)
  }
  await new Promise(resolve => setTimeout(resolve, 200))
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', clip })
  const clipPath = join(OUT, `clip-${String(clip.x)}-${String(clip.y)}-${String(clip.width)}x${String(clip.height)}@${String(clip.scale)}.png`)
  writeFileSync(clipPath, Buffer.from(result.data, 'base64'))
  process.stdout.write(`[clip] ${clipPath}\n`)
  cdp.close()
  process.exit(0)
}

// Optionally open one sidebar panel by its visible label before the first shot.
// Rows live in `li[data-panel]`; the drawer GROUP headers are plain buttons
// whose labels (「插件」/「其他」) would otherwise intercept a substring click
// and just toggle the drawer. A COLLAPSED drawer keeps its rows out of the DOM
// entirely, so expand every closed drawer group first, then click the row.
if (PANEL !== undefined) {
  const click = `(async () => {
    const heads = [...document.querySelectorAll('aside nav button[aria-expanded]')]
      .filter(b => (b.parentElement?.className ?? '').includes('drawerGroup'))
    heads.filter(b => b.getAttribute('aria-expanded') === 'false').forEach(b => b.click())
    await new Promise(r => setTimeout(r, 80))
    const rows = [...document.querySelectorAll('aside nav li[data-panel]')]
    const hit = rows.find(item => ((item.querySelector('button')?.textContent ?? '')).includes(${JSON.stringify(PANEL)}))
    if (hit === undefined) return 'not-found'
    hit.querySelector('button').click()
    // Let the panel's async content settle: sample the main text twice, 250ms
    // apart, and consider it loaded when it stops changing (cold loads fetch
    // from the API and would otherwise be shot mid-fetch).
    let prev = ''
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250))
      const now = document.querySelector('main')?.innerText ?? document.body.innerText ?? ''
      if (now === prev && now.length > 0) break
      prev = now
    }
    return hit.dataset.panel
  })()`
  const result = await cdp.send('Runtime.evaluate', { expression: click, returnByValue: true, awaitPromise: true })
  process.stdout.write(`[shot] panel ${PANEL} → ${String(result.result?.value)}\n`)
}

// `--eval` runs AFTER the panel click: measuring the panel the user asked for
// was impossible while this block sat above the click (it always read whatever
// panel happened to be open).
if (EVAL !== undefined) {
  const result = await cdp.send('Runtime.evaluate', { expression: EVAL, returnByValue: true, awaitPromise: true })
  process.stdout.write(`${JSON.stringify(result.result?.value ?? null, null, 2)}\n`)
  cdp.close()
  process.exit(0)
}

if (scrollTop) {
  await cdp.send('Runtime.evaluate', {
    expression: "document.querySelectorAll('main, .content, [class*=content]').forEach(node => { node.scrollTop = 0 }); window.scrollTo(0, 0)",
  })
}
if (scroll) {
  await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)' })
}

const suffix = `${PANEL === undefined ? '' : `-${PANEL}`}${scroll ? '-bottom' : ''}${scrollTop ? '-top' : ''}`
// With `--no-collapse` the rail may already be collapsed, so do not lie about
// it in the filename.
const railState = await cdp.send('Runtime.evaluate', {
  expression: "document.querySelector('aside')?.className.includes('sidebarCompact') ? 'collapsed' : 'expanded'",
  returnByValue: true,
})
const stateName = noCollapse ? `console-${String(railState.result?.value ?? 'state')}` : 'console-expanded'
await shot(cdp, join(OUT, `${stateName}${suffix}.png`))

if (noCollapse) {
  cdp.close()
  process.exit(0)
}

// Collapse the sidebar via the brand button, capture, then restore the lock.
const clickBrand = `(() => {
  const button = document.querySelector('aside button[aria-expanded]')
  if (button === null) return 'no-brand-button'
  button.click()
  return 'clicked'
})()`
const before = await cdp.send('Runtime.evaluate', { expression: clickBrand, returnByValue: true })
// Wait for the rail to finish narrowing: without this the shot catches the
// 260ms transition mid-flight and every metric in the PNG is a lie.
await cdp.send('Runtime.evaluate', {
  expression: `new Promise(resolve => {
    const start = performance.now()
    let last = -1
    let same = 0
    let moved = false
    const tick = () => {
      const aside = document.querySelector('aside')
      const width = aside === null ? -1 : Math.round(aside.getBoundingClientRect().width)
      // The click is handled by React, so the first frames still show the OLD
      // width; a plain "stable for 3 frames" test would resolve immediately and
      // the "collapsed" PNG would be a picture of the expanded rail.
      if (width !== initialWidth) moved = true
      same = width === last ? same + 1 : 0
      last = width
      if (moved && (same >= 3 || performance.now() - start > 1200)) resolve(width)
      else if (!moved && performance.now() - start > 1200) resolve(width)
      else requestAnimationFrame(tick)
    }
    const initialWidth = Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? -1)
    tick()
  })`,
  awaitPromise: true,
})
process.stdout.write(`[shot] collapse → ${String(before.result?.value)}\n`)
await shot(cdp, join(OUT, 'console-collapsed.png'))
const after = await cdp.send('Runtime.evaluate', { expression: clickBrand, returnByValue: true })
process.stdout.write(`[shot] restore → ${String(after.result?.value)}\n`)
cdp.close()
