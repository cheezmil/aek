/**
 * AEK capability supervisor — the lifecycle owner for EXTERNAL capability
 * providers (separate processes that AEK talks to over standard protocols).
 *
 * This is the structural half of the license boundary: strong-copyleft code
 * (AGPL / GPL) may live in a deployment ONLY inside one of these external
 * processes. The supervisor never imports, links, or vendors provider code —
 * it only spawns / connects per the provider's own `attach` block, and it
 * only sees provider-asserted metadata (spdx / source) to render, never to
 * fetch or audit.
 *
 * Ownership rules (matching the rest of this repository):
 *   - state store: `<AEK_HOME>/capabilities.json` (via `@cheezmil/coraek/home`;
 *     no absolute path is ever hardcoded here);
 *   - an instance the supervisor SPAWNS is tracked by pid and is the only
 *     kind it may stop (SIGTERM, bounded 5s wait, NO escalation to SIGKILL,
 *     foreign/attached instances are reported, never killed);
 *   - disposeAll() on host shutdown kills every spawned child so no orphan
 *     survives (the ptc-runtime-python orphan lesson, applied here);
 *   - all shared state lives on the CapabilitySupervisor instance — the
 *     module itself holds no global singleton.
 *
 * @module @cheezmil/coraek/external-supervisor
 */
import { spawn, execFile } from 'node:child_process'
import { mkdirSync, renameSync, statSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { resolveAekHome } from './home.mjs'
import {
  JsonRpcStream,
  matchJsonRpcReply,
  descriptorFromMcpInfo,
  descriptorFromCliDescribe,
  validateDescriptor,
} from './external.mjs'

const execFileAsync = promisify(execFile)

/** SIGTERM grace before we give up on a child we spawned. */
export const STOP_GRACE_MS = 5_000
/** Health-ping deadline. */
export const PING_TIMEOUT_MS = 5_000
/** `--describe` probe deadline. */
export const DESCRIBE_TIMEOUT_MS = 10_000
/** Bounded log rotation: one active file + one `.1` overflow, 1 MiB cap. */
const MAX_LOG_BYTES = 1024 * 1024

/**
 * @typedef {import('./external.mjs').CapabilityDescriptor} CapabilityDescriptor
 * @typedef {import('./external.mjs').ValidationResult} ValidationResult
 */

/**
 * @typedef {object} ProviderEntry
 * @property {CapabilityDescriptor} declared - the pinned self-description.
 * @property {string} [pin] - version the user pinned.
 * @property {'self' | 'managed'} [installPolicy] - self: user installed it
 *   (zero host obligation); managed: host-distributed (host owes GPLv3 §6
 *   source pointer, rendered from `declared.source`).
 * @property {'absent' | 'stopped' | 'running' | 'failed'} state
 * @property {number} [pid] - present only while the supervisor spawned it.
 * @property {'supervisor' | 'external'} [startedBy] - attached instances are
 *   `external` and may be reported but never killed by the supervisor.
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} ProviderOptions
 * @property {NodeJS.ProcessEnv} [env] - env used to resolve the AEK home.
 * @property {string} [aekHome] - explicit home override (tests).
 */

/**
 * Lifecycle owner for external capability providers.
 */
export class CapabilitySupervisor {
  /** In-memory handle for children THIS instance spawned (owner-local state). */
  /** @type {Map<string, import('node:child_process').ChildProcess>} */
  #children = new Map()
  /** Per-id operation mutex (owner-local state). */
  /** @type {Map<string, Promise<unknown>>} */
  #locks = new Map()

  /**
   * @param {ProviderOptions} [options]
   */
  constructor(options = {}) {
    this._env = options.env ?? process.env
    this._aekHome = options.aekHome ?? resolveAekHome(this._env)
  }

  // --- state store ---------------------------------------------------------

  /** Absolute path of the state store (derived, never hardcoded). */
  storePath() {
    return join(this._aekHome, 'capabilities.json')
  }

  /**
   * Read the registry. A missing store is an empty registry, not an error.
   * @returns {Promise<Record<string, ProviderEntry>>}
   */
  async list() {
    try {
      const raw = readFileSync(this.storePath(), 'utf8')
      const doc = JSON.parse(raw)
      if (doc !== null && typeof doc === 'object' && doc.providers !== null && typeof doc.providers === 'object') {
        return doc.providers
      }
      return {}
    } catch {
      return {}
    }
  }

  /**
   * Write the registry atomically (tmp + rename).
   * @param {Record<string, ProviderEntry>} providers
   */
  writeStore(providers) {
    const doc = { version: 1, providers }
    const target = this.storePath()
    mkdirSync(dirname(target), { recursive: true })
    const tmp = `${target}.tmp-${process.pid}`
    writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`)
    renameSync(tmp, target)
  }

  /**
   * Register (or re-pin) a provider from a descriptor. WRITE operation —
   * callers (scripts, CLI) gate this behind explicit confirmation.
   * @param {string} id
   * @param {unknown} declaredRaw
   * @param {{ pin?: string, installPolicy?: 'self' | 'managed' }} [extra]
   * @returns {Promise<{ ok: boolean, problems: string[] }>}
   */
  async register(id, declaredRaw, extra = {}) {
    const check = validateDescriptor(declaredRaw)
    if (!check.ok) return { ok: false, problems: check.problems }
    if (typeof id !== 'string' || id.length === 0 || id.length > 64) {
      return { ok: false, problems: ['provider id must be a non-empty string of at most 64 chars'] }
    }
    const providers = await this.list()
    const previous = providers[id]
    providers[id] = {
      declared: check.descriptor,
      state: 'stopped',
      updatedAt: new Date().toISOString(),
    }
    if (extra.pin !== undefined) providers[id].pin = String(extra.pin)
    if (extra.installPolicy !== undefined) providers[id].installPolicy = extra.installPolicy
    if (previous?.state === 'running' && previous.startedBy === 'supervisor' && previous.pid) {
      // Re-registering a live spawned child keeps it live.
      providers[id].state = 'running'
      providers[id].pid = previous.pid
      providers[id].startedBy = 'supervisor'
    }
    this.writeStore(providers)
    return { ok: true, problems: [] }
  }

  /** Remove a provider. WRITE operation. Stops a live child first. */
  async unregister(id) {
    const providers = await this.list()
    if (providers[id] === undefined) return { ok: false, problems: [`no such provider '${id}'`] }
    if (providers[id].startedBy === 'supervisor' && providers[id].pid) {
      await this.stop(id)
    }
    delete providers[id]
    this.writeStore(providers)
    return { ok: true, problems: [] }
  }

  // --- lifecycle -----------------------------------------------------------

  /** Whether a pid still belongs to a live process. */
  static isPidAlive(pid) {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  /**
   * Liveness-correct view of one provider: a stored `running` with a dead
   * pid downgrades to `stopped` (stale state from a previous host boot).
   * @param {string} id
   * @returns {Promise<ProviderEntry | null>}
   */
  async status(id) {
    const providers = await this.list()
    const entry = providers[id]
    if (entry === undefined) return null
    if (entry.state === 'running') {
      const live = entry.startedBy === 'supervisor'
        ? entry.pid !== undefined && CapabilitySupervisor.isPidAlive(entry.pid)
        : entry.startedBy === 'external'
      if (!live) entry.state = 'stopped'
    }
    return entry
  }

  /** All providers, liveness-corrected, in id order. */
  async statusAll() {
    const providers = await this.list()
    const out = []
    for (const id of Object.keys(providers).sort()) {
      const entry = await this.status(id)
      if (entry !== null) out.push({ id, ...entry })
    }
    return out
  }

  /**
   * Bring a provider up.
   *
   * - `attach.endpoint` declared → CONNECT ONLY (single-instance guard: a
   *   running daemon is never re-spawned);
   * - otherwise SPAWN `attach.command` + `attach.args` (execFile-style argv,
   *   no shell), track the pid, cap-rotated log file.
   *
   * Idempotent: a live provider returns immediately.
   * @param {string} id
   * @returns {Promise<{ ok: boolean, state: string, problem?: string }>}
   */
  async start(id) {
    const locked = this.#lock(id, () => this.#startUnlocked(id))
    return locked
  }

  /** @param {string} id */
  #lock(id, fn) {
    const previous = this.#locks.get(id) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(fn)
    this.#locks.set(id, next.catch(() => {}))
    return next
  }

  async #startUnlocked(id) {
    const entry = await this.status(id)
    if (entry === null) return { ok: false, state: 'absent', problem: `no such provider '${id}'` }
    if (entry.state === 'running') return { ok: true, state: 'running' }

    const attach = entry.declared.attach
    const providers = await this.list()
    const patch = providers[id]
    if (attach.endpoint !== undefined) {
      // Single-instance daemons: we only ever ATTACH.
      if (attach.kind !== 'http') {
        patch.state = 'failed'
        patch.startedBy = undefined
        this.writeStore(providers)
        return { ok: false, state: 'failed', problem: 'attach.endpoint is only valid for the http kind' }
      }
      const reachable = await this.#httpReachable(attach)
      if (!reachable.ok) {
        patch.state = 'failed'
        patch.startedBy = undefined
        this.writeStore(providers)
        return { ok: false, state: 'failed', problem: `endpoint not reachable: ${reachable.problem ?? 'connection error'}` }
      }
      patch.state = 'running'
      patch.startedBy = 'external'
      patch.pid = undefined
      this.writeStore(providers)
      return { ok: true, state: 'running' }
    }

    if (attach.command === undefined) {
      patch.state = 'failed'
      this.writeStore(providers)
      return { ok: false, state: 'failed', problem: 'no attach.command declared — nothing to spawn' }
    }

    // Single-instance guard: a still-live recorded pid — whoever spawned it —
    // means the provider already runs; we ADOPT, we never spawn a second.
    if (patch.pid !== undefined && CapabilitySupervisor.isPidAlive(patch.pid)) {
      patch.state = 'running'
      patch.startedBy = 'external'
      this.writeStore(providers)
      return { ok: true, state: 'running', problem: 'adopted a live recorded instance; never re-spawned' }
    }
    const logger = makeLogger(this.logPath(id))
    const stream = spawn(attach.command, attach.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this._env,
    })
    this.#rotateBeforeWrite(id)
    stream.stdout?.on('data', (chunk) => logger(chunk))
    stream.stderr?.on('data', (chunk) => logger(chunk))
    /** @type {{ exited: boolean, code: number | null }} */
    const exitRecord = { exited: false, code: null }
    stream.once('exit', (code) => {
      exitRecord.exited = true
      exitRecord.code = code
      this.#children.delete(id)
      // No store write here: the start flow (under the per-id lock) is the
      // single writer, so a late exit can never race the running record.
    })
    stream.once('error', () => {
      exitRecord.exited = true
    })
    this.#children.set(id, stream)
    // Let spawn settle so a child that dies immediately is reported honestly.
    await new Promise(resolve => setTimeout(resolve, 150))
    if (exitRecord.exited || stream.exitCode !== null || stream.signalCode !== null) {
      this.#children.delete(id)
      patch.state = 'failed'
      patch.pid = undefined
      patch.startedBy = undefined
      this.writeStore(providers)
      return { ok: false, state: 'failed', problem: `provider exited immediately (code=${exitRecord.code ?? stream.exitCode ?? 'spawn-error'})` }
    }
    patch.state = 'running'
    patch.startedBy = 'supervisor'
    patch.pid = stream.pid
    this.writeStore(providers)
    return { ok: true, state: 'running' }
  }

  /** Bounded rotation of `<AEK_HOME>/logs/capability-<id>.log`. */
  #rotateBeforeWrite(id) {
    const path = this.logPath(id)
    try {
      if (statSync(path).size >= MAX_LOG_BYTES) {
        renameSync(path, `${path}.1`)
      }
    } catch {
      /* absent log file: nothing to rotate */
    }
  }

  /**
   * Stop a provider WE spawned. SIGTERM → bounded wait → give up (record
   * `failed`), never escalate to SIGKILL. Attached (foreign) instances are
   * reported, never touched.
   * @param {string} id
   * @returns {Promise<{ ok: boolean, state: string, problem?: string }>}
   */
  async stop(id) {
    return this.#lock(id, async () => {
      const providers = await this.list()
      const entry = providers[id]
      if (entry === undefined) return { ok: false, state: 'absent', problem: `no such provider '${id}'` }
      if (entry.startedBy === 'external') {
        return { ok: false, state: entry.state === 'running' ? 'running' : 'stopped', problem: 'attached instance — report only, never kill' }
      }
      const child = this.#children.get(id)
      let stopped = false
      if (child !== undefined && child.pid !== undefined) {
        stopped = this.#terminate(child)
        this.#children.delete(id)
      } else if (entry.pid !== undefined && CapabilitySupervisor.isPidAlive(entry.pid)) {
        // Rebooted host: the pid survived us. Signal it (still OUR pid, we
        // own it by record), SIGTERM only.
        try { process.kill(entry.pid, 'SIGTERM'); stopped = true } catch { stopped = false }
      } else {
        stopped = true // already dead
      }
      entry.state = 'stopped'
      entry.pid = undefined
      entry.startedBy = undefined
      this.writeStore(providers)
      if (!stopped) {
        return { ok: false, state: 'stopped', problem: 'terminate signal not delivered; recorded stopped' }
      }
      const deadline = Date.now() + STOP_GRACE_MS
      while (child?.pid !== undefined && CapabilitySupervisor.isPidAlive(child.pid)) {
        if (Date.now() >= deadline) break // no escalation, by design
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return { ok: true, state: 'stopped' }
    })
  }

  /**
   * @param {import('node:child_process').ChildProcess} child
   * @returns {boolean} whether SIGTERM was delivered.
   */
  #terminate(child) {
    try {
      child.kill('SIGTERM')
      return true
    } catch {
      return false
    }
  }

  /**
   * Synchronous last line of defense at host disposal: signal every child
   * held in memory NOW. The bounded, graceful variant is `stop(id)` (CLI /
   * scripts); this one runs inside a disposal effect and must not await.
   */
  stopAllNow() {
    for (const child of this.#children.values()) {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    }
    this.#children.clear()
  }

  /**
   * Host-shutdown hook: stop every child we spawned, so no orphan survives.
   * @returns {Promise<string[]>} ids stopped.
   */
  async disposeAll() {
    const providers = await this.list()
    /** @type {string[]} */
    const stopped = []
    for (const id of Object.keys(providers)) {
      if (providers[id].startedBy === 'supervisor') {
        const result = await this.stop(id)
        if (result.ok || result.state === 'stopped') stopped.push(id)
      }
    }
    this.#children.clear()
    this.#locks.clear()
    return stopped
  }

  // --- discovery / health ----------------------------------------------------

  /**
   * Live self-description of a provider (spawn a probe, do not keep it).
   * Surfaces: MCP `initialize`, `aek.describe` JSON-RPC extension (optional),
   * HTTP well-known, CLI `--describe`. Falls back to the DECLARED entry when
   * the live surface is unavailable (reported via `source: 'declared'`).
   * @param {string} id
   * @returns {Promise<ValidationResult & { source: 'live' | 'declared', id: string }>}
   */
  async describe(id) {
    const entry = await this.status(id)
    if (entry === null) return { ok: false, descriptor: null, problems: [`no such provider '${id}'`], source: 'declared', id }
    const attach = entry.declared.attach
    if (attach.kind === 'mcp-stdio' && attach.command !== undefined) {
      const live = await this.#mcpProbe(attach, id)
      if (live !== null) return { ...live, source: 'live', id }
    }
    if (attach.kind === 'jsonrpc-stdio' && attach.command !== undefined) {
      const live = await this.#jsonrpcProbe(attach, id)
      if (live !== null) return { ...live, source: 'live', id }
    }
    if (attach.kind === 'cli' && attach.command !== undefined) {
      const live = await this.#cliProbe(attach, id)
      if (live !== null) return { ...live, source: 'live', id }
    }
    if (attach.kind === 'http' && attach.endpoint !== undefined) {
      const live = await this.#wellKnownProbe(attach, id)
      if (live !== null) return { ...live, source: 'live', id }
    }
    return { ok: true, descriptor: entry.declared, problems: ['live surface unavailable; using declared'], source: 'declared', id }
  }

  /**
   * Read-only health: does the provider answer on its surface?
   * @param {string} id
   * @returns {Promise<{ ok: boolean, healthy: boolean, detail: string, id: string }>}
   */
  async health(id) {
    const entry = await this.status(id)
    if (entry === null) return { ok: false, healthy: false, detail: `no such provider '${id}'`, id }
    if (entry.state === 'absent' || entry.state === 'stopped' || entry.state === 'failed') {
      return { ok: true, healthy: false, detail: `state=${entry.state}`, id }
    }
    const attach = entry.declared.attach
    if (attach.kind === 'http' && attach.endpoint !== undefined) {
      const reach = await this.#httpReachable(attach)
      return { ok: true, healthy: reach.ok, detail: reach.ok ? 'reachable' : `unreachable (${reach.problem})`, id }
    }
    if (attach.kind === 'jsonrpc-stdio' && attach.command !== undefined) {
      const live = await this.#jsonrpcProbe(attach, id, 'aek.ping')
      if (live === null) {
        return { ok: true, healthy: false, detail: 'aek.ping unsupported (provider may be unstarted or non-responsive)', id }
      }
      return { ok: true, healthy: true, detail: 'ping answered', id }
    }
    if (attach.kind === 'mcp-stdio' && attach.command !== undefined) {
      const live = await this.#mcpProbe(attach, id)
      return { ok: true, healthy: live !== null, detail: live === null ? 'initialize timed out' : 'initialized', id }
    }
    if (attach.kind === 'cli' && attach.command !== undefined) {
      const live = await this.#cliProbe(attach, id)
      return { ok: true, healthy: live !== null, detail: live === null ? '--describe failed' : '--describe ok', id }
    }
    return { ok: true, healthy: true, detail: 'no health surface declared', id }
  }

  // --- probes (each bounded, each leaving no child behind) -------------------

  /** @param {import('./external.mjs').CapabilityAttach} attach @param {string} id */
  async #mcpProbe(attach, id) {
    /** @type {import('node:child_process').ChildProcess | null} */
    let child = null
    try {
      child = spawn(attach.command, attach.args ?? [], { stdio: ['pipe', 'pipe', 'pipe'], env: this._env })
      const reader = new JsonRpcStream(child.stdout, { framing: 'newline' })
      child.stdin?.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'aek-capability-supervisor', version: '1.0.0' } },
      }) + '\n')
      const reply = await withTimeout(reader.next(), PING_TIMEOUT_MS)
      const match = reply === null ? null : matchJsonRpcReply(reply, 1)
      if (match === null || !match.ok) return null
      return descriptorFromMcpInfo(match.result)
    } catch {
      return null
    } finally {
      if (child !== null) {
        try { child.kill('SIGTERM') } catch { /* already gone */ }
      }
      void id
    }
  }

  /** @param {import('./external.mjs').CapabilityAttach} attach @param {string} id @param {string} [method] */
  async #jsonrpcProbe(attach, id, method = 'aek.describe') {
    /** @type {import('node:child_process').ChildProcess | null} */
    let child = null
    try {
      child = spawn(attach.command, attach.args ?? [], { stdio: ['pipe', 'pipe', 'pipe'], env: this._env })
      const reader = new JsonRpcStream(child.stdout)
      child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id: 7, method, params: {} }) + '\n')
      const reply = await withTimeout(reader.next(), PING_TIMEOUT_MS)
      if (reply === null) return null
      const match = matchJsonRpcReply(reply, 7)
      if (!match.ok) return null
      if (method === 'aek.ping') return { ok: true, descriptor: null, problems: [], source: 'live' }
      // aek.describe: the reply IS the descriptor (or a { descriptor } envelope).
      let candidate = match.result
      if (candidate !== null && typeof candidate === 'object' && 'aekCapability' in candidate) {
        candidate = /** @type {Record<string, unknown>} */ (candidate).aekCapability
      }
      return validateDescriptor(candidate)
    } catch {
      return null
    } finally {
      if (child !== null) {
        try { child.kill('SIGTERM') } catch { /* already gone */ }
      }
      void id
    }
  }

  /** @param {import('./external.mjs').CapabilityAttach} attach @param {string} id */
  async #cliProbe(attach, id) {
    try {
      const result = await execFileAsync(attach.command, [...(attach.args ?? []), '--describe'], {
        env: this._env,
        timeout: DESCRIBE_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
      })
      return descriptorFromCliDescribe(result.stdout)
    } catch {
      return null
    }
  }

  /** @param {import('./external.mjs').CapabilityAttach} attach @param {string} id */
  async #wellKnownProbe(attach, id) {
    try {
      const base = attach.endpoint ?? ''
      const path = attach.wellKnown ?? '.well-known/aek-capabilities.json'
      const url = new URL(path.replace(/^\/+/, ''), `${base}/`)
      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(DESCRIBE_TIMEOUT_MS) })
      if (!response.ok) return null
      const body = await response.json()
      const check = validateDescriptor(body)
      if (!check.ok) return null
      return check
    } catch {
      return null
    }
  }

  /** @param {import('./external.mjs').CapabilityAttach} attach */
  async #httpReachable(attach) {
    try {
      const path = attach.wellKnown ?? '.well-known/aek-capabilities.json'
      const url = new URL(path.replace(/^\/+/, ''), `${attach.endpoint ?? ''}/`)
      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(PING_TIMEOUT_MS) })
      return { ok: response.ok, problem: response.ok ? undefined : `HTTP ${response.status}` }
    } catch (cause) {
      return { ok: false, problem: cause instanceof Error ? cause.message : String(cause) }
    }
  }

  /** Absolute path of the provider's log file. */
  logPath(id) {
    return join(this._aekHome, 'logs', `capability-${id}.log`)
  }

  /**
   * Render the compliance line for one provider entry.
   *
   * This is the "form" half of the boundary (the GNU FAQ's "you have to do it
   * properly"): the template is fixed in the host, the DATA is the
   * provider-asserted descriptor, and nothing upstream-specific is known here.
   * @param {ProviderEntry} entry
   * @returns {string} one stable, human-readable line.
   */
  static complianceLine(entry) {
    const d = entry.declared
    const processName = d.attach.command ?? d.name
    const version = entry.pin !== undefined ? ` (pinned ${entry.pin})` : d.version !== undefined ? ` (v${d.version})` : ''
    let line = `'${d.name}'${version} is provided by the separate process '${processName}' — not part of the AEK host process`
    line += d.spdx !== undefined ? `; provider license: ${d.spdx}` : '; provider license: not declared'
    if (entry.installPolicy === 'managed') {
      line += `; distributed by AEK, corresponding source: ${d.source ?? 'see the provider'}`
    } else {
      line += `; installed and maintained by the user${d.source !== undefined ? ` (source: ${d.source})` : ''}`
    }
    return line
  }
}

/**
 * Appender with bounded rotation (1 MiB active + one `.1` overflow).
 * Log failures never break the provider lifecycle.
 * @param {string} path
 * @returns {(chunk: Buffer | string) => void}
 */
function makeLogger(path) {
  return (chunk) => {
    try {
      const dir = dirname(path)
      mkdirSync(dir, { recursive: true })
      try {
        if (statSync(path).size >= MAX_LOG_BYTES) renameSync(path, `${path}.1`)
      } catch { /* no file yet */ }
      appendFileSync(path, chunk)
    } catch { /* bounded logs are best-effort */ }
  }
}

/**
 * @param {Promise<unknown>} promise
 * @param {number} ms
 */
async function withTimeout(promise, ms) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms)
      }),
    ])
  } finally {
    clearTimeout(/** @type {Timer} */ (timer))
  }
}
