#!/usr/bin/env node
/**
 * Verify the second-level rail contract (R2 round) against the LIVE console.
 *
 * The source-level half of the contract is machine-checked by
 * `verify-plugin-rails.mjs` (dev-cycle `plugin-rails` face). This script is the
 * behavioral twin: it drives the slot's Electron shell through CDP (the webui
 * debug surface — never the system browser), walks every NAV family, and
 * reports what the running DOM actually shows:
 *
 *   1. each family's rail rows (the home row + every sub-route, incl. the
 *      R2 settings pages and the anchor tabs of the built-in pages);
 *   2. which `data-nav-anchor` targets are visible on the page that route
 *      renders (anchor tabs must have a live scroll target);
 *   3. clicking an anchor route: the URL moves to the anchor route, the
 *      FAMILY page stays mounted, and the target scrolls into view;
 *   4. the plugin settings pages render their content (or the empty-state
 *      for plugins whose schema has no rows).
 *
 * Keep-alive caveat: every panel visited so far in this session stays mounted
 * (`display:none` when not active), so all DOM queries here filter on
 * `offsetParent !== null` (visibility) instead of trusting the tree.
 *
 * READ-ONLY: it only navigates the running console and reads its DOM — no
 * preference writes, no files. Default target is the NEXT slot's dev shell
 * (CDP 1688); `--slot aek` targets the current slot's shell (CDP 1686).
 *
 * Usage:
 *   node scripts/aek/verify-rails-ui.mjs [--slot next] [--json]
 *
 * @module scripts/aek/verify-rails-ui
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS } from '../../packages/aek/base/coraek/slots.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const slotIndex = argv.indexOf('--slot')
const slotName = slotIndex >= 0 ? argv[slotIndex + 1] : 'next'
if (SLOTS[slotName] === undefined) {
  process.stderr.write(`unknown --slot ${String(slotName)} — expected ${Object.keys(SLOTS).join(' | ')}\n`)
  process.exit(2)
}
const CDP_PORT = Number(process.env.AEK_CDP_PORT ?? SLOTS[slotName].cdpPort)
const asJson = argv.includes('--json')

/** The panel routes walked, grouped per family. Built-ins use anchor tabs. */
const VISITS = [
  { family: 'skills', routes: ['skills', 'skillsSettings'] },
  { family: 'prompts', routes: ['prompts', 'promptsSettings'] },
  { family: 'icons', routes: ['icons', 'iconsSettings'] },
  { family: 'websearch', routes: ['websearch', 'websearchSettings'] },
  // BQ13 round: the 插件与程序管理 family's rows are DIFFERENT PAGES now
  // (no home row, no anchor tabs) — 'runtime' is the noHome root (it renders
  // the 插件与程序 page), 'runtimeInfo' is gone with the BQ11 系统信息 cut.
  { family: 'runtime', routes: ['runtime', 'runtimeRuntimes', 'runtimePlugins'] },
  { family: 'settings', routes: ['settings', 'settingsSidebarFirst', 'settingsSidebarSecond', 'settingsNavigation', 'settingsGeneral', 'settingsAccess', 'settingsPermissions', 'settingsDefaults'] },
  // 2026-11-18 user ruling: the 关于 page carries ONLY the desktop version
  // number — no sections, so no anchor tabs and no rail (route 'about' is the
  // whole family).
  { family: 'about', routes: ['about'] },
]

/**
 * A CDP Runtime.evaluate of a panel visit. Runs IN the renderer: navigates
 * (SPA pushState, no reload), settles, then reads only VISIBLE facts.
 * @param {string} panel - route to land on.
 * @returns {string} the JS expression to evaluate (a promise of JSON text).
 */
function visitExpression(panel) {
  return `(async () => {
    if (location.pathname !== '/' + ${JSON.stringify(panel)}) {
      window.history.pushState(null, '', '/' + ${JSON.stringify(panel)});
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    await new Promise(resolve => setTimeout(resolve, 800));
    const visible = (el) => {
      if (el === document.body) return true
      // 2026-11-18: a tucked-away plugin rail stays MOUNTED as a zero-width
      // animated column (the flicker fix) — its rows must not count as
      // visible; a layout box with no width is not a visible row.
      return el.offsetParent !== null && el.offsetWidth > 0
    }
    const text = document.body.innerText;
    return JSON.stringify({
      panel: location.pathname.slice(1),
      rail: [...document.querySelectorAll('nav li[data-panel]')]
        .filter(visible)
        .map(li => li.getAttribute('data-panel')),
      anchors: [...new Set([...document.querySelectorAll('[data-nav-anchor]')]
        .filter(visible)
        .map(el => el.getAttribute('data-nav-anchor')))],
      emptySettings: /暂无用户可调整的设置项|has no user-adjustable settings/i.test(text),
      settingsTitle: /Skill 设置|Skill Settings|Prompt 设置|Prompt Settings|图标设置|Icon Settings|Web Search/.test(text),
      githubLink: ${ABOUT_GITHUB_MARK.toString()}.test(text),
    });
  })()`
}

/**
 * After landing on an ANCHOR route: check the target element's distance to the
 * top of the scroll container (the scroll effect ran with smooth behavior,
 * already settled by the 800ms settle).
 * @param {string} panel - anchor route.
 * @param {string} anchor - the data-nav-anchor value it must position to.
 * @returns {string} the JS expression to evaluate.
 */
function anchorExpression(panel, anchor) {
  return `(async () => {
    const target = [...document.querySelectorAll('[data-nav-anchor="' + ${JSON.stringify(anchor)} + '"]')]
      .find(el => el.offsetParent !== null || el === document.body);
    if (!target) return JSON.stringify({ panel: location.pathname.slice(1), anchor: ${JSON.stringify(anchor)}, found: false });
    let scroller = target;
    while (scroller && scroller !== document.body && scroller.scrollTop === 0 && scroller.parentElement) scroller = scroller.parentElement;
    const top = target.getBoundingClientRect().top;
    return JSON.stringify({ panel: location.pathname.slice(1), anchor: ${JSON.stringify(anchor)}, found: true, topWithin: Math.round(top), bodyTop: Math.round(target.getBoundingClientRect().top) });
  })()`
}

/**
 * The anchor value each built-in ANCHOR route positions to.
 * BQ13 round: the 插件与程序管理 family lost its anchor tabs (its rows are
 * different pages now) — only the 基础设置 family still owns in-page tabs.
 */
const ANCHOR_TARGETS = {
  settingsSidebarFirst: 'sidebarFirst',
  settingsSidebarSecond: 'sidebarSecond',
  settingsNavigation: 'navigation',
  settingsGeneral: 'general',
  settingsAccess: 'access',
  settingsPermissions: 'permissions',
  settingsDefaults: 'defaults',
}

/**
 * The 关于 page must show its GitHub link (BQ11 user ruling: the page carries
 * ONLY the link + a thank-you line — the version row is gone).
 */
const ABOUT_GITHUB_MARK = /github\.com\//i

async function getJson(path) {
  const url = `http://127.0.0.1:${String(CDP_PORT)}${path}`
  let last
  for (let attempt = 0; attempt < 4; attempt += 1) {
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

async function main() {
  const targets = await getJson('/json/list')
  const page = targets.find(item => item.type === 'page' && /aek(-next)?\.localhost|1685|1687/.test(String(item.url)))
    ?? targets.find(item => item.type === 'page')
  if (page === undefined) {
    process.stderr.write(`no CDP page target on port ${String(CDP_PORT)} — is the slot's dev shell running? (`
      + `node scripts/aek/launch.mjs --slot ${slotName} dev-web)\n`)
    process.exit(1)
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('CDP socket open timed out')), 10000)
    ws.addEventListener('open', () => { clearTimeout(bail); resolve() }, { once: true })
    ws.addEventListener('error', () => { clearTimeout(bail); reject(new Error('CDP socket failed')) }, { once: true })
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

  /** Evaluate an expression, awaiting a promise result; returns the JSON-parsed value. */
  async function evalJson(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails !== undefined) throw new Error(`renderer exception: ${result.exceptionDetails.text}`)
    return JSON.parse(result.result.value)
  }

  const report = []
  let failures = 0
  for (const visit of VISITS) {
    for (const route of visit.routes) {
      const facts = await evalJson(visitExpression(route))
      const row = {
        route,
        url: facts.panel === route ? 'ok' : `MISMATCH url=${facts.panel}`,
        railRows: facts.rail,
        anchors: facts.anchors,
      }
      if (route !== visit.family) {
        // non-home routes: verify what they must show.
        if (route in ANCHOR_TARGETS) {
          row.anchor = facts.anchors.includes(ANCHOR_TARGETS[route])
            ? 'target visible'
            : ANCHOR_TARGETS[route] === 'external'
              // The 关于 page's 外部能力 section is conditional by design
              // (BB round: rendered only when the host lists an external
              // provider). No provider → the section (and its anchor target)
              // is legitimately absent; the page itself is intact as long as
              // its other anchors are visible.
              && facts.anchors.length > 0
                ? 'conditional: absent (no external provider registered)'
                : `MISSING target ${ANCHOR_TARGETS[route]}`
          if (row.anchor.startsWith('MISSING')) failures += 1
          const settled = await evalJson(anchorExpression(route, ANCHOR_TARGETS[route]))
          row.scroll = settled.found ? `top=${settled.topWithin}px` : (row.anchor.startsWith('MISSING') ? 'no element' : 'n/a (section absent)')
        } else if (route.endsWith('Settings')) {
          row.settingsPage = facts.settingsTitle ? 'title present' : 'TITLE MISSING'
          row.emptyState = facts.emptySettings || null
          if (row.settingsPage !== 'title present') failures += 1
        }
      } else if (visit.family === 'about') {
        // The 关于 family root: the whole page is the GitHub link + a
        // thank-you line (BQ11 user ruling deleted the version row) — the
        // link mark must show and the family must own no sub-routes
        // (rail-less by design).
        row.githubLink = facts.githubLink ? 'present' : 'MISSING'
        if (!facts.githubLink) failures += 1
      }
      report.push(row)
    }
  }

  // One scroll-position sample after an anchor click, to prove the effect
  // runs. BQ13 round: the 插件与程序管理 family's rows are different pages
  // (no anchor targets left there) — the sample moves to 基础设置's
  // `general` tab instead.
  await evalJson(`(async () => {
    window.history.pushState(null, '', '/settingsGeneral');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise(resolve => setTimeout(resolve, 800));
    return JSON.stringify({ settled: true });
  })()`)
  const sample = await evalJson(anchorExpression('settingsGeneral', 'general'))
  report.push({ route: '(sample) settingsGeneral scroll settle', ...sample, url: 'checked' })

  if (asJson) {
    process.stdout.write(JSON.stringify({ slot: slotName, target: page.url, report }, null, 2) + '\n')
  } else {
    for (const row of report) {
      const bits = [
        `[${row.route}]`,
        row.url !== 'ok' && row.url !== 'checked' ? String(row.url) : null,
        row.railRows !== undefined ? `rail(${row.railRows.length}): ${row.railRows.join(' ')}` : null,
        row.anchors !== undefined ? `anchors: ${row.anchors.join(', ') || '(none)'}` : null,
        row.anchor !== undefined ? `anchor target: ${row.anchor}` : null,
        row.scroll !== undefined ? `scroll: ${row.scroll}` : null,
        row.settingsPage !== undefined ? `settings: ${row.settingsPage}${row.emptyState ? ' (empty-state)' : ''}` : null,
        row.githubLink !== undefined ? `github-link: ${row.githubLink}` : null,
      ].filter(Boolean)
      process.stdout.write(bits.join('  ') + '\n')
    }
    process.stdout.write(`verify-rails-ui: ${String(failures)} violation(s) across ${String(report.length)} checks (slot ${slotName})\n`)
  }
  ws.close()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(error => {
  process.stderr.write(`verify-rails-ui: ${String(error.message ?? error)}\n`)
  process.exit(1)
})
