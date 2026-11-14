/**
 * Type declarations for `@cheezmil/coraek/runtimes` (the numbered coraek
 * runtime view + memory readings, S round).
 *
 * @module @cheezmil/coraek/runtimes
 */

/** The store document version written by this module. */
export declare const RUNTIMES_STORE_VERSION: number

/** The live runtime-mode store document. */
export interface RuntimeDoc {
  /** Capability id → selective mode choice. */
  modes: Record<string, 'share' | 'isolate'>
  /** Capability id → operator label (empty = the id itself is the label). */
  labels: Record<string, string>
}

/** Read the full runtime-modes document from `<home>/runtime-modes.json`. */
export declare function readRuntimeDoc(aekHome: string): RuntimeDoc

/** Persist one operator label (the `modes` map is preserved verbatim). */
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

/** The LIVE memory of the host process (runtime 1). */
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
}

/** One live supervisor state row (the `external-supervisor` shape). */
export interface SupervisorRow {
  /** Capability id. */
  id: string
  /** `running` / `stopped` / ... */
  state: string
  /** The child pid while running. */
  pid?: number
}

/** One runtime row in the numbered view. */
export interface RuntimeRow {
  /** Capability id (`undefined` for the host row). */
  id?: string
  /** 1-based position in the numbered list (the host is always 1). */
  number: number
  /** `host` (the shared runtime) or `isolated` (a capability process). */
  kind: 'host' | 'isolated'
  /** Display name (the operator label or the id). */
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
   * `process-rss` = the capability's own process reading;
   * `in-host-shared` = counted toward the host total, not split per module.
   */
  caliber: 'process-rss' | 'in-host-shared'
}

/** The complete numbered runtime snapshot. */
export interface RuntimesSnapshot {
  /** Runtime 1: the shared host runtime. */
  host: RuntimeRow
  /** Runtimes 2..N: the isolated capability processes. */
  runtimes: RuntimeRow[]
  /** Capabilities that support `isolate` but currently share (add candidates). */
  isolatable: string[]
  /** The per-plugin memory view (one row per discovered capability). */
  pluginMemory: Record<string, PluginMemoryEntry>
}

/**
 * Assemble the numbered runtime snapshot.
 * @param input.aekHome - the runtime-mode store root.
 * @param input.packages - discovered capability packages.
 * @param input.supervisorRows - live supervisor state rows.
 */
export declare function runtimesSnapshot(input: {
  aekHome: string
  packages: RuntimePackage[]
  supervisorRows: SupervisorRow[]
}): RuntimesSnapshot
