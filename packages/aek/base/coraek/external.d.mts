/** Protocol id every self-describing provider must carry. */
export declare const PROTOCOL_ID: string

/** Legal attach kinds. Anything else is rejected at the manifest gate. */
export declare const ATTACH_KINDS: readonly ['mcp-stdio', 'jsonrpc-stdio', 'http', 'cli']

/** Hard bounds for argv material. */
export declare const MAX_ARGS: number
export declare const MAX_ARG_LEN: number

/** Shell-free argv token (command names and args alike). */
export declare function isSafeArgvToken(token: unknown): boolean

/** Executable names must additionally be relative (never an absolute path). */
export declare function isSafeCommand(token: unknown): boolean

/** Whether a string parses as a legal (possibly compound) SPDX expression. */
export declare function isSpdxExpression(value: unknown): boolean

export interface CapabilityAttach {
  /** How the provider is reached. */
  kind: 'mcp-stdio' | 'jsonrpc-stdio' | 'http' | 'cli'
  /** PATH-resolved executable, never absolute. */
  command?: string
  args?: string[]
  /**
   * Optional working directory for the spawned provider. Lets a package-local
   * bin (a relative `bin/…` path, per the gate rule) be spawned in place.
   */
  cwd?: string
  /** An already-running instance to attach to (never spawned here). */
  endpoint?: string
  /** Descriptor path for the http kind. */
  wellKnown?: string
}

export interface CapabilityDescriptor {
  /** Always `aek-capability/1`. */
  protocol: string
  name: string
  version: string
  /** Provider-asserted license; rendered, never fetched. */
  spdx?: string
  /** Where the corresponding source lives. */
  source?: string
  capabilities?: { id: string, title?: string }[]
  attach: CapabilityAttach
}

export interface ValidationResult {
  ok: boolean
  descriptor: CapabilityDescriptor | null
  /** Deterministic, human-readable. */
  problems: string[]
}

/**
 * Validate any value as a capability descriptor. Strict and total: returns
 * problems instead of throwing, so gates and UIs share one code path.
 */
export declare function validateDescriptor(value: unknown): ValidationResult

/**
 * Synthesize a descriptor from an MCP `initialize` response. License fields
 * stay absent by design — the wrapper manifest asserts them.
 */
export declare function descriptorFromMcpInfo(initializeResult: unknown): ValidationResult

/**
 * Parse a `--describe` stdout payload: plain JSON, `aekCapability` envelope,
 * or the last JSON line.
 */
export declare function descriptorFromCliDescribe(stdout: string): ValidationResult

export type Framing = 'content-length' | 'newline'

/** A JSON-RPC 2.0 request, ready to frame. */
export interface JsonRpcRequest {
  jsonrpc: string
  id: number | string
  method: string
  params?: unknown
}

/** Build a JSON-RPC 2.0 request. */
export declare function jsonRpcRequest(id: number | string, method: string, params?: unknown): JsonRpcRequest

/**
 * Frame one JSON-RPC message. `newline` is MCP style, `content-length` LSP.
 */
export declare function encodeJsonRpc(message: unknown, framing?: Framing): string

/**
 * Stream reader for JSON-RPC over a byte stream with auto-detected framing.
 */
export declare class JsonRpcStream {
  constructor(input: import('node:stream').Readable, options?: { framing?: Framing })
  /** Next message, `null` on clean EOF, rejects on stream error. */
  next(): Promise<unknown | null>
  /** Drop all queued readers (caller cancelled). */
  abort(): void
}

/**
 * Check a JSON-RPC reply against the id we asked for.
 */
export declare function matchJsonRpcReply(
  reply: unknown,
  expectedId: number | string,
): { ok: boolean, result?: unknown, error?: { code: number, message: string }, problem?: string }
