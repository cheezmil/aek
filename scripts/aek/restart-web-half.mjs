#!/usr/bin/env node
/**
 * Restart ONE slot's backend (web half) after rebuilding host artifacts.
 *
 * The AEK console exposes `/api/aek/instances` for exactly this: it answers
 * the HTTP request FIRST and defers the arbiter call, because stopping the
 * backend of the slot serving the console would otherwise kill the response
 * mid-flight. `restart-half <slot> web` keeps the desktop shell alive, so no
 * second AEK.app instance is ever started.
 *
 * SAFETY: no arguments = read-only plan (no request, no state change).
 * `--yes` performs the restart and then polls one API path until it is live.
 * `--slot`, `--half`, `--port` and `--probe` are optional overrides; nothing
 * is written to disk and no remote is contacted.
 */
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback
}
const slot = flag('slot', 'aek')
const half = flag('half', 'web')
const port = flag('port', '1685')
const probe = flag('probe', '/api/aek/websearch/ranking')
const base = `http://127.0.0.1:${port}`
const yes = args.includes('--yes')

if (!yes) {
  console.log('DRY RUN — nothing was restarted.')
  console.log(`  POST ${base}/api/aek/instances  { slot: ${slot}, half: ${half}, action: restart }`)
  console.log(`  then poll GET ${base}${probe} until 200 (max 30s)`)
  console.log('  re-run with --yes to actually restart the backend (the desktop shell is untouched).')
  process.exit(0)
}

const deadline = Date.now() + 30_000
/** @param ms - delay. @returns a promise. */
const wait = ms => new Promise(resolve => { setTimeout(resolve, ms) })

try {
  const response = await fetch(`${base}/api/aek/instances`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slot, half, action: 'restart' }),
    signal: AbortSignal.timeout(5000),
  })
  const body = await response.text()
  console.log(`restart accepted: HTTP ${String(response.status)} ${body.slice(0, 240)}`)
} catch (error) {
  console.error('restart request failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
}

let live = false
let last = 'no attempt'
while (Date.now() < deadline) {
  await wait(500)
  try {
    const response = await fetch(`${base}${probe}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    })
    const text = await response.text()
    last = `HTTP ${String(response.status)} ${text.slice(0, 160)}`
    if (response.status === 200) {
      console.log(`probe live: ${last}`)
      live = true
      break
    }
  } catch (error) {
    last = error instanceof Error ? error.message : String(error)
  }
}
if (!live) {
  console.error(`backend did not become live within 30s (last: ${last})`)
  process.exit(1)
}
console.log('OK — backend restarted and the probe route is live.')
