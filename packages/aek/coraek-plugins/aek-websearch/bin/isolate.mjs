#!/usr/bin/env node
/**
 * `aek-websearch` — the class ① SELECTIVE runtime `isolate` entry.
 *
 * Declared in `package.json` as `aek.runtime.isolate.bin`. When the operator
 * selects the isolate topology for this capability (`aek runtime set
 * aek-websearch isolate --confirm`), the coraek host registers this entry
 * under the external supervisor and spawns it in its own Node process
 * instead of loading the in-process cordis plugin.
 *
 * Wire protocol: `aek-capability/1` over stdio — newline-delimited JSON-RPC
 * 2.0 (the same framing the supervisor probes with; the host writes
 * `{"jsonrpc":"2.0","id":N,"method":…}\n` and reads back one NDJSON reply).
 * No new protocol surface: only the generic probe/extension methods exist
 * today. The feature-call bridge (`aek.search`, …) ships in a later round —
 * until then this entry answers the supervisor's topology probes and reports
 * the call surface as pending.
 *
 * Self-description comes from this package's own `package.json` (name /
 * version / license / repository); nothing machine-specific is hardcoded.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** @returns {Record<string, unknown>} the parsed package manifest. */
function readPackage() {
  try {
    const raw = readFileSync(join(here, '..', 'package.json'), 'utf8')
    const manifest = JSON.parse(raw)
    return manifest !== null && typeof manifest === 'object' ? manifest : {}
  } catch {
    return {}
  }
}

const pkg = readPackage()

/** The `aek-capability/1` self-descriptor this process answers with. */
const descriptor = {
  protocol: 'aek-capability/1',
  name: typeof pkg.name === 'string' ? pkg.name : 'aek-websearch',
  version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
  ...(typeof pkg.license === 'string' ? { spdx: pkg.license } : {}),
  ...(typeof pkg.repository === 'string' ? { source: pkg.repository } : typeof pkg.repository?.url === 'string' ? { source: pkg.repository.url } : {}),
  capabilities: [{ id: 'web.search' }],
  attach: { kind: 'jsonrpc-stdio' },
}

/**
 * Write one NDJSON JSON-RPC reply.
 * @param {unknown} id - the request id (null for a parse error).
 * @param {{ result?: unknown, error?: { code: number, message: string } }} body
 */
function respond(id, body) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...body })}\n`)
}

/**
 * Dispatch one parsed JSON-RPC request.
 * @param {unknown} request
 */
function handle(request) {
  const req = /** @type {{ id?: unknown, method?: unknown }} */ (request ?? {})
  switch (req.method) {
    case 'aek.ping':
      // The supervisor's health probe: any reply means the process is up.
      respond(req.id, { result: { pong: true, name: descriptor.name, version: descriptor.version } })
      return
    case 'aek.describe':
      // The supervisor's live self-description: the reply IS the descriptor.
      respond(req.id, { result: descriptor })
      return
    case 'aek.search':
      // The feature-call bridge is follow-up work: the spawn/health topology
      // is live today; the call surface ships next round. Say so explicitly
      // rather than failing silently.
      respond(req.id, {
        error: {
          code: -32001,
          message: 'aek.search call bridge pending: the isolate topology (spawn + health + registry) is live; the feature-call surface ships in a later round',
        },
      })
      return
    default:
      respond(req.id, { error: { code: -32601, message: `method not found: ${String(req.method)}` } })
  }
}

process.stdin.setEncoding('utf8')
let pending = ''
process.stdin.on('data', chunk => {
  pending += String(chunk)
  let cut
  while ((cut = pending.indexOf('\n')) !== -1) {
    const line = pending.slice(0, cut)
    pending = pending.slice(cut + 1)
    if (line.trim() === '') continue
    let request
    try {
      request = JSON.parse(line)
    } catch {
      respond(null, { error: { code: -32700, message: 'parse error' } })
      continue
    }
    handle(request)
  }
})

// The supervisor keeps stdin open for the process's whole life; an EOF means
// the host closed the channel — exit cleanly instead of lingering.
process.stdin.on('end', () => {
  process.exit(0)
})
