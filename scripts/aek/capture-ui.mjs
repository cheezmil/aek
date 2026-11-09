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
 *   node scripts/aek/capture-ui.mjs --yes --panel 设置     # open a panel first
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
import { slotHome } from './shared-logic.mjs'

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
const CDP_PORT = Number(process.env.AEK_CDP_PORT ?? 1686)
const argv = process.argv.slice(2)
const yes = argv.includes('--yes')
const panelIndex = argv.indexOf('--panel')
const PANEL = panelIndex >= 0 ? argv[panelIndex + 1] : undefined
const scroll = argv.includes('--scroll-bottom')
// The console keeps its scroll position between captures, so a shot of the TOP
// of a panel needs an explicit reset; `--scroll-top` is that reset.
const scrollTop = argv.includes('--scroll-top')
// `--eval <expr>` prints one expression's value and exits without writing a
// PNG. Handy for checking layout facts (row order, computed styles) instead of
// eyeballing a screenshot.
const evalIndex = argv.indexOf('--eval')
const EVAL = evalIndex >= 0 ? argv[evalIndex + 1] : undefined
const outIndex = argv.indexOf('--out')
const OUT = outIndex >= 0 && argv[outIndex + 1] !== undefined
  ? argv[outIndex + 1]
  : join(slotHome('aek'), 'shots')

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
      const waiter = this.pending.get(payload.id)
      if (waiter === undefined) return
      this.pending.delete(payload.id)
      if (payload.error !== undefined) waiter.reject(new Error(JSON.stringify(payload.error)))
      else waiter.resolve(payload.result)
    })
  }

  /** @param method @param params @returns {Promise<any>} */
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }) })
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
const page = targets.find(item => item.type === 'page' && String(item.url).includes('1685'))
if (page === undefined) {
  process.stdout.write('SKIPPED  no console page on CDP 1686 — is AEK.app running?\n')
  process.exit(0)
}
process.stdout.write(`[cdp] ${String(page.title)} → ${String(page.url)}\n`)
if (!yes) {
  process.stdout.write('[shot] dry run: pass --yes to write PNGs\n')
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
let cdp = new Cdp(page.webSocketDebuggerUrl)
await cdp.open()
await cdp.send('Page.enable')

if (EVAL !== undefined) {
  const result = await cdp.send('Runtime.evaluate', { expression: EVAL, returnByValue: true, awaitPromise: true })
  process.stdout.write(`${JSON.stringify(result.result?.value ?? null, null, 2)}\n`)
  cdp.close()
  process.exit(0)
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

// Optionally open one sidebar panel by its visible label before the first shot.
if (PANEL !== undefined) {
  const click = `(() => {
    const rows = [...document.querySelectorAll('aside nav button')]
    const hit = rows.find(item => (item.textContent ?? '').includes(${JSON.stringify(PANEL)}))
    if (hit === undefined) return 'not-found'
    hit.click()
    return 'clicked'
  })()`
  const result = await cdp.send('Runtime.evaluate', { expression: click, returnByValue: true })
  process.stdout.write(`[shot] panel ${PANEL} → ${String(result.result?.value)}\n`)
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
await shot(cdp, join(OUT, `console-expanded${suffix}.png`))

// Collapse the sidebar via the brand button, capture, then restore the lock.
const clickBrand = `(() => {
  const button = document.querySelector('aside button[aria-expanded]')
  if (button === null) return 'no-brand-button'
  button.click()
  return 'clicked'
})()`
const before = await cdp.send('Runtime.evaluate', { expression: clickBrand, returnByValue: true })
process.stdout.write(`[shot] collapse → ${String(before.result?.value)}\n`)
await shot(cdp, join(OUT, 'console-collapsed.png'))
const after = await cdp.send('Runtime.evaluate', { expression: clickBrand, returnByValue: true })
process.stdout.write(`[shot] restore → ${String(after.result?.value)}\n`)
cdp.close()
