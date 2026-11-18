#!/usr/bin/env node
/**
 * rail-fold-motion — verify that BOTH side rails keep their show/stow fold
 * animation under every `prefers-reduced-motion` state.
 *
 * Why this exists (2026-11-19): the user reported the FIRST-level rail
 * (the main navigation) snapping shut / open while the SECOND-level rail
 * (the plugin route column) glided. Root cause: the system "reduce motion"
 * setting is ON, and index.css carries a GLOBAL crush
 * (`* { transition-duration: 0.01ms !important }` on
 * `prefers-reduced-motion: reduce`) that the 2026-11-18 `.aek-rail-fold`
 * exemption had only lifted for the plugin rail. The first-level rail's
 * `<aside>` now carries `aek-rail-fold` too (plus the label / row / header
 * choreography exempted in the same media block), so the fold glides in
 * every state — exactly like the second-level rail.
 *
 * This script drives the dev shell's CDP endpoint and reads COMPUTED
 * transition durations in three states:
 *   1. as-is          (the machine's own setting — no emulation),
 *   2. reduce         (emulated `prefers-reduced-motion: reduce`),
 *   3. no-preference  (emulated normal-motion viewer, regression guard),
 * then clears any emulated media.
 *
 * READ-ONLY: it writes no files and mutates no preferences; the media
 * emulation is session-scoped and cleared on exit. A zero-argument run
 * checks the default dev-shell port (`AEK_CDP_PORT` or 1688).
 *
 * Usage:
 *   node scripts/aek/rail-fold-motion.mjs [port]
 *   port   CDP port (1688 = the next-slot dev shell, 1686 = the aek-slot)
 *
 * @module aek/scripts/aek/rail-fold-motion
 */
import { SLOTS } from './shared-logic.mjs'

const port = process.argv[2] ? Number(process.argv[2]) : (process.env.AEK_CDP_PORT ? Number(process.env.AEK_CDP_PORT) : 1688)
if (!Number.isInteger(port) || port <= 0) {
  console.error(`rail-fold-motion: invalid port ${String(port)} — usage: node scripts/aek/rail-fold-motion.mjs [port]`)
  process.exit(2)
}

/** CDP page target: prefer the console page of the slot this port belongs to. */
async function pageTarget() {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!res.ok) throw new Error(`CDP HTTP ${res.status} on ${port} — is the dev shell running?`)
  const targets = await res.json()
  const slot = Object.values(SLOTS).find(entry => entry.cdpPort === port)
  const consolePage = slot ? targets.find(t => t.type === 'page' && String(t.url).includes(String(slot.webPort))) : undefined
  return consolePage ?? targets.find(t => t.type === 'page')
}

/** Minimal CDP session with per-call timeout (one socket rebuild on wedge). */
class Cdp {
  constructor(url) {
    this.url = url
    this.id = 0
    this.pending = new Map()
  }

  async open() {
    this.ws = new WebSocket(this.url)
    await new Promise((resolve, reject) => {
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

  async send(method, params = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = ++this.id
      const reply = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out`)) }, 15000)
        timer.unref?.()
        this.pending.set(id, { resolve, reject })
      })
      this.ws.send(JSON.stringify({ id, method, params }))
      try {
        return await reply
      } catch (error) {
        if (attempt === 0) {
          this.pending.clear()
          this.ws.close()
          const fresh = await pageTarget()
          this.url = fresh?.webSocketDebuggerUrl ?? this.url
          await this.open()
          continue
        }
        throw error
      }
    }
    throw new Error('CDP failed twice')
  }

  close() {
    this.ws.close()
  }
}

/**
 * One in-page measurement: computed transition durations of the
 * fold-critical elements, as comma-joined lists (one entry per property).
 */
const MEASURE = `(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const aside = document.querySelector('aside')
  const asideCS = cs(aside)
  const label = document.querySelector('aside .aek-label-fade')
  const labelHidden = document.querySelector('aside .aek-label-fade-hidden')
  const header = document.querySelector('aside .aek-sidebar-header')
  const body = document.querySelector('aside .aek-sidebar-body')
  const fold2 = document.querySelector('nav.aek-rail-fold')
  const actions = document.querySelector('.aek-row-actions')
  return {
    asideClassHasFold: String(aside?.className ?? '').includes('aek-rail-fold'),
    aside: asideCS ? asideCS.transitionDuration : null,
    header: cs(header)?.transitionDuration ?? null,
    body: cs(body)?.transitionDuration ?? null,
    label: cs(label)?.transitionDuration ?? null,
    labelHidden: cs(labelHidden)?.transitionDuration ?? null,
    fold2: cs(fold2)?.transitionDuration ?? null,
    actions: cs(actions)?.transitionDuration ?? null,
  }
})()`

/**
 * Emulate one media state, settle two frames, measure.
 * @param {Cdp} cdp
 * @param {string} value - `reduce`, `no-preference`, or `''` (clear = system setting).
 * @returns {Promise<Record<string, unknown>>} the measurement.
 */
async function measure(cdp, value) {
  const features = value === '' ? [] : [{ name: 'prefers-reduced-motion', value }]
  await cdp.send('Emulation.setEmulatedMedia', { features })
  await cdp.send('Runtime.evaluate', {
    expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
    awaitPromise: true,
  })
  const result = await cdp.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })
  return (result.result?.value ?? null)
}

/**
 * Normalize a computed duration list to millisecond numbers, per entry
 * (no cross-entry collapsing — a multi-property list is meaningful as is).
 * The check accepts BOTH representation forms: Chromium reports a
 * single-value declaration ("260ms" over 4 transitioned properties) as one
 * entry in a media-exempted state and the full expanded list
 * ("260ms, 260ms, 260ms, 260ms") in the normal state, so expectations are
 * sets of allowed forms.
 */
function normalize(list) {
  if (list === null || list === undefined) return 'null (absent)'
  return String(list).split(',').map(part => {
    const raw = part.trim()
    if (raw.endsWith('ms')) return String(Math.round(Number(raw.slice(0, -2)) * 1000) / 1000)
    if (raw.endsWith('s')) return String(Math.round(Number(raw.slice(0, -1)) * 1000 * 1000) / 1000)
    return String(Math.round(Number(raw) * 1000 * 1000) / 1000) // bare number = seconds
  }).join(', ')
}

/**
 * Per-state expectations. Every field is a SET of allowed normalised
 * duration lists; `null` = assert nothing (informational).
 * - the fold machinery (aside / header / body / labels / plugin rail) must
 *   report 260ms in EVERY state — that is the fix: the reduce-motion crush
 *   no longer snaps the first-level rail;
 * - the decorative `actions` card is the control: crushed to 0.01ms under
 *   reduce, full 150ms for a normal-motion viewer.
 * @param {string} state
 * @returns {Record<string, string[] | null>}
 */
function expectations(state) {
  const single260 = ['260', '260, 260, 260, 260'] // .aek-rail-fold's 4 properties, either form
  const labels = [
    '150, 260, 260, 260, 0', // shown variant (opacity 150ms + the 260ms fold)
    '140, 260, 260, 260, 0', // hidden variant (opacity 140ms + the 260ms fold)
  ]
  const common = {
    asideClassHasFold: ['true'],
    aside: single260,
    header: ['260'],
    body: ['260'],
    label: labels,
    // Present only while the rail is compact (tucked); absent when expanded.
    labelHidden: ['null (absent)', ...labels],
    // The plugin rail only exists on a family page; 260ms while mounted.
    fold2: ['null (absent)', ...single260],
  }
  if (state === 'reduce') {
    return { ...common, actions: ['0.01'] }
  }
  if (state === 'no-preference') {
    return { ...common, actions: ['150', '150, 150'] }
  }
  // as-is: system-dependent (crushed 0.01 or full 150) — informational only.
  return { ...common, actions: null }
}

const target = await pageTarget()
if (target === undefined) {
  console.error(`rail-fold-motion: no CDP page target on ${port} — start the dev shell first`)
  process.exit(1)
}
const cdp = new Cdp(target.webSocketDebuggerUrl)
await cdp.open()
await cdp.send('Page.enable')
console.log(`[fold] ${String(target.title)} → ${String(target.url)}`)

let failures = 0
for (const state of ['as-is', 'reduce', 'no-preference']) {
  const value = state === 'as-is' ? '' : state
  const data = await measure(cdp, value)
  const expected = expectations(state)
  console.log(`\n[fold] state: ${state}${value ? ` (emulated ${value})` : ' (system setting)'}`)
  for (const [field, allowed] of Object.entries(expected)) {
    if (allowed === null) {
      console.log(`  info  ${String(field).padEnd(16)} = ${String(data[field] ?? '(absent)')}`)
      continue
    }
    const gotRaw = data[field] ?? null
    const got = field === 'asideClassHasFold' ? String(gotRaw) : (gotRaw === null ? 'null (absent)' : normalize(String(gotRaw)))
    const ok = allowed.includes(got)
    if (!ok) failures += 1
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${String(field).padEnd(16)} = ${got}${ok ? '' : `  (allowed: ${allowed.join(' | ')})`}`)
  }
}

await cdp.send('Emulation.setEmulatedMedia', { features: [] })
cdp.close()

if (failures === 0) {
  console.log(`\nrail-fold-motion: PASS — both rails keep their fold glide in every reduced-motion state (port ${port})`)
  process.exit(0)
}
console.error(`\nrail-fold-motion: FAIL — ${failures} assertion(s) off (port ${port})`)
process.exit(1)
