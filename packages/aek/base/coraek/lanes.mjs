#!/usr/bin/env node
/**
 * The lane registry: dynamic, agent-allocated slots for parallel development.
 *
 * The built-in slots (`aek`, `next`, see `slots.mjs`) are a fixed pair; this
 * module adds an open-ended third-and-beyond tier. Each agent that wants its
 * own dev cycle (its own worktree, its own data root, its own port pair)
 * allocates a LANE here. The registry is the ONE piece of shared mutable
 * state between agents: a JSON file in the shared container, guarded by an
 * atomic mkdir lock (the `proper-lockfile` pattern — `fs.mkdir` is atomic on
 * local filesystems, no `O_EXCL` NFS caveats, works cross-platform).
 *
 * Layout:
 *   <container>/lanes.json      the registry (machine-local data, not source)
 *   <container>/.lanes.lock.d/  the lock dir; holds a pid file
 *
 * Allocation model (borrowed from dapi/port-selector, see the dev notes):
 *   - stable per lane name: the same lane always gets the same pair
 *   - port-keyed uniqueness: the allocator scans pairs in pool order and
 *     skips any pair already registered
 *   - claim protocol: a lane may be held by at most ONE live agent; a second
 *     claimant gets a hard failure, never a fight over ports or data roots
 *
 * The port pool is a cpuh-allocated range for this project (1690-1699, the
 * `aek` project segment recorded in the global port ledger). Extending the
 * pool is a one-line change here plus a cpuh range request — never a port
 * picked by hand in a script.
 *
 * No absolute path is hardcoded: everything resolves from `resolveAekRoot()`.
 *
 * @module @cheezmil/coraek/lanes
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveAekRoot } from './home.mjs'
import { isPidAlive } from './slot-lock.mjs'

/** Registry file name, inside the shared container. */
export const LANE_REGISTRY_FILENAME = 'lanes.json'
/** Lock dir name, inside the shared container. */
export const LANE_LOCK_DIRNAME = '.lanes.lock.d'
/** A claim whose pid is dead AND older than this is stealable. */
export const LANE_STALE_MS = 5 * 60 * 1000
/**
 * Lane web-port pool (each lane owns the pair `<port>, <port + 1>` =
 * web + CDP). cpuh-allocation: the `aek` project owns 1690-1699; the built-in
 * slots keep 1685-1688. Five lanes fit; extend by appending.
 */
export const LANE_PORT_POOL = /** @type {ReadonlyArray<number>} */ ([1690, 1692, 1694, 1696, 1698])
/** Lane names: kebab, 1..12 chars, must not shadow a built-in slot. */
const LANE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,11}$/

/** @typedef {{ name: string, webPort: number, cdpPort: number, branch: string, worktree?: string, createdAt?: string, claim?: LaneClaim }} LaneEntry */
/** @typedef {{ agentId: string, pid: number, startedAt: string }} LaneClaim */

let cache = { mtime: -1, registry: null }

/**
 * Absolute path of the registry file.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string} `<container>/lanes.json`.
 */
export function lanesRegistryPath(env = process.env) {
  return join(resolveAekRoot(env), LANE_REGISTRY_FILENAME)
}

/**
 * Is the value a syntactically valid lane name (NOT a built-in slot)?
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLaneName(value) {
  return typeof value === 'string' && LANE_NAME_RE.test(value) && value !== 'aek' && value !== 'next'
}

/**
 * Read the registry (empty when the file is absent or corrupt — a corrupt
 * registry is a fresh start, never a crash; the lock keeps writers serial).
 * Cached per process, invalidated by mtime so sibling allocators see each
 * other within one process lifetime.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ version: number, lanes: Record<string, LaneEntry> }}
 */
export function readLanesRegistry(env = process.env) {
  const path = lanesRegistryPath(env)
  let mtime = -1
  let text = ''
  if (existsSync(path)) {
    mtime = statSync(path).mtimeMs
    text = readFileSync(path, 'utf8')
  }
  if (cache.registry && cache.mtime === mtime) return cache.registry
  let registry = { version: 1, lanes: {} }
  try {
    const parsed = JSON.parse(text || '{}')
    if (parsed && typeof parsed === 'object' && typeof parsed.lanes === 'object') registry = parsed
  } catch {
    registry = { version: 1, lanes: {} }
  }
  cache = { mtime, registry }
  return registry
}

/**
 * Run `fn` while holding the registry lock.
 *
 * The lock is a `mkdir` of `<container>/.lanes.lock.d` (atomic EEXIST). A
 * holder writes its pid into the dir; a stale lock (dead pid OR older than
 * {@link LANE_STALE_MS}) is stolen. The lock is released on every return path.
 * @template T
 * @param {(registry: { version: number, lanes: Record<string, LaneEntry> }) => T} fn
 * @param {Record<string, string | undefined>} [env]
 * @returns {T} whatever `fn` returns.
 * @throws {Error} when another LIVE agent holds the lock.
 */
export function withRegistryLock(fn, env = process.env) {
  const lockDir = join(resolveAekRoot(env), LANE_LOCK_DIRNAME)
  const pidFile = join(lockDir, 'pid')
  let stole = false
  try {
    try {
      mkdirSync(lockDir)
    } catch (err) {
      if (err && err.code !== 'EEXIST') throw err
      // Someone holds it. Steal only when the holder is dead or stale. A lock
      // dir WITHOUT a pid file is stealable immediately (crash mid-create).
      let holderPid = Number.NaN
      if (existsSync(pidFile)) holderPid = Number(readFileSync(pidFile, 'utf8').trim())
      let stale = !Number.isFinite(holderPid) || !isPidAlive(holderPid)
      if (!stale) {
        try {
          stale = Date.now() - statSync(pidFile).mtimeMs > LANE_STALE_MS
        } catch {
          /* no mtime = treat as live */
        }
      }
      if (!stale) {
        throw new Error(
          `lane registry lock is held by live pid ${holderPid}; another agent is allocating — try again shortly`
        )
      }
      rmSync(lockDir, { recursive: true, force: true })
      stole = true
      mkdirSync(lockDir)
    }
    writeFileSync(pidFile, String(process.pid))
    const registry = readLanesRegistry(env)
    const result = fn(registry)
    return result
  } finally {
    if (stole || existsSync(lockDir)) {
      // Only the creator (or a stealer) removes the dir; a plain holder that
      // found no stale holder is the `mkdirSync` success path above.
      rmSync(lockDir, { recursive: true, force: true })
    }
  }
}

/**
 * Persist a registry that `fn` modified (atomic write: tmp + rename).
 * @param {Record<string, LaneEntry>} lanes
 * @param {Record<string, string | undefined>} [env]
 */
function writeLanesRegistry(lanes, env = process.env) {
  const path = lanesRegistryPath(env)
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify({ version: 1, lanes }, null, 2) + '\n')
  renameSync(tmp, path)
  cache = { mtime: -1, registry: null }
}

/**
 * Is the value a lane registered in THIS machine's registry?
 * @param {unknown} value
 * @param {Record<string, string | undefined>} [env]
 * @returns {value is string}
 */
export function isLane(value, env = process.env) {
  if (!isLaneName(value)) return false
  return hasOwnProperty(readLanesRegistry(env).lanes, value)
}

/**
 * Allocate a fresh lane: pick the first pool pair no registered lane holds,
 * record it, return the entry.
 * @param {unknown} name - lane name.
 * @param {{ branch?: string, worktree?: string }} [opts]
 * @param {Record<string, string | undefined>} [env]
 * @returns {LaneEntry} the registered entry.
 * @throws {Error} on bad names, an already-registered name, or a full pool.
 */
export function allocateLane(name, opts = {}, env = process.env) {
  if (!isLaneName(name)) {
    throw new Error(`bad lane name ${String(name)}: kebab 1-12 chars, not 'aek'/'next'`)
  }
  let entry = /** @type {LaneEntry | undefined} */ (undefined)
  withRegistryLock((registry) => {
    if (hasOwnProperty(registry.lanes, name)) {
      throw new Error(`lane "${name}" is already registered (${registry.lanes[name].webPort}/${registry.lanes[name].cdpPort})`)
    }
    const taken = new Set(Object.values(registry.lanes).map((l) => l.webPort))
    const webPort = LANE_PORT_POOL.find((port) => !taken.has(port))
    if (webPort === undefined) {
      throw new Error(`lane port pool is full (${LANE_PORT_POOL.length} lanes); extend LANE_PORT_POOL after a cpuh range request`)
    }
    entry = {
      name,
      webPort,
      cdpPort: webPort + 1,
      branch: opts.branch ?? `lane/${name}`,
      ...(opts.worktree ? { worktree: opts.worktree } : {}),
      createdAt: new Date().toISOString(),
    }
    registry.lanes[name] = entry
    writeLanesRegistry(registry.lanes, env)
  })
  return /** @type {LaneEntry} */ (entry)
}

/**
 * Remove a lane from the registry (the caller owns the worktree / data root
 * teardown). No-op when unregistered.
 * @param {unknown} name
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean} true when the lane was registered and is now gone.
 */
export function releaseLane(name, env = process.env) {
  let gone = false
  withRegistryLock((registry) => {
    if (hasOwnProperty(registry.lanes, String(name))) {
      delete registry.lanes[String(name)]
      writeLanesRegistry(registry.lanes, env)
      gone = true
    }
  })
  return gone
}

/**
 * List registered lane names, pool order.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function listLanes(env = process.env) {
  const lanes = readLanesRegistry(env).lanes
  return Object.values(lanes)
    .sort((a, b) => a.webPort - b.webPort)
    .map((l) => l.name)
}

/**
 * Claim a lane for an agent (the anti-fight guarantee).
 *
 * Fails HARD when another live agent already claims the lane: the second
 * claimant must pick its own lane, never wrest the first one's ports, data
 * root or worktree. Steals dead claims (crashed agent).
 * @param {unknown} name - lane name.
 * @param {string} agentId - a stable, human-identifiable id for this agent.
 * @param {number} pid - the claiming process; liveness = the steal signal.
 * @param {Record<string, string | undefined>} [env]
 * @returns {LaneEntry} the entry, with its claim updated.
 * @throws {Error} when another LIVE agent holds the claim.
 */
export function claimLane(name, agentId, pid = process.pid, env = process.env) {
  if (!isLaneName(name)) throw new Error(`unknown lane ${String(name)}`)
  let entry = /** @type {LaneEntry | undefined} */ (undefined)
  withRegistryLock((registry) => {
    const current = /** @type {LaneEntry | undefined} */ (registry.lanes[String(name)])
    if (!current) throw new Error(`lane "${name}" is not registered; run the lane allocation first`)
    const claim = current.claim
    if (claim && claim.agentId !== agentId && isPidAlive(claim.pid)) {
      throw new Error(
        `lane "${name}" is claimed by agent "${claim.agentId}" (pid ${claim.pid}, since ${claim.startedAt}); ` +
          `parallel agents must use SEPARATE lanes`
      )
    }
    current.claim = { agentId: String(agentId), pid: Number(pid), startedAt: new Date().toISOString() }
    registry.lanes[String(name)] = current
    writeLanesRegistry(registry.lanes, env)
    entry = current
  })
  return /** @type {LaneEntry} */ (entry)
}

/**
 * Drop this agent's claim. Refuses to drop another live agent's claim.
 * @param {unknown} name
 * @param {string} agentId
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean} true when a claim of THIS agent was removed.
 */
export function unclaimLane(name, agentId, env = process.env) {
  let dropped = false
  withRegistryLock((registry) => {
    const current = /** @type {LaneEntry | undefined} */ (registry.lanes[String(name)])
    if (!current) return
    const claim = current.claim
    if (claim && claim.agentId === agentId) {
      delete current.claim
      registry.lanes[String(name)] = current
      writeLanesRegistry(registry.lanes, env)
      dropped = true
    } else if (claim && claim.agentId !== agentId && isPidAlive(claim.pid)) {
      throw new Error(`lane "${name}" is claimed by another live agent; only it may unclaim`)
    }
  })
  return dropped
}

/**
 * Descriptor of a registered lane, in the exact shape of the `SLOTS` table
 * (so every slot consumer — builder config, desktop main, dev tools — treats
 * a lane like a slot).
 * @param {unknown} name
 * @returns {object}
 * @throws {Error} when the lane is not registered.
 */
export function laneConfig(name) {
  const entry = readLanesRegistry().lanes[String(name)]
  if (!entry) throw new Error(`lane ${String(name)} is not registered`)
  const slug = String(name)
  const display = `AEK ${slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')}`
  return {
    slot: slug,
    appId: `com.aek.desktop.lane.${slug}`,
    bundleId: `com.aek.desktop.lane.${slug}`,
    productName: display,
    devAppName: display,
    legacyDevAppNames: [],
    webPort: entry.webPort,
    cdpPort: entry.cdpPort,
    // RFC 6761: any `*.localhost` resolves to loopback on the OS and in
    // Chromium (verified: no /etc/hosts entries exist for the built-in slots
    // either). A distinct host keeps Chromium's per-site zoom isolated — the
    // same rule the built-in `aek.localhost` / `aek-next.localhost` follow.
    webHost: `aek-${slug}.localhost`,
  }
}

/**
 * Data root of a lane: `<container>/lanes/<name>` (its own `aek.yaml` manifest
 * lives inside, mirroring the built-in slots' dir table).
 * @param {unknown} name
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function laneHome(name, env = process.env) {
  if (!isLaneName(name)) throw new Error(`bad lane name ${String(name)}`)
  return join(resolveAekRoot(env), 'lanes', String(name))
}

/** Has own property, prototype-safe. @param {object} obj @param {PropertyKey} key */
function hasOwnProperty(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}
