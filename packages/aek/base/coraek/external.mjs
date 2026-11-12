/**
 * AEK external capability provider protocol — descriptor, JSON-RPC framing,
 * and the three generic discovery surfaces.
 *
 * WHY THIS EXISTS
 * AEK's own code is Apache-2.0. Strong-copyleft programs (AGPL / GPL) may
 * participate in an AEK deployment ONLY as separate processes that AEK talks
 * to over a standard protocol — never linked, copied, or bundled into the
 * host process. This module is the generic protocol half of that boundary:
 *
 *   - the HOST knows only protocols and descriptors, never a specific
 *     upstream (no URL, no license text, no upstream name may live here);
 *   - the PROVIDER self-describes (aek-capability/1 descriptor) and keeps
 *     its own license / source fields current;
 *   - the USER's configuration decides what is installed and trusted
 *     (that lives in the supervisor's state store, not in this module).
 *
 * Everything in this module is dependency-free and path-free: no absolute
 * paths, no user names, no network — I/O is injected, never dialed.
 *
 * Surfaces (all generic):
 *   1. MCP `initialize`  — an MCP server's `serverInfo`/`capabilities` are
 *      synthesized into a descriptor;
 *   2. HTTP well-known   — GET `<endpoint>/<path>` returns the descriptor;
 *   3. CLI `--describe`  — `<command> --describe` prints a JSON envelope.
 *
 * @module @cheezmil/coraek/external
 */

/** Protocol id every self-describing provider must carry. */
export const PROTOCOL_ID = 'aek-capability/1'

/** Legal attach kinds. Anything else is rejected at the manifest gate. */
export const ATTACH_KINDS = Object.freeze(['mcp-stdio', 'jsonrpc-stdio', 'http', 'cli'])

/** Hard bounds for argv material (mirrors the plugin-console conventions). */
export const MAX_ARGS = 12
export const MAX_ARG_LEN = 128

/** Provider ids: start lowercase, then lowercase alphanumerics . - */
const NAME_RE = /^[a-z0-9][a-z0-9.\-]*$/
/** Capability ids: lower-kebab with dots, e.g. `browser.profiles`. */
const CAPABILITY_ID_RE = /^[a-z0-9][a-z0-9._\-]*$/
/**
 * One SPDX atom: an id like `AGPL-3.0`, optionally versioned, optionally
 * `-or-later` / `-only`, optionally `WITH` exceptions. Atoms join by
 * `AND` / `OR`.
 */
const SPDX_ATOM_RE = /^[A-Za-z][A-Za-z0-9.\-]*(?:-[0-9.]+)?(?:-only|-or-later)?(?:\s+WITH\s+[A-Za-z0-9.\-+]+)*$/
/** Shell metacharacters that must never appear in argv material. */
const SHELL_META_RE = /[;&|`$()<>\\'"{}\[\]]/

/**
 * @typedef {object} CapabilityAttach
 * @property {'mcp-stdio' | 'jsonrpc-stdio' | 'http' | 'cli'} kind
 * @property {string} [command] - PATH-resolved executable, never absolute.
 * @property {string[]} [args]
 * @property {string} [endpoint] - already-running instance to attach to.
 * @property {string} [wellKnown] - descriptor path for the http kind.
 */

/**
 * @typedef {object} CapabilityDescriptor
 * @property {string} protocol - always `aek-capability/1`.
 * @property {string} name
 * @property {string} version
 * @property {string} [spdx] - provider-asserted license; rendered, never fetched.
 * @property {string} [source] - where the corresponding source lives.
 * @property {{ id: string, title?: string }[]} [capabilities]
 * @property {CapabilityAttach} attach
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean} ok
 * @property {CapabilityDescriptor | null} descriptor
 * @property {string[]} problems - deterministic, human-readable.
 */

/** Shell-free argv token (command names and args alike). */
export function isSafeArgvToken(token) {
  return typeof token === 'string' && token.length > 0 && token.length <= MAX_ARG_LEN && !SHELL_META_RE.test(token)
}

/** Executable names must additionally be relative (never an absolute path). */
export function isSafeCommand(token) {
  if (!isSafeArgvToken(token)) return false
  if (token.startsWith('/') || token.startsWith('\\')) return false
  if (/^[A-Za-z]:/.test(token)) return false // Windows drive letter
  return true
}

/** Whether a string parses as a legal (possibly compound) SPDX expression. */
export function isSpdxExpression(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return false
  return value
    .split(/\s+(?:AND|OR)\s+/)
    .map(atom => atom.trim())
    .every(atom => atom.length > 0 && SPDX_ATOM_RE.test(atom))
}

/**
 * Validate any value as a capability descriptor. Strict and total:
 * returns problems instead of throwing, so gates and UIs share one code path.
 * @param {unknown} value
 * @returns {ValidationResult}
 */
export function validateDescriptor(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, descriptor: null, problems: ['descriptor must be a JSON object'] }
  }
  const d = /** @type {Record<string, unknown>} */ (value)
  /** @type {string[]} */
  const problems = []

  if (d.protocol !== PROTOCOL_ID) {
    problems.push(`protocol must be '${PROTOCOL_ID}' (got ${JSON.stringify(d.protocol)})`)
  }
  if (typeof d.name !== 'string' || !NAME_RE.test(d.name)) {
    problems.push(`name must match '${NAME_RE.source}' (got ${JSON.stringify(d.name)})`)
  }
  if (typeof d.version !== 'string' || d.version.length === 0 || d.version.length > 128) {
    problems.push('version must be a non-empty string of at most 128 chars')
  }
  if (d.spdx !== undefined && !isSpdxExpression(d.spdx)) {
    problems.push(`spdx is not a valid SPDX expression (got ${JSON.stringify(d.spdx)})`)
  }
  if (d.source !== undefined) {
    let url
    try { url = new URL(d.source) } catch { url = null }
    if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
      problems.push(`source must be an http(s) URL (got ${JSON.stringify(d.source)})`)
    }
  }
  if (d.capabilities !== undefined) {
    if (!Array.isArray(d.capabilities) || d.capabilities.length > 64) {
      problems.push('capabilities must be an array of at most 64 entries')
    } else {
      d.capabilities.forEach((cap, i) => {
        if (cap === null || typeof cap !== 'object' || typeof cap.id !== 'string' || !CAPABILITY_ID_RE.test(cap.id)) {
          problems.push(`capabilities[${i}].id must match '${CAPABILITY_ID_RE.source}'`)
          return
        }
        if (cap.title !== undefined && typeof cap.title !== 'string') {
          problems.push(`capabilities[${i}].title must be a string`)
        }
      })
    }
  }

  const attach = d.attach
  if (attach === null || typeof attach !== 'object' || Array.isArray(attach)) {
    problems.push('attach is required (an object)')
  } else {
    const a = /** @type {Record<string, unknown>} */ (attach)
    if (!ATTACH_KINDS.includes(/** @type {string} */ (a.kind))) {
      problems.push(`attach.kind must be one of ${JSON.stringify(ATTACH_KINDS)} (got ${JSON.stringify(a.kind)})`)
    }
    if (a.command !== undefined && !isSafeCommand(a.command)) {
      problems.push(`attach.command must be a relative, shell-free executable name (got ${JSON.stringify(a.command)})`)
    }
    if (a.args !== undefined) {
      if (!Array.isArray(a.args) || a.args.length > MAX_ARGS) {
        problems.push(`attach.args must be an array of at most ${MAX_ARGS} tokens`)
      } else {
        a.args.forEach((arg, i) => {
          if (!isSafeArgvToken(arg)) {
            problems.push(`attach.args[${i}] must be a non-empty, shell-free token of at most ${MAX_ARG_LEN} chars`)
          }
        })
      }
    }
    if (a.endpoint !== undefined) {
      let url
      try { url = new URL(a.endpoint) } catch { url = null }
      if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
        problems.push(`attach.endpoint must be an http(s) URL (got ${JSON.stringify(a.endpoint)})`)
      }
    }
    if (a.wellKnown !== undefined) {
      const wk = a.wellKnown
      if (typeof wk !== 'string' || wk.length === 0 || wk.length > 200 || SHELL_META_RE.test(wk) || wk.includes('://')) {
        problems.push(`attach.wellKnown must be a plain relative path (got ${JSON.stringify(wk)})`)
      }
    }
    if (a.cwd !== undefined) {
      const cwd = a.cwd
      if (typeof cwd !== 'string' || cwd.length === 0 || cwd.length > 4096 || SHELL_META_RE.test(cwd)) {
        problems.push(`attach.cwd must be a plain path string with no shell metacharacters (got ${JSON.stringify(cwd)})`)
      }
    }
  }

  if (problems.length > 0) return { ok: false, descriptor: null, problems }
  const clean = {
    protocol: /** @type {string} */ (d.protocol),
    name: /** @type {string} */ (d.name),
    version: /** @type {string} */ (d.version),
    attach: /** @type {CapabilityAttach} */ (attach),
  }
  if (d.spdx !== undefined) clean.spdx = /** @type {string} */ (d.spdx)
  if (d.source !== undefined) clean.source = /** @type {string} */ (d.source)
  if (d.capabilities !== undefined) clean.capabilities = d.capabilities
  return { ok: true, descriptor: clean, problems: [] }
}

/**
 * Synthesize a descriptor from an MCP `initialize` response.
 *
 * MCP self-describes name/version/capabilities but NOT its license, so
 * `spdx` and `source` stay absent here — the wrapper package's manifest is
 * what asserts them (the `external` build gate makes that mandatory).
 * @param {unknown} initializeResult - the JSON-RPC `result` of `initialize`.
 * @returns {ValidationResult}
 */
export function descriptorFromMcpInfo(initializeResult) {
  /** @type {Record<string, unknown>} */
  const candidate = {
    protocol: PROTOCOL_ID,
    name: 'unknown',
    version: '0',
    attach: { kind: 'mcp-stdio' },
  }
  if (initializeResult !== null && typeof initializeResult === 'object') {
    const r = /** @type {Record<string, unknown>} */ (initializeResult)
    const info = r.serverInfo
    if (info !== null && typeof info === 'object') {
      const s = /** @type {Record<string, unknown>} */ (info)
      if (typeof s.name === 'string' && s.name.length > 0) candidate.name = s.name.slice(0, 128).toLowerCase()
      if (typeof s.version === 'string' && s.version.length > 0) candidate.version = s.version.slice(0, 128)
    }
    const caps = r.capabilities
    if (caps !== null && typeof caps === 'object') {
      candidate.capabilities = Object.keys(/** @type {Record<string, unknown>} */ (caps))
        .map(id => id.toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 64))
        .filter(id => id.length > 0)
        .slice(0, 64)
        .map(id => ({ id }))
    }
  }
  return validateDescriptor(candidate)
}

/**
 * Parse a `--describe` stdout payload into a descriptor.
 *
 * Accepted shapes, in order: the whole stdout as one JSON document; a JSON
 * envelope `{ "aekCapability": <descriptor> }`; the last non-empty JSON line
 * (log-prefixed providers).
 * @param {string} stdout
 * @returns {ValidationResult}
 */
export function descriptorFromCliDescribe(stdout) {
  if (typeof stdout !== 'string' || stdout.trim().length === 0) {
    return { ok: false, descriptor: null, problems: ['--describe produced no output'] }
  }
  /** @type {string[]} */
  const attempts = [stdout.trim()]
  const lines = stdout.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0 && attempts.length < 4; i--) {
    const line = lines[i].trim()
    if (line.startsWith('{')) attempts.push(line)
  }
  for (const text of attempts) {
    /** @type {unknown} */
    let parsed
    try { parsed = JSON.parse(text) } catch { continue }
    if (parsed !== null && typeof parsed === 'object' && 'aekCapability' in parsed) {
      parsed = /** @type {Record<string, unknown>} */ (parsed).aekCapability
    }
    const result = validateDescriptor(parsed)
    if (result.ok) return result
  }
  return {
    ok: false,
    descriptor: null,
    problems: ['no JSON descriptor found in --describe output (plain object, aekCapability envelope, or last JSON line)'],
  }
}

/**
 * @typedef {'content-length' | 'newline'} Framing
 * @typedef {{ id: number | string, method: string, params?: unknown, jsonrpc: string }} JsonRpcRequest
 */

/**
 * A JSON-RPC 2.0 request, ready to frame.
 * @param {number | string} id
 * @param {string} method
 * @param {unknown} [params]
 * @returns {JsonRpcRequest}
 */
export function jsonRpcRequest(id, method, params) {
  /** @type {JsonRpcRequest} */
  const out = { jsonrpc: '2.0', id, method }
  if (params !== undefined) out.params = params
  return out
}

/**
 * Frame one JSON-RPC message for writing.
 * @param {unknown} message
 * @param {Framing} [framing] - defaults to newline (MCP style).
 * @returns {string}
 */
export function encodeJsonRpc(message, framing = 'newline') {
  const json = JSON.stringify(message)
  if (framing === 'content-length') {
    // LSP-style framing. Measure bytes, not chars.
    return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`
  }
  return `${json}\n`
}

/**
 * Stream reader for JSON-RPC over a byte stream with auto-detected framing.
 *
 * Detection: the first non-blank bytes must start a `Content-Length:` header
 * (case-insensitive) → LSP framing; otherwise newline-JSON framing. The two
 * worlds are distinguishable on byte zero in practice (`C` vs `{`).
 *
 * The reader is pull-based: `next()` resolves to the next message, `null` on
 * clean EOF, or rejects when the underlying stream errors.
 */
export class JsonRpcStream {
  /**
   * @param {import('node:stream').Readable} input
   * @param {{ framing?: Framing }} [options] - force a framing instead of probing.
   */
  constructor(input, options = {}) {
    this._input = input
    this._forced = options.framing
    this._buf = Buffer.alloc(0)
    /** @type {unknown[]} */
    this._messages = []
    /** @type {{ resolve: (v: unknown) => void, reject: (e: unknown) => void }[]} */
    this._readers = []
    this._mode = /** @type {Framing | null} */ (options.framing ?? null)
    this._eof = false
    /** @type {Error | null} */
    this._error = null
    input.on('data', (chunk) => this._onData(/** @type {Buffer} */ (chunk)))
    input.once('end', () => { this._eof = true; this._pump() })
    input.once('error', (err) => { this._error = /** @type {Error} */ (err); this._eof = true; this._pump() })
  }

  /** @param {Buffer} chunk */
  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk])
    this._pump()
  }

  /** Consume whatever the buffer now holds, then wake waiting readers. */
  _pump() {
    this._consume()
    const readers = this._readers
    this._readers = []
    for (const reader of readers) {
      if (this._messages.length > 0) {
        reader.resolve(this._messages.shift())
      } else if (this._eof) {
        if (this._error !== null) reader.reject(this._error)
        else reader.resolve(null)
      } else {
        this._readers.push(reader) // still waiting
      }
    }
  }

  _consume() {
    if (this._mode === null) {
      // Disambiguate on the FIRST non-blank byte: `C` starts the LSP
      // `Content-Length:` header, `{` starts a newline-JSON document.
      // A partial first chunk can therefore never lock in the wrong mode.
      let offset = 0
      while (offset < this._buf.length && this._buf[offset] <= 0x20) offset++
      if (offset >= this._buf.length) { this._buf = Buffer.alloc(0); return }
      const first = this._buf[offset]
      if (first === 0x43 /* C */) this._mode = 'content-length'
      else this._mode = 'newline'
      this._buf = this._buf.subarray(offset)
    }
    if (this._mode === 'newline') {
      let nl
      while ((nl = this._buf.indexOf(0x0a)) !== -1) {
        const line = this._buf.subarray(0, nl).toString('utf8').trim()
        this._buf = this._buf.subarray(nl + 1)
        if (line.length > 0) this._messages.push(this._parseLine(line))
      }
      return
    }
    // content-length framing
    let guard = 0
    while (guard++ < 1000) {
      const marker = Buffer.from('\r\n\r\n')
      const headerEnd = this._buf.indexOf(marker)
      if (headerEnd === -1) return
      const headerBlock = this._buf.subarray(0, headerEnd).toString('utf8')
      const match = headerBlock.match(/Content-Length:\s*(\d+)/i)
      if (match === null) {
        this._messages.push({ jsonrpc: '2.0', error: { code: -32700, message: 'malformed Content-Length header' } })
        this._buf = this._buf.subarray(headerEnd + 4)
        continue
      }
      const bodyStart = headerEnd + 4
      const length = Number(match[1])
      if (this._buf.length < bodyStart + length) return // body not complete yet
      const body = this._buf.subarray(bodyStart, bodyStart + length).toString('utf8')
      this._buf = this._buf.subarray(bodyStart + length)
      try { this._messages.push(JSON.parse(body)) } catch {
        this._messages.push({ jsonrpc: '2.0', error: { code: -32700, message: 'invalid JSON in framed body' } })
      }
    }
  }

  /** @param {string} line */
  _parseLine(line) {
    try {
      return JSON.parse(line)
    } catch {
      return { jsonrpc: '2.0', error: { code: -32700, message: 'invalid JSON line' } }
    }
  }

  /**
   * Read the next message.
   * @returns {Promise<unknown | null>} `null` on clean EOF with nothing left.
   */
  next() {
    this._consume()
    if (this._messages.length > 0) return Promise.resolve(this._messages.shift())
    if (this._eof) return this._error !== null ? Promise.reject(this._error) : Promise.resolve(null)
    return new Promise((resolve, reject) => {
      this._readers.push({ resolve, reject })
    })
  }

  /** Drop the reader from the stream (caller cancelled). */
  abort() {
    this._readers.length = 0
  }
}

/**
 * Check a JSON-RPC reply against the id we asked for.
 * @param {unknown} reply
 * @param {number | string} expectedId
 * @returns {{ ok: boolean, result?: unknown, error?: { code: number, message: string }, problem?: string }}
 */
export function matchJsonRpcReply(reply, expectedId) {
  if (reply === null || typeof reply !== 'object') {
    return { ok: false, problem: 'reply is not an object' }
  }
  const r = /** @type {Record<string, unknown>} */ (reply)
  if (typeof r.id !== 'number' && typeof r.id !== 'string') {
    return { ok: false, problem: 'notification, not a reply' }
  }
  if (r.id !== expectedId) {
    return { ok: false, problem: `reply id ${String(r.id)} does not match ${String(expectedId)}` }
  }
  if (r.error !== undefined && r.error !== null) {
    const err = /** @type {Record<string, unknown>} */ (r.error)
    return { ok: false, error: { code: Number(err.code ?? -32600), message: String(err.message ?? 'JSON-RPC error') } }
  }
  return { ok: true, result: r.result }
}
