#!/usr/bin/env node
/**
 * `@cheezmil/coraek` — the GENERIC class ① SELECTIVE runtime `isolate` runner
 * (T round).
 *
 * Every TS/JS AEK capability is isolatable WITHOUT declaring
 * `aek.runtime.isolate`: the coraek host falls back to THIS runner for any
 * capability that has a JS in-process part but no custom bin. The host spawns
 * it with `attach.cwd` = the capability's own package dir (so the relative
 * `./package.json` read below lands on the capability's manifest, never on
 * coraek's).
 *
 * A package's own declared `aek.runtime.isolate.bin` always wins over this
 * runner (see `resolveIsolateAttach` in `runtime.mjs`).
 *
 * Wire protocol: `aek-capability/1` over stdio — newline-delimited JSON-RPC
 * 2.0 (the same framing the supervisor probes with). Today the runner
 * answers the supervisor's topology probes and reports the feature-call
 * surface as pending — the call bridge ships in a later round, and until
 * then the spawned process is topology-only (same honest contract as the
 * package-specific bins).
 */

import { readFileSync } from 'node:fs'

/** @returns {Record<string, unknown>} the parsed cwd package manifest. */
function readPackage() {
  try {
    const raw = readFileSync('./package.json', 'utf8')
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
  name: typeof pkg.name === 'string' ? pkg.name : 'aek-capability',
  version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
  ...(typeof pkg.license === 'string' ? { spdx: pkg.license } : {}),
  ...(typeof pkg.repository === 'string' ? { source: pkg.repository }
    : pkg.repository?.url !== undefined && typeof pkg.repository.url === 'string'
      ? { source: pkg.repository.url }
      : {}),
  capabilities: Array.isArray(pkg.aek?.capabilities) ? pkg.aek.capabilities : [{ id: 'web' }],
  attach: { kind: 'jsonrpc-stdio' },
  // T round marker: this is the generic topology runner, not a
  // capability-specific bin — the operator sees WHY a plain capability got
  // its own process without declaring anything.
  generic: true,
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
    default:
      // The feature-call bridge is follow-up work (topology-only today):
      // say so explicitly rather than failing silently.
      respond(req.id, {
        error: {
          code: -32000,
          message: `feature-call bridge pending — '${String(req.method ?? '')}' is not callable from the isolate runner yet`,
        },
      })
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index = buffer.indexOf('\n')
  while (index !== -1) {
    const line = buffer.slice(0, index)
    buffer = buffer.slice(index + 1)
    if (line.trim().length > 0) {
      try {
        handle(JSON.parse(line))
      } catch {
        respond(null, { error: { code: -32700, message: 'parse error' } })
      }
    }
    index = buffer.indexOf('\n')
  }
})
process.stdin.on('end', () => {
  process.exit(0)
})
