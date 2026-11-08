/**
 * Host-level access control for the AEK console (2026-11-09 round).
 *
 * DEFAULT: only loopback and RFC1918 private ranges (10/8, 172.16/12,
 * 192.168/16) may reach the web server. Everything else gets 403. Operators
 * may add their own IPs, CIDR blocks or host names, or deliberately expose the
 * console to the public — but public exposure REQUIRES a username and a
 * password, otherwise it cannot be enabled at all.
 *
 * Security decisions verified with `aekws` (2026-11-09):
 * - Only `req.socket.remoteAddress` is trusted. `X-Forwarded-For` is never
 *   read: MDN states that using it for access control is only safe for values
 *   appended by a trusted proxy, and we have no trusted-proxy configuration.
 * - Dual-stack sockets report IPv4 peers as `::ffff:a.b.c.d`; they are
 *   normalised before classification (ipaddr.js `process()` behaviour).
 * - Basic credentials are compared through fixed-length SHA-256 digests with
 *   `crypto.timingSafeEqual` (CVE-2024-47178: plain string equality leaks the
 *   secret through timing). Passwords are stored as scrypt salted hashes,
 *   never in plaintext and never returned by the API.
 *
 * @module aek-websearch/access
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveAekHome } from '@cheezmil/coraek/home'

/** Route serving the access settings (GET = read, POST = update). */
export const ACCESS_API_PATH = '/api/aek/access'

/** Maximum number of custom allowlist entries; keeps the file bounded. */
const MAX_ALLOWLIST = 100

/** One stored access configuration. */
interface StoredAccess {
  /** Expose to every address (requires credentials). */
  publicMode: boolean
  /** Extra IPs, CIDR blocks or host names allowed in private mode. */
  allowlist: string[]
  /** Basic-auth username. */
  username: string
  /** `scrypt$<saltHex>$<digestHex>`; empty means "no password set". */
  passwordHash: string
}

/** The API-visible view — never contains a hash. */
export interface AccessView {
  /** Whether public exposure is on. */
  publicMode: boolean
  /** Extra allowlist entries. */
  allowlist: string[]
  /** Basic-auth username. */
  username: string
  /** Whether a password has been configured. */
  hasPassword: boolean
}

/** One update sent by the settings page. */
export interface AccessUpdate {
  /** Whether public exposure is on. */
  publicMode?: boolean
  /** Replacement allowlist. */
  allowlist?: string[]
  /** Basic-auth username. */
  username?: string
  /** New password; omitted means "keep the current one". */
  password?: string
}

/** The default, fail-closed configuration. */
const DEFAULT_ACCESS: StoredAccess = {
  publicMode: false,
  allowlist: [],
  username: '',
  passwordHash: '',
}

/** @returns the settings file inside this slot's data root. */
function accessFile(): string {
  return join(resolveAekHome(), 'access-settings.json')
}

/**
 * Read the stored configuration, tolerating a missing or malformed file.
 * @returns a normalised configuration.
 */
export function readAccess(): StoredAccess {
  try {
    const parsed = JSON.parse(readFileSync(accessFile(), 'utf-8')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_ACCESS }
    const raw = parsed as Record<string, unknown>
    return {
      publicMode: raw.publicMode === true,
      allowlist: Array.isArray(raw.allowlist)
        ? raw.allowlist.filter((item): item is string => typeof item === 'string').slice(0, MAX_ALLOWLIST)
        : [],
      username: typeof raw.username === 'string' ? raw.username : '',
      passwordHash: typeof raw.passwordHash === 'string' ? raw.passwordHash : '',
    }
  } catch {
    return { ...DEFAULT_ACCESS }
  }
}

/** @returns the API-safe view of the current configuration. */
export function accessView(): AccessView {
  const stored = readAccess()
  return {
    publicMode: stored.publicMode,
    allowlist: stored.allowlist,
    username: stored.username,
    hasPassword: stored.passwordHash.length > 0,
  }
}

/**
 * Hash a password with a fresh random salt.
 * @param password - plaintext password (never stored).
 * @returns the `scrypt$salt$digest` string.
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const digest = scryptSync(password, salt, 32)
  return `scrypt$${salt.toString('hex')}$${digest.toString('hex')}`
}

/**
 * Verify a password against a stored hash in constant time.
 * @param password - the candidate.
 * @param stored - the stored `scrypt$salt$digest` string.
 * @returns true when it matches.
 */
function verifyPassword(password: string, stored: string): boolean {
  const [kind, saltHex, digestHex] = stored.split('$')
  if (kind !== 'scrypt' || saltHex === undefined || digestHex === undefined) return false
  try {
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 32)
    const expected = Buffer.from(digestHex, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/**
 * Constant-time comparison of two credentials of arbitrary length. Hashing
 * both sides to a fixed 32-byte digest removes the length leak that a bare
 * `timingSafeEqual` on the raw strings would still have.
 * @param left - first value.
 * @param right - second value.
 * @returns true when equal.
 */
function safeEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left, 'utf8').digest()
  const b = createHash('sha256').update(right, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/** A hostname or CIDR entry, validated to keep the file predictable. */
const SAFE_ENTRY = /^[A-Za-z0-9._*:/-]{1,253}$/u

/**
 * Validate and persist an update.
 *
 * Enabling `publicMode` without BOTH a username and a password is rejected —
 * this is the "public access must set a username and password" rule. An
 * existing hash counts as a configured password.
 * @param update - untrusted request body.
 * @returns the resulting view, or an error message.
 */
export function writeAccess(update: AccessUpdate): { ok: true; view: AccessView } | { ok: false; message: string } {
  const current = readAccess()
  const publicMode = update.publicMode === true
  const username = typeof update.username === 'string' ? update.username.trim() : current.username
  const allowlist = Array.isArray(update.allowlist)
    ? update.allowlist
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(item => item.length > 0 && SAFE_ENTRY.test(item))
      .slice(0, MAX_ALLOWLIST)
    : current.allowlist
  const passwordHash = typeof update.password === 'string' && update.password.length > 0
    ? hashPassword(update.password)
    : current.passwordHash
  if (publicMode && (username.length === 0 || passwordHash.length === 0)) {
    return { ok: false, message: 'public access requires a username and a password' }
  }
  const next: StoredAccess = { publicMode, username, allowlist, passwordHash }
  const file = accessFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf-8')
  return { ok: true, view: accessView() }
}

/**
 * Normalise a socket address. Dual-stack listeners report IPv4 peers as
 * `::ffff:127.0.0.1`; `::1` and IPv6 unique-local / link-local addresses are
 * kept as-is.
 * @param raw - `req.socket.remoteAddress`.
 * @returns a lowercase address string.
 */
export function normalizeAddress(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase()
  if (value.startsWith('::ffff:')) return value.slice(7)
  return value
}

/** Convert a dotted IPv4 quad to a 32-bit unsigned integer. */
function v4Bits(value: string): number | undefined {
  const parts = value.split('.')
  if (parts.length !== 4) return undefined
  let bits = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return undefined
    const octet = Number(part)
    if (octet > 255) return undefined
    bits = (bits * 256 + octet) >>> 0
  }
  return bits
}

/** RFC1918 + loopback ranges, expressed as `[network, prefixLength]`. */
const PRIVATE_V4: readonly (readonly [number, number])[] = [
  [v4Bits('10.0.0.0') ?? 0, 8],
  [v4Bits('172.16.0.0') ?? 0, 12],
  [v4Bits('192.168.0.0') ?? 0, 16],
  [v4Bits('127.0.0.0') ?? 0, 8],
  [v4Bits('169.254.0.0') ?? 0, 16],
]

/**
 * Is one IPv4 address inside a CIDR block?
 * @param bits - address as uint32.
 * @param network - network address as uint32.
 * @param prefix - prefix length (0-32).
 * @returns true when the address belongs to the block.
 */
function inCidr(bits: number, network: number, prefix: number): boolean {
  if (prefix <= 0) return true
  if (prefix >= 32) return bits === network
  const mask = (0xffffffff << (32 - prefix)) >>> 0
  return (bits & mask) === (network & mask)
}

/**
 * Parse one allowlist entry into either an IPv4 matcher or a host pattern.
 * @param entry - a validated entry.
 * @returns a predicate over (address, host), or undefined when unusable.
 */
function entryMatcher(entry: string): ((address: string, host: string) => boolean) | undefined {
  const value = entry.toLowerCase()
  if (value.includes('/')) {
    const [base, prefixText] = value.split('/')
    const network = v4Bits(base ?? '')
    const prefix = Number(prefixText)
    if (network === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return undefined
    return (address) => {
      const bits = v4Bits(address)
      return bits !== undefined && inCidr(bits, network, prefix)
    }
  }
  if (v4Bits(value) !== undefined) return address => address === value
  if (!SAFE_ENTRY.test(value)) return undefined
  if (value.startsWith('*.')) {
    const suffix = value.slice(1)
    return (_address, host) => host === value.slice(2) || host.endsWith(suffix)
  }
  return (_address, host) => host === value
}

/**
 * Is this a local / private address we allow by default?
 * @param address - normalised socket address.
 * @returns true for loopback, RFC1918 A/B/C and IPv6 local ranges.
 */
export function isLocalAddress(address: string): boolean {
  if (address === '::1' || address === 'localhost') return true
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true
  const bits = v4Bits(address)
  if (bits === undefined) return false
  return PRIVATE_V4.some(([network, prefix]) => inCidr(bits, network, prefix))
}

/** Write a short JSON rejection, guarding against a double response. */
function reject(res: ServerResponse, status: number, code: string, message: string, challenge = false): void {
  if (res.headersSent) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  if (challenge) res.setHeader('www-authenticate', 'Basic realm="AEK", charset="UTF-8"')
  res.end(JSON.stringify({ code, message }))
}

/**
 * The request guard registered on the host web server. Runs for EVERY request
 * — API routes, the SPA fallback and upgrades — before route dispatch.
 *
 * Loopback is always allowed so an operator can never lock themselves out of
 * the settings page. Public mode switches from IP filtering to Basic Auth.
 * @param req - the incoming request.
 * @param res - the response (written only on rejection).
 * @returns true when dispatch may continue.
 */
export function accessGuard(req: IncomingMessage, res: ServerResponse): boolean {
  const config = readAccess()
  const address = normalizeAddress(req.socket.remoteAddress)
  const rawHost = String(req.headers.host ?? '').toLowerCase()
  const host = rawHost.split(':')[0] ?? ''
  // The machine itself is always trusted: otherwise a misconfigured allowlist
  // could make the settings page unreachable with no way back.
  if (address === '127.0.0.1' || address === '::1' || address === 'localhost') return true

  if (config.publicMode) {
    const header = req.headers.authorization
    if (typeof header !== 'string' || !header.startsWith('Basic ')) {
      reject(res, 401, 'auth-required', 'credentials required', true)
      return false
    }
    let decoded = ''
    try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8') } catch { /* invalid below */ }
    const separator = decoded.indexOf(':')
    const username = separator < 0 ? '' : decoded.slice(0, separator)
    const password = separator < 0 ? '' : decoded.slice(separator + 1)
    const userOk = safeEqual(username, config.username)
    const passOk = config.passwordHash.length > 0 && verifyPassword(password, config.passwordHash)
    if (!userOk || !passOk) {
      reject(res, 401, 'auth-failed', 'invalid credentials', true)
      return false
    }
    return true
  }

  if (isLocalAddress(address)) return true
  for (const entry of config.allowlist) {
    if (entryMatcher(entry)?.(address, host) === true) return true
  }
  reject(res, 403, 'forbidden', 'this address is not allowed; add it in Settings → Access')
  return false
}
