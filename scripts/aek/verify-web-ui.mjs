#!/usr/bin/env node
/**
 * One entry point for local AEK web-ui development: inspect, stop, start and
 * verify the web profile without ever leaving two instances behind.
 *
 * READ-ONLY BY DEFAULT. With no flags (or `--check`) it only reads process
 * state and HTTP endpoints. Anything that changes state requires an explicit
 * `--yes`:
 *   node scripts/aek/verify-web-ui.mjs --stop-old --yes   # SIGTERM the old instance
 *   node scripts/aek/verify-web-ui.mjs --start --yes      # stop old + run `aek web` in foreground
 *
 * `--start` keeps the child in the foreground and forwards signals, so the
 * shell session (or task runner) owns the process lifetime. It never detaches,
 * never kills with SIGKILL, and never touches ports owned by unrelated apps —
 * a listener is only stopped when its command line belongs to this repository.
 *
 * Options: `--port N` (default 1690), `--json`.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PORT = 1690

/** @param {string} start @returns {string} */
function findProjectRoot(start) {
  let dir = start
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}

const ROOT = findProjectRoot(HERE)
const AEK_BIN = join(ROOT, 'packages', 'aek', 'base', 'coraek', 'bin', 'aek.mjs')

/**
 * PIDs listening on one TCP port.
 * @param {number} port
 * @returns {number[]}
 */
function listeners(port) {
  try {
    const output = execFileSync('lsof', ['-nP', `-iTCP:${String(port)}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
    return output.split('\n').map(line => Number(line.trim())).filter(pid => Number.isInteger(pid) && pid > 0)
  } catch {
    return []
  }
}

/**
 * Command line of one pid, or an empty string when unavailable.
 * @param {number} pid
 * @returns {string}
 */
function commandOf(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

/**
 * Whether a listener belongs to this repository's web profile (as opposed to
 * an unrelated app that happens to hold the port).
 * @param {string} command
 * @returns {boolean}
 */
function isOurInstance(command) {
  if (command.length === 0) return false
  return command.includes('aek.mjs') || command.includes('apps/cli/') || command.includes('aek web')
}

/**
 * Read-only health check of the running web profile.
 * @param {number} port
 * @returns {Promise<object>}
 */
async function check(port) {
  const pids = listeners(port)
  const processes = pids.map(pid => ({ pid, command: commandOf(pid), ours: isOurInstance(commandOf(pid)) }))
  const base = `http://127.0.0.1:${String(port)}`
  const result = {
    port,
    listeners: processes,
    index: { ok: false, status: 0, title: '', aekWeb: false, jsAsset: '', cssAsset: '' },
    aekWebAssets: { jsOk: false, cssOk: false },
    boot: { coraek: false, entries: 0 },
    api: { ok: false, providers: 0 },
  }

  let html = ''
  try {
    const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) })
    html = await response.text()
    result.index = {
      ok: response.ok,
      status: response.status,
      title: html.match(/<title>([^<]*)<\/title>/u)?.[1] ?? '',
      aekWeb: false,
      jsAsset: '',
      cssAsset: '',
    }
    // B2: the served page is the standalone aek-web console (a static Vite dist),
    // not the dsh client shell. Its content-hashed dist assets are the
    // serve-point marker.
    const js = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/u)?.[0] ?? ''
    const css = html.match(/assets\/index-[A-Za-z0-9_-]+\.css/u)?.[0] ?? ''
    result.index.aekWeb = js !== '' && css !== ''
    result.index.jsAsset = js
    result.index.cssAsset = css
  } catch (cause) {
    result.index.error = cause instanceof Error ? cause.message : String(cause)
  }

  // Verify the aek-web dist assets actually resolve (200) so the page receives
  // the console, not just a reference to it.
  for (const [key, asset] of Object.entries({ js: result.index.jsAsset, css: result.index.cssAsset })) {
    if (asset === '') continue
    try {
      const response = await fetch(`${base}/${asset}`, { signal: AbortSignal.timeout(5000) })
      result.aekWebAssets[`${key}Ok`] = response.ok
    } catch {
      result.aekWebAssets[`${key}Ok`] = false
    }
  }

  // The dsh module-system boot is still injected into the page by the host.
  // coraek presence is recorded informationally; aek-web is a static app, not a
  // client-manifest entry, so it no longer appears here.
  const bootMatch = html.match(/globalThis\["__DSH_BOOT__"\]\s*=\s*(\{[\s\S]*?\})<\/script>/u)
  if (bootMatch !== null) {
    try {
      const boot = JSON.parse(bootMatch[1])
      const ids = (boot.entries ?? []).map(entry => entry.id)
      result.boot = { coraek: ids.includes('@cheezmil/coraek'), entries: ids.length }
    } catch (cause) {
      result.boot.error = cause instanceof Error ? cause.message : String(cause)
    }
  }

  try {
    const response = await fetch(`${base}/api/aek/websearch`, { signal: AbortSignal.timeout(5000) })
    const body = await response.json()
    result.api = { ok: response.ok, providers: (body.providers ?? []).length }
  } catch (cause) {
    result.api.error = cause instanceof Error ? cause.message : String(cause)
  }

  result.ok = result.index.ok && result.index.aekWeb
    && result.aekWebAssets.jsOk && result.aekWebAssets.cssOk && result.api.ok
  return result
}

/**
 * Stop our own old instance with SIGTERM. Never escalates to SIGKILL.
 * @param {number} port
 * @returns {object}
 */
function stopOld(port) {
  const stopped = []
  const skipped = []
  for (const pid of listeners(port)) {
    const command = commandOf(pid)
    if (!isOurInstance(command)) {
      skipped.push({ pid, reason: 'not an AEK web instance', command })
      continue
    }
    try {
      process.kill(pid, 'SIGTERM')
      stopped.push(pid)
    } catch (cause) {
      skipped.push({ pid, reason: cause instanceof Error ? cause.message : String(cause), command })
    }
  }
  // Wait for graceful shutdown; report rather than escalate.
  const deadline = Date.now() + 6000
  while (listeners(port).length > 0 && Date.now() < deadline) {
    const wait = new Int32Array(new SharedArrayBuffer(4))
    Atomics.wait(wait, 0, 0, 200)
  }
  const remaining = listeners(port)
  return { stopped, skipped, remaining }
}

/**
 * Run `aek web` in the foreground, forwarding signals and the exit code.
 * @param {number} port
 */
function start(port) {
  const child = spawn(process.execPath, [AEK_BIN, 'web', '--no-open', '--port', String(port)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  const forward = (signal) => { try { child.kill(signal) } catch { /* already gone */ } }
  process.on('SIGINT', () => forward('SIGINT'))
  process.on('SIGTERM', () => forward('SIGTERM'))
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal === null ? 0 : 1))
  })
}

async function main() {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const portArg = args.indexOf('--port')
  const port = portArg >= 0 && args[portArg + 1] !== undefined
    ? Number(args[portArg + 1]) : DEFAULT_PORT
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`invalid --port: ${String(port)}`)
    process.exit(2)
  }
  const confirmed = args.includes('--yes')

  if (args.includes('--stop-old')) {
    if (!confirmed) {
      console.error('refusing to stop processes without --yes (default is read-only)')
      process.exit(2)
    }
    const outcome = stopOld(port)
    if (asJson) console.log(JSON.stringify(outcome, null, 2))
    else {
      console.log(`stopped: ${outcome.stopped.join(', ') || 'none'}`)
      for (const item of outcome.skipped) console.log(`  skipped pid ${item.pid}: ${item.reason}`)
      console.log(`remaining listeners on ${port}: ${outcome.remaining.join(', ') || 'none'}`)
    }
    if (outcome.remaining.length > 0) process.exit(1)
    return
  }

  if (args.includes('--start')) {
    if (!confirmed) {
      console.error('refusing to start a new instance without --yes (default is read-only)')
      process.exit(2)
    }
    if (!existsSync(AEK_BIN)) {
      console.error(`aek CLI entry not found: ${AEK_BIN}`)
      process.exit(1)
    }
    const outcome = stopOld(port)
    if (outcome.remaining.length > 0) {
      console.error(`port ${port} still occupied by an instance we may not stop; refusing to start a second one`)
      process.exit(1)
    }
    console.log(`aek web ui: starting on ${port} (old instances stopped: ${outcome.stopped.join(', ') || 'none'})`)
    start(port)
    return
  }

  const result = await check(port)
  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`aek web ui (${port}): ${result.ok ? 'OK' : 'FAIL'}`)
    for (const item of result.listeners) {
      console.log(`  listener pid ${item.pid} ${item.ours ? '[ours]' : '[other app]'}: ${item.command || '(unknown)'}`)
    }
    console.log(`  GET /            ${result.index.status} ${JSON.stringify(result.index.title)}`)
    console.log(`  aek-web served   ${result.index.aekWeb ? 'yes' : 'no'} (js ${result.index.jsAsset || '-'} → ${result.aekWebAssets.jsOk ? '200' : 'n/a'}, css ${result.index.cssAsset || '-'} → ${result.aekWebAssets.cssOk ? '200' : 'n/a'})`)
    console.log(`  boot manifest    coraek=${result.boot.coraek} entries=${result.boot.entries} (aek-web is a static app, not a manifest entry)`)
    console.log(`  admin API        ok=${result.api.ok} providers=${result.api.providers}`)
  }
  process.exit(result.ok ? 0 : 1)
}

await main()
