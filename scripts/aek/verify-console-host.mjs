#!/usr/bin/env node
/**
 * Static + optional live check: the AEK console must live on its OWN host.
 *
 * Why this exists (2026-11-10): Chromium stores site zoom per HOST and drops
 * the port — `chrome://settings` and the profile's
 * `partition.per_host_zoom_levels` hold one entry keyed `127.0.0.1` for every
 * local web UI. Zooming the AEK console therefore also resized the DeepSeek
 * Harness web UI running on another `127.0.0.1` port. The only thing that
 * separates two origins in that table is the host name, so the console is
 * served under `aek.localhost` / `aek-next.localhost` while the socket keeps
 * binding `127.0.0.1`.
 *
 * Checks:
 *   - every slot declares a `webHost`, distinct per slot, under `.localhost`;
 *   - `webUrl()` builds `http://<webHost>:<webPort>`;
 *   - the bind address stays the loopback literal;
 *   - no source file builds a console URL as `http://127.0.0.1:<port>` by hand
 *     (that literal must appear only as a probe/fallback target).
 *
 * READ-ONLY. With a running slot the live half also fetches the console through
 * BOTH names and fails when they disagree. Exits 1 on any violation.
 *
 * Usage:
 *   node scripts/aek/verify-console-host.mjs
 *   node scripts/aek/verify-console-host.mjs --json
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS, bindHost, webUrl } from '../../packages/aek/base/coraek/slots.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const json = process.argv.includes('--json')

/**
 * Browser-facing sources: these must never spell the console URL themselves.
 * Probe scripts are excluded on purpose — health checks are supposed to talk to
 * the bind address, only what the BROWSER is told to open has to carry the
 * alias.
 */
const SOURCES = [
  'apps/aek-desktop/v0/src/main/index.ts',
  'packages/aek/coraek-plugins/aek-websearch/src/console.ts',
]

const problems = []

const hosts = Object.values(SLOTS).map(entry => entry.webHost)
for (const entry of Object.values(SLOTS)) {
  if (typeof entry.webHost !== 'string' || entry.webHost.length === 0) {
    problems.push(`slot ${entry.slot} has no webHost`)
    continue
  }
  if (!entry.webHost.endsWith('.localhost')) {
    problems.push(`slot ${entry.slot}: webHost ${entry.webHost} is not under .localhost (a bare 127.0.0.1 shares zoom with every other local app)`)
  }
  if (entry.webHost === 'localhost') {
    problems.push(`slot ${entry.slot}: "localhost" is the generic name, pick a slot-specific one`)
  }
  const expected = `http://${entry.webHost}:${String(entry.webPort)}`
  const actual = webUrl(entry.slot)
  if (actual !== expected) problems.push(`webUrl(${entry.slot}) = ${actual}, expected ${expected}`)
}
if (new Set(hosts).size !== hosts.length) problems.push(`slot hosts are not unique: ${hosts.join(', ')}`)
if (bindHost() !== '127.0.0.1') problems.push(`bindHost() must stay 127.0.0.1, got ${bindHost()}`)

// A hand-built console URL silently reintroduces the shared zoom key.
for (const relative of SOURCES) {
  const text = readFileSync(join(ROOT, relative), 'utf-8')
  for (const [index, line] of text.split('\n').entries()) {
    if (!/http:\/\/127\.0\.0\.1:\$\{/.test(line)) continue
    problems.push(`${relative}:${String(index + 1)} builds a console URL from the loopback literal — use webUrl(slot)`)
  }
}

// ── live half ────────────────────────────────────────────────────────────────
/** @param url - URL to fetch. @returns {Promise<{status: number, body: string}>} */
async function grab(url) {
  try {
    const response = await fetch(url, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(2500) })
    return { status: response.status, body: await response.text() }
  } catch {
    return { status: 0, body: '' }
  }
}

const live = []
for (const entry of Object.values(SLOTS)) {
  const viaAlias = await grab(`${webUrl(entry.slot)}/`)
  if (viaAlias.status === 0) {
    live.push(`${entry.slot}: offline (skipped)`)
    continue
  }
  const viaLiteral = await grab(`http://127.0.0.1:${String(entry.webPort)}/`)
  const sameBody = viaAlias.body.length > 0 && viaAlias.body === viaLiteral.body
  const ok = viaAlias.status === 200 && viaLiteral.status === 200 && sameBody
  live.push(`${entry.slot}: alias ${String(viaAlias.status)} / literal ${String(viaLiteral.status)} / same body ${String(sameBody)}`)
  if (!ok) problems.push(`slot ${entry.slot}: ${webUrl(entry.slot)} and the loopback literal do not serve the same page`)
}

if (json) {
  console.log(JSON.stringify({ hosts, bind: bindHost(), live, problems }, null, 2))
} else {
  console.log(`[host] bind ${bindHost()} → aliases ${hosts.join(', ')}`)
  for (const line of live) console.log(`[host] ${line}`)
  for (const problem of problems) console.log(`FAIL  ${problem}`)
  if (problems.length === 0) console.log('[host] console hosts are slot-specific and self-consistent')
}
process.exit(problems.length === 0 ? 0 : 1)
