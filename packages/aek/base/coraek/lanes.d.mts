/**
 * Type surface for the dependency-free `@cheezmil/coraek/lanes` subpath.
 *
 * Lanes are dynamic, agent-allocated slots: the open-ended third-and-beyond
 * tier that lets many agents run parallel dev cycles (own worktree, data root,
 * port pair, CDP port) without stepping on the built-in `aek` / `next` slots.
 * See `lanes.mjs` for the registry + claim protocol.
 */

/** Registry file name, inside the shared container (`~/.aek`). */
export declare const LANE_REGISTRY_FILENAME: 'lanes.json'
/** Lock dir name, inside the shared container. */
export declare const LANE_LOCK_DIRNAME: string
/** A claim whose pid is dead AND older than this is stealable. */
export declare const LANE_STALE_MS: number
/**
 * Lane web-port pool; each lane owns the pair `<port>, <port + 1>` (web + CDP).
 * cpuh-allocated range for this project. Extend here (plus a cpuh range
 * request) to admit more lanes.
 */
export declare const LANE_PORT_POOL: readonly number[]

/** A single claim on a lane: one live agent at a time. */
export interface LaneClaim {
  /** A stable, human-identifiable id for the claiming agent. */
  readonly agentId: string
  /** The claiming process; liveness is the steal signal. */
  readonly pid: number
  readonly startedAt: string
}

/** One registered lane. */
export interface LaneEntry {
  readonly name: string
  /** Web backend port. */
  readonly webPort: number
  /** Remote-debugging (CDP) port, `webPort + 1`. */
  readonly cdpPort: number
  /** Git branch the lane's worktree checks out. */
  readonly branch: string
  /** Worktree path, when recorded at allocation time. */
  readonly worktree?: string
  readonly createdAt?: string
  /** The live agent claim, when one exists. */
  readonly claim?: LaneClaim
}

/** @param value - candidate name. */
export declare function isLaneName(value: unknown): value is string
/** @param value - candidate name. @param env - environment override. */
export declare function isLane(value: unknown, env?: Record<string, string | undefined>): value is string
/** @param env - environment override. */
export declare function lanesRegistryPath(env?: Record<string, string | undefined>): string
/**
 * Read the registry (empty when absent/corrupt). Cached per process,
 * mtime-invalidated.
 * @param env - environment override.
 */
export declare function readLanesRegistry(
  env?: Record<string, string | undefined>,
): { version: number; lanes: Record<string, LaneEntry> }
/**
 * Run `fn` while holding the atomic mkdir registry lock. Steals locks whose
 * holder pid is dead or older than `LANE_STALE_MS`.
 * @template T
 * @param fn - runs with exclusive access to the registry.
 * @param env - environment override.
 * @throws When another live agent holds the lock.
 */
export declare function withRegistryLock<T>(
  fn: (registry: { version: number; lanes: Record<string, LaneEntry> }) => T,
  env?: Record<string, string | undefined>,
): T
/**
 * Allocate a fresh lane: first free pool pair, registered under `name`.
 * @param name - lane name (kebab 1-12, not `aek`/`next`).
 * @param opts - branch / worktree hints.
 * @param env - environment override.
 * @throws On bad names, an already-registered name, or a full pool.
 */
export declare function allocateLane(
  name: unknown,
  opts?: { branch?: string; worktree?: string },
  env?: Record<string, string | undefined>,
): LaneEntry
/** Remove a lane from the registry. @returns true when it was registered. */
export declare function releaseLane(name: unknown, env?: Record<string, string | undefined>): boolean
/** Registered lane names in pool order. */
export declare function listLanes(env?: Record<string, string | undefined>): string[]
/**
 * Claim a lane for an agent; hard-fails when another live agent holds it.
 * @param name - lane name. @param agentId - stable id. @param pid - claiming pid.
 * @throws When another live agent holds the claim.
 */
export declare function claimLane(
  name: unknown,
  agentId: string,
  pid?: number,
  env?: Record<string, string | undefined>,
): LaneEntry
/** Drop this agent's claim; refuses another live agent's claim. */
export declare function unclaimLane(
  name: unknown,
  agentId: string,
  env?: Record<string, string | undefined>,
): boolean
/**
 * Descriptor of a registered lane, shaped exactly like the `SLOTS` table so
 * every slot consumer treats a lane like a slot.
 * @throws When the lane is not registered.
 */
export declare function laneConfig(name: unknown): object
/** Data root of a lane: `<container>/lanes/<name>`. */
export declare function laneHome(name: unknown, env?: Record<string, string | undefined>): string
