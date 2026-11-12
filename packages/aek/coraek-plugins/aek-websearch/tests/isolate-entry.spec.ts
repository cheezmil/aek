/**
 * Regression spec for the class ① SELECTIVE runtime `isolate` entry
 * (`bin/isolate.mjs`): it is spawned by the coraek external supervisor when
 * the operator selects the isolate topology, and it must answer the
 * `aek-capability/1` topology probes (ping / describe) over NDJSON JSON-RPC
 * without loading any host-side code.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

const ISOLATE_BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'isolate.mjs')

interface IsolateReply {
  id: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

/** Run the isolate entry with NDJSON requests on stdin; returns the parsed replies. */
function probe(methods: string[]) {
  const input = methods.map((method, index) => JSON.stringify({ jsonrpc: '2.0', id: index + 1, method, params: {} })).join('\n') + '\n'
  const result = spawnSync(process.execPath, [ISOLATE_BIN], { input, encoding: 'utf8', timeout: 15000 })
  const lines = String(result.stdout).split('\n').filter(line => line.trim() !== '')
  const replies = lines.map(line => JSON.parse(line) as IsolateReply)
  return { status: result.status, replies }
}

describe('aek-websearch isolate entry (aek-capability/1 over stdio)', () => {
  it('answers the supervisor ping + describe probes and exits on stdin EOF', () => {
    const { status, replies } = probe(['aek.ping', 'aek.describe'])
    expect(status).toBe(0)
    expect(replies).toHaveLength(2)
    expect(replies[0].id).toBe(1)
    expect(replies[0].result?.pong).toBe(true)
    const descriptor = replies[1].result as Record<string, unknown>
    expect(descriptor.protocol).toBe('aek-capability/1')
    expect(descriptor.name).toBe('@cheezmil/aek-websearch')
    expect(descriptor.spdx).toBe('Apache-2.0')
    expect(descriptor.attach).toEqual({ kind: 'jsonrpc-stdio' })
    expect(Array.isArray(descriptor.capabilities)).toBe(true)
  })

  it('reports the pending feature-call surface as an explicit error, not a crash', () => {
    const { status, replies } = probe(['aek.search'])
    expect(status).toBe(0)
    expect(replies[0].error?.code).toBe(-32001)
    expect(String(replies[0].error?.message)).toContain('call bridge')
  })

  it('answers unknown methods with JSON-RPC -32601', () => {
    const { status, replies } = probe(['aek.garbage'])
    expect(status).toBe(0)
    expect(replies[0].error?.code).toBe(-32601)
  })
})
