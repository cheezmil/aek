import type { CapabilityDescriptor, ValidationResult } from '@cheezmil/coraek/external'

/** SIGTERM grace before we give up on a child we spawned. */
export declare const STOP_GRACE_MS: number
/** Health-ping deadline. */
export declare const PING_TIMEOUT_MS: number
/** `--describe` probe deadline. */
export declare const DESCRIBE_TIMEOUT_MS: number

export interface ProviderEntry {
  /** The pinned self-description. */
  declared: CapabilityDescriptor
  /** Version the user pinned. */
  pin?: string
  /**
   * `self`: the user installed it (zero host obligation). `managed`:
   * host-distributed (the host then renders the GPLv3 §6 source pointer
   * from `declared.source`).
   */
  installPolicy?: 'self' | 'managed'
  state: 'absent' | 'stopped' | 'running' | 'failed'
  /** Present only while the supervisor spawned it. */
  pid?: number
  /** Attached instances are `external`: reported, never killed by the host. */
  startedBy?: 'supervisor' | 'external'
  updatedAt?: string
}

export interface ProviderOptions {
  /** Env used to resolve the AEK home. */
  env?: NodeJS.ProcessEnv
  /** Explicit home override (tests). */
  aekHome?: string
}

/**
 * Lifecycle owner for external capability providers — separate processes
 * that AEK talks to over standard protocols. The host never imports, links,
 * or vendors provider code; it only spawns / connects per the provider's
 * `attach` block and renders provider-asserted metadata (spdx / source).
 *
 * All shared state lives on the instance; the module holds no singleton.
 */
export declare class CapabilitySupervisor {
  constructor(options?: ProviderOptions)

  /** Absolute path of the state store (`<AEK_HOME>/capabilities.json`). */
  storePath(): string

  /** Read the registry; a missing store is an empty registry. */
  list(): Promise<Record<string, ProviderEntry>>

  /** Write the registry atomically (tmp + rename). */
  writeStore(providers: Record<string, ProviderEntry>): void

  /**
   * Register (or re-pin) a provider from a descriptor. WRITE operation —
   * gate behind explicit confirmation in operator tools.
   */
  register(id: string, declaredRaw: unknown, extra?: { pin?: string, installPolicy?: 'self' | 'managed' }): Promise<{ ok: boolean, problems: string[] }>

  /** Remove a provider. WRITE operation. Stops a live child first. */
  unregister(id: string): Promise<{ ok: boolean, problems: string[] }>

  /** Whether a pid still belongs to a live process. */
  static isPidAlive(pid: number): boolean

  /** Liveness-correct view of one provider (stale `running` → `stopped`). */
  status(id: string): Promise<ProviderEntry | null>

  /** All providers, liveness-corrected, in id order. */
  statusAll(): Promise<(ProviderEntry & { id: string })[]>

  /**
   * Bring a provider up: `attach.endpoint` → connect only (single-instance
   * guard); otherwise spawn `attach.command` (no shell, argv array).
   * Idempotent: a live provider returns immediately.
   */
  start(id: string): Promise<{ ok: boolean, state: string, problem?: string }>

  /**
   * Stop a provider WE spawned: SIGTERM, bounded wait, never escalates to
   * SIGKILL. Attached (foreign) instances are reported, never touched.
   */
  stop(id: string): Promise<{ ok: boolean, state: string, problem?: string }>

  /**
   * Synchronous last line of defense at host disposal: signal every child
   * held in memory now (disposal effects may not await).
   */
  stopAllNow(): void

  /** Host-shutdown hook: stop every spawned child so no orphan survives. */
  disposeAll(): Promise<string[]>

  /**
   * Live self-description via the provider's surface (MCP `initialize`,
   * `aek.describe`, HTTP well-known, CLI `--describe`); falls back to the
   * declared entry, reported via `source`.
   */
  describe(id: string): Promise<ValidationResult & { source: 'live' | 'declared', id: string }>

  /** Read-only health: does the provider answer on its surface? */
  health(id: string): Promise<{ ok: boolean, healthy: boolean, detail: string, id: string }>

  /** Absolute path of the provider's log file. */
  logPath(id: string): string

  /**
   * Render the compliance line for one entry: fixed template in the host,
   * provider-asserted data (nothing upstream-specific known here).
   */
  static complianceLine(entry: ProviderEntry): string
}

/** Unused type re-exports kept for consumer-side typing. */
export type { CapabilityAttach, ProviderEntry as ProviderEntryShape }
