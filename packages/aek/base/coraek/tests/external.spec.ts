import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import {
  ATTACH_KINDS,
  JsonRpcStream,
  encodeJsonRpc,
  descriptorFromCliDescribe,
  descriptorFromMcpInfo,
  isSafeArgvToken,
  isSafeCommand,
  isSpdxExpression,
  jsonRpcRequest,
  matchJsonRpcReply,
  validateDescriptor,
} from '../external.mjs'

/** A legal descriptor used across the suite. */
const LEGAL = {
  protocol: 'aek-capability/1',
  name: 'fury',
  version: '0.4.20',
  spdx: 'AGPL-3.0-or-later',
  source: 'https://example.com/fury',
  capabilities: [{ id: 'browser.profiles', title: 'Browser profiles' }],
  attach: { kind: 'mcp-stdio', command: 'fury-agent', args: ['mcp'] },
}

/** Push bytes into a Readable in arbitrary chunks. */
function feed(readable: Readable, frame: string, chunkSize = 5): void {
  for (let i = 0; i < frame.length; i += chunkSize) {
    readable.push(Buffer.from(frame.slice(i, i + chunkSize), 'utf8'))
  }
}

describe('validateDescriptor', () => {
  it('accepts a fully legal descriptor and normalises it', () => {
    const result = validateDescriptor(LEGAL)
    expect(result.ok).toBe(true)
    expect(result.descriptor?.name).toBe('fury')
    expect(result.descriptor?.attach.kind).toBe('mcp-stdio')
    expect(result.problems).toEqual([])
  })

  it('rejects a non-object descriptor', () => {
    expect(validateDescriptor('nope').ok).toBe(false)
    expect(validateDescriptor(null).problems[0]).toContain('object')
  })

  it('rejects a wrong protocol id', () => {
    const result = validateDescriptor({ ...LEGAL, protocol: 'aek-capability/2' })
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('protocol')
  })

  it('rejects an off-whitelist attach kind', () => {
    const result = validateDescriptor({ ...LEGAL, attach: { kind: 'shared-memory' } })
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('attach.kind')
  })

  it('rejects an absolute or shell-metacharacter command', () => {
    expect(validateDescriptor({ ...LEGAL, attach: { kind: 'mcp-stdio', command: '/usr/bin/fury' } }).ok).toBe(false)
    expect(validateDescriptor({ ...LEGAL, attach: { kind: 'mcp-stdio', command: 'fury; rm -rf' } }).ok).toBe(false)
  })

  it('rejects an off-whitelist spdx', () => {
    expect(validateDescriptor({ ...LEGAL, spdx: 'not a license' }).ok).toBe(false)
  })

  it('requires the attach block', () => {
    expect(validateDescriptor({ ...LEGAL, attach: undefined }).ok).toBe(false)
  })
})

describe('isSafeCommand / isSafeArgvToken', () => {
  it('accepts a bare relative command', () => {
    expect(isSafeCommand('fury-agent')).toBe(true)
  })
  it('rejects absolute paths and drive letters', () => {
    expect(isSafeCommand('/usr/bin/fury')).toBe(false)
    expect(isSafeCommand('C:\\fury')).toBe(false)
    expect(isSafeCommand('C:/fury')).toBe(false)
  })
  it('rejects shell metacharacters in argv', () => {
    expect(isSafeArgvToken('a;b')).toBe(false)
    expect(isSafeArgvToken('a&b')).toBe(false)
    expect(isSafeArgvToken('')).toBe(false)
  })
  it('rejects over-long tokens', () => {
    expect(isSafeArgvToken('a'.repeat(129))).toBe(false)
  })
})

describe('isSpdxExpression', () => {
  it('accepts known single and compound expressions', () => {
    expect(isSpdxExpression('AGPL-3.0-or-later')).toBe(true)
    expect(isSpdxExpression('MIT')).toBe(true)
    expect(isSpdxExpression('Apache-2.0 AND MIT')).toBe(true)
  })
  it('rejects free text', () => {
    expect(isSpdxExpression('')).toBe(false)
    expect(isSpdxExpression('custom license')).toBe(false)
    expect(isSpdxExpression('not a license')).toBe(false)
  })
})

describe('descriptorFromMcpInfo', () => {
  it('synthesises a descriptor from serverInfo + capabilities', () => {
    const result = descriptorFromMcpInfo({
      protocolVersion: '2025-03-26',
      serverInfo: { name: 'FuryAgent', version: '0.4.20' },
      capabilities: { tools: {} },
    })
    expect(result.ok).toBe(true)
    expect(result.descriptor?.name).toBe('furyagent') // lower-cased
    expect(result.descriptor?.attach.kind).toBe('mcp-stdio')
    // License fields stay absent by design — the wrapper manifest asserts them.
    expect(result.descriptor?.spdx).toBeUndefined()
  })

  it('produces a valid fallback when the result is empty', () => {
    const result = descriptorFromMcpInfo({})
    expect(result.ok).toBe(true)
    expect(result.descriptor?.name).toBe('unknown')
  })
})

describe('descriptorFromCliDescribe', () => {
  it('parses a plain descriptor document', () => {
    const result = descriptorFromCliDescribe(JSON.stringify(LEGAL))
    expect(result.ok).toBe(true)
    expect(result.descriptor?.name).toBe('fury')
  })

  it('parses an aekCapability envelope after log lines', () => {
    const stdout = `boot: ready\n${JSON.stringify({ aekCapability: LEGAL })}\n`
    expect(descriptorFromCliDescribe(stdout).ok).toBe(true)
  })

  it('rejects output that has no JSON descriptor', () => {
    expect(descriptorFromCliDescribe('no json here').ok).toBe(false)
    expect(descriptorFromCliDescribe('').ok).toBe(false)
  })
})

describe('encodeJsonRpc / jsonRpcRequest', () => {
  it('frames a newline request', () => {
    const framed = encodeJsonRpc(jsonRpcRequest(1, 'aek.ping', {}))
    expect(framed.endsWith('\n')).toBe(true)
    expect(JSON.parse(framed.trim()).method).toBe('aek.ping')
  })

  it('frames a content-length request with byte-accurate length', () => {
    const message = jsonRpcRequest(1, 'm', { note: '中文' })
    const framed = encodeJsonRpc(message, 'content-length')
    const json = framed.slice(framed.indexOf('\r\n\r\n') + 4)
    const header = /Content-Length:\s*(\d+)/u.exec(framed)?.[1]
    expect(Number(header)).toBe(Buffer.byteLength(json, 'utf8'))
  })
})

describe('matchJsonRpcReply', () => {
  it('matches a result reply by id', () => {
    expect(matchJsonRpcReply({ jsonrpc: '2.0', id: 3, result: 42 }, 3).ok).toBe(true)
  })
  it('flags a mismatched id', () => {
    expect(matchJsonRpcReply({ jsonrpc: '2.0', id: 9, result: 1 }, 3).ok).toBe(false)
  })
  it('flags a notification', () => {
    expect(matchJsonRpcReply({ jsonrpc: '2.0', method: 'x' }, 3).ok).toBe(false)
  })
  it('surfaces a JSON-RPC error', () => {
    const match = matchJsonRpcReply({ jsonrpc: '2.0', id: 3, error: { code: -32601, message: 'nope' } }, 3)
    expect(match.ok).toBe(false)
    expect(match.error?.code).toBe(-32601)
  })
})

describe('JsonRpcStream', () => {
  it('reads newline-JSON messages (MCP framing)', async () => {
    const readable = new Readable({ read() { /* nothing */ } })
    const stream = new JsonRpcStream(readable)
    readable.push(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'pong' }) + '\n')
    await expect(stream.next()).resolves.toEqual({ jsonrpc: '2.0', id: 1, result: 'pong' })
  })

  it('reads LSP Content-Length framing across arbitrary chunk splits', async () => {
    const readable = new Readable({ read() { /* nothing */ } })
    const stream = new JsonRpcStream(readable)
    const body = JSON.stringify({ jsonrpc: '2.0', id: 7, result: { note: '中文测试' } })
    const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`
    feed(readable, frame, 1) // one byte at a time (worst case)
    await expect(stream.next()).resolves.toEqual(JSON.parse(body))
  })

  it('forces an explicit framing', async () => {
    const readable = new Readable({ read() { /* nothing */ } })
    const stream = new JsonRpcStream(readable, { framing: 'newline' })
    readable.push('{"id":1}\n')
    await expect(stream.next()).resolves.toEqual({ id: 1 })
  })

  it('resolves null on clean EOF and reports malformed lines', async () => {
    const readable = new Readable({ read() { /* nothing */ } })
    const stream = new JsonRpcStream(readable, { framing: 'newline' })
    readable.push('not json\n')
    const bad = await stream.next()
    expect((bad as Record<string, unknown>).error).toEqual(expect.objectContaining({ code: -32700 }))
    readable.push(null)
    await expect(stream.next()).resolves.toBeNull()
  })
})

describe('ATTACH_KINDS', () => {
  it('is the exact protocol whitelist', () => {
    expect([...ATTACH_KINDS]).toEqual(['mcp-stdio', 'jsonrpc-stdio', 'http', 'cli'])
  })
})
