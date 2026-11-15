/**
 * Type declarations for `@cheezmil/coraek/runtimes` (the numbered coraek
 * runtime view + memory readings; X2: multi-tenant runtime containers).
 *
 * @module @cheezmil/coraek/runtimes
 */

/** The store document version written by this module. */
export declare const RUNTIMES_STORE_VERSION: number

/** The live runtime-mode store document (X2 v2 multi-tenant shape). */
export interface RuntimeDoc {
  /** Capability id → selective mode choice. */
  modes: Record<string, 'share' | 'isolate'>
  /** Capability id → RUNTIME container it lives in (absent = the shared host). */
  assignments: Record<string, string>
  /** RUNTIME id → operator label (`runtime0` = the host row). */
  labels: Record<string, string>
  /** RUNTIME id → explicitly created container (empty until a plugin moves in). */
  containers: Record<string, true>
}

/** Read the full runtime document from `<home>/runtime-modes.json`. */
export declare function readRuntimeDoc(aekHome: string): RuntimeDoc

/** Persist one RUNTIME operator label (the rest of the document is kept). */
export declare function writeRuntimeLabel(
  aekHome: string,
  id: string,
  label: string,
): { ok: boolean; problems: string[] }

/** One live memory reading, in bytes. */
export interface ProcessMemory {
  /** OS-resident total, bytes. */
  rss: number
  /** V8 in-use heap, bytes. */
  heapUsed: number
  /** V8 total heap, bytes. */
  heapTotal: number
}

/** The LIVE memory of the host process (runtime 0). */
export declare function hostMemory(): ProcessMemory

/**
 * The RSS (bytes) of one external process, or `undefined` when the pid is
 * dead / unreadable (the UI renders "—"; numbers are never invented).
 */
export declare function processRss(pid: number): number | undefined

/** A discovered capability package (the `runtime.mjs` discovery shape). */
export interface RuntimePackage {
  /** Capability id. */
  id: string
  /** Its package.json. */
  manifest: Record<string, unknown>
  /** The package directory. */
  packageDir?: string
  /** The user's bucket (coraek-plugins / public / base / target-extensions). */
  bucket?: string
}

/** One live supervisor state row (the `external-supervisor` shape). */
export interface SupervisorRow {
  /** The provider key — a RUNTIME id under v2 (a capability id pre-migration). */
  id: string
  /** `running` / `stopped` / ... */
  state: string
  /** The child pid while running. */
  pid?: number
}

/** One runtime row in the numbered view (X2: 0-based, multi-tenant). */
export interface RuntimeRow {
  /** The runtime id (`runtime0` = the host row). */
  id: string
  /** 0-based position (`runtime0` = 0). */
  number: number
  /** `host` (the shared runtime) or `isolated` (a runtime container). */
  kind: 'host' | 'isolated'
  /** Display name (the operator label or the runtime id). */
  label: string
  /** `running` / `stopped`. */
  state: 'running' | 'stopped'
  /** The owning process pid. */
  pid: number | null
  /**
   * Live memory reading: the host carries rss + heap; an isolated runtime
   * carries its whole-process RSS when readable, else `undefined`.
   */
  memory: Partial<ProcessMemory> | undefined
  /** How the number was measured (never an invented split). */
  memoryCaliber: 'process' | 'process-rss'
  /** The capabilities (plugins) living in this runtime. */
  plugins: string[]
}

/** The per-plugin memory view. */
export interface PluginMemoryEntry {
  /** The reading in bytes, `undefined` when not metered individually. */
  value?: number
  /** Always `bytes`. */
  unit: 'bytes'
  /**
   * `process-rss` = the runtime container's process reading;
   * `in-host-shared` = counted toward the host total, not split per module.
   */
  caliber: 'process-rss' | 'in-host-shared'
  /** The RUNTIME container the plugin lives in (isolated entries only). */
  runtimeId?: string
  /** The user's bucket (the roster grouping). */
  bucket?: string
}

/** The complete numbered runtime snapshot. */
export interface RuntimesSnapshot {
  /** Runtime 0: the shared host runtime. */
  host: RuntimeRow
  /** Runtimes 1..N: the isolated runtime containers. */
  runtimes: RuntimeRow[]
  /** Capabilities that support `isolate` but currently share (add candidates). */
  isolatable: string[]
  /** The host's process.platform. */
  platform?: string
  /** The per-plugin memory view (one row per discovered capability). */
  pluginMemory: Record<string, PluginMemoryEntry>
}

/**
 * Assemble the numbered runtime snapshot.
 * @param input.aekHome - the runtime-mode store root.
 * @param input.packages - discovered capability packages.
 * @param input.supervisorRows - live supervisor state rows (keyed by RUNTIME id under v2).
 */
export declare function runtimesSnapshot(input: {
  aekHome: string
  packages: RuntimePackage[]
  supervisorRows: SupervisorRow[]
}): RuntimesSnapshot

/** The desired file bytes of one migration write. */
export interface RuntimesV2Write {
  /** Absolute target path. */
  file: string
  /** The file's current bytes (null when the file does not exist yet). */
  before: string | null
  /** The desired bytes. */
  after: string
  /** The operator-facing reason line. */
  reason: string
}

/**
 * Schema step 4 (X2): rewrite a pre-v2 `runtime-modes.json` into the v2
 * multi-tenant document AND re-key the `capabilities.json` provider rows
 * onto their runtimes — pure, idempotent, returns the desired writes.
 *
 * @param input.runtimeModesText - the current `runtime-modes.json` bytes (null when absent).
 * @param input.runtimeModesPath - its absolute path.
 * @param input.capabilitiesText - the current `capabilities.json` bytes (null when absent).
 * @param input.capabilitiesPath - its absolute path.
 */
export declare function runtimesV2MigrationWrites(input: {
  runtimeModesText: string | null
  runtimeModesPath: string
  capabilitiesText: string | null
  capabilitiesPath: string
}): RuntimesV2Write[]
