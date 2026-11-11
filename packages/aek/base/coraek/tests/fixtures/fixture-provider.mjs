#!/usr/bin/env node
/**
 * Test fixture: a minimal EXTERNAL capability provider.
 *
 * It is NOT shipped code — supervisor specs spawn it through a node command
 * line to exercise the generic protocol layer:
 *
 *   - newline-JSON stdio: answers `aek.ping`, `aek.describe`, and MCP-style
 *     `initialize`;
 *   - `--describe`: prints the aekCapability envelope on stdout (CLI surface).
 *
 * @module packages/aek/base/coraek/tests/fixtures/fixture-provider
 */

const FIXTURE_DESCRIPTOR = {
  protocol: 'aek-capability/1',
  name: 'fixture',
  version: '0.0.1',
  spdx: 'MIT',
  source: 'https://example.com/fixture-provider',
  capabilities: [{ id: 'fixture.demo', title: 'Fixture demo' }],
  attach: { kind: 'jsonrpc-stdio', command: 'fixture-provider' },
}

if (process.argv[2] === '--describe') {
  // Log-prefixed output on purpose: the parser must skip the leading lines.
  console.log('fixture: building descriptor')
  console.log(JSON.stringify({ aekCapability: FIXTURE_DESCRIPTOR }))
  process.exit(0)
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  for (const line of chunk.split('\n')) {
    const text = line.trim()
    if (text === '') continue
    /** @type {Record<string, unknown> | undefined} */
    let message
    try { message = JSON.parse(text) } catch { continue }
    if (message === undefined || message.method === undefined) continue
    const id = message.id
    if (message.method === 'aek.ping') {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result: 'pong' })}\n`)
    } else if (message.method === 'aek.describe') {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result: FIXTURE_DESCRIPTOR })}\n`)
    } else if (message.method === 'initialize') {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-03-26',
          serverInfo: { name: 'fixture', version: '0.0.1' },
          capabilities: { tools: {} },
        },
      })}\n`)
    }
  }
})

process.on('SIGTERM', () => process.exit(0))
