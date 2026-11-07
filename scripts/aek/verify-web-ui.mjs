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
    index: { ok: false, status: 0, title: '' },
    boot: { aekHome: false, coraek: false, entries: 0 },
    clientBundle: { ok: false, cssInjected: false, tokens: false },
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
    }
  } catch (cause) {
    result.index.error = cause instanceof Error ? cause.message : String(cause)
  }

  const bootMatch = html.match(/globalThis\["__DSH_BOOT__"\]\s*=\s*(\{[\s\S]*?\})<\/script>/u)
  if (bootMatch !== null) {
    try {
      const boot = JSON.parse(bootMatch[1])
      const ids = (boot.entries ?? []).map(entry => entry.id)
      result.boot = {
        aekHome: ids.includes('@cheezmil/aek-home'),
        coraek: ids.includes('@cheezmil/coraek'),
        entries: ids.length,
      }
      const application = (boot.batches ?? []).find(batch => batch.phase === 'application')
      if (application?.url !== undefined) {
        const url = `${base}/${application.url.replace(/&amp;/gu, '&')}`
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
        const bundle = await response.text()
        result.clientBundle = {
          ok: response.ok,
          cssInjected: bundle.includes('data-plugin-css'),
          tokens: bundle.includes('--aek-accent:'),
        }
      }
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

  result.ok = result.index.ok && result.boot.aekHome && result.clientBundle.cssInjected
    && result.clientBundle.tokens && result.api.ok
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
    console.log(`  boot manifest    aek-home=${result.boot.aekHome} coraek=${result.boot.coraek} entries=${result.boot.entries}`)
    console.log(`  client bundle    css-injected=${result.clientBundle.cssInjected} design-tokens=${result.clientBundle.tokens}`)
    console.log(`  admin API        ok=${result.api.ok} providers=${result.api.providers}`)
  }
  process.exit(result.ok ? 0 : 1)
}

await main()
