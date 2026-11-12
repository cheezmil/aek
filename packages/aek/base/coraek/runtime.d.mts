/** The only two runtime topologies a capability can run in. */
export declare const RUNTIME_MODES: readonly ['share', 'isolate']

/** Reason codes for why a capability runs in a given mode. */
export declare const REASONS: readonly [
  'license-forced',
  'runtime-forced',
  'user-select',
  'default-share',
]

/** Whether an SPDX expression looks like a strong-copyleft license. */
export declare function isStrongCopyleft(spdx: unknown): boolean

/** Whether a parsed `package.json` carries the `aek.external` wrapper block. */
export declare function hasExternalManifest(manifest: unknown): boolean

/** Which topologies a capability supports (class ① vs external wrapper). */
export interface EffectiveModes {
  canShare: boolean
  canIsolate: boolean
}

/** @param manifest - a parsed `package.json`. */
export declare function effectiveModes(manifest: unknown): EffectiveModes

export interface RuntimeModeInput {
  /** Parsed `package.json` of the capability. */
  manifest?: unknown
  /** The user's stored selective choice (`'share' | 'isolate'` or undefined). */
  storedMode?: string
}

export type RuntimeReason = (typeof REASONS)[number]

export interface ResolvedRuntimeMode {
  mode: 'share' | 'isolate'
  forced: boolean
  reason: RuntimeReason
}

/** Pure decision: no I/O, no spawn. */
export declare function resolveRuntimeMode(input: RuntimeModeInput): ResolvedRuntimeMode

/** Absolute path of the user's runtime-mode store (derived, never hardcoded). */
export declare function runtimeModesPath(aekHome: string): string

/** Stored choices; a missing / corrupt store is `{}`, not an error. */
export declare function readRuntimeModes(aekHome: string): Record<string, 'share' | 'isolate'>

export interface WriteResult {
  ok: boolean
  problems: string[]
}

/** Persist one capability's selective choice (atomic). Validates the value. */
export declare function writeRuntimeMode(
  aekHome: string,
  id: string,
  mode: 'share' | 'isolate',
): WriteResult

/** One installed AEK capability package discovered as a sibling of the host. */
export interface DiscoveredAekPackage {
  /** The capability id (the package dir name, e.g. `aek-websearch`). */
  id: string
  /** The parsed `package.json`. */
  manifest: Record<string, unknown>
  /** Absolute directory of the installed package (dev link or npm copy). */
  packageDir: string
}

/**
 * Discover installed AEK capability packages: the `@cheezmil` install scope
 * two levels above the running coraek host module, merged with the dev repo
 * layout (`packages/aek/**` below the working directory). No hardcoded
 * absolute paths — both are derived at call time.
 * @param fromUrl - the compiled coraek host module's `import.meta.url`.
 * @param cwd - working directory for the dev layout.
 * @defaultValue `process.cwd()`
 */
export declare function discoverAekSiblingPackages(fromUrl: string, cwd?: string): DiscoveredAekPackage[]

/** The supervisor surface the boot switch needs (structural, zero-dependency). */
export interface RuntimeBootSupervisor {
  register: (
    id: string,
    declared: unknown,
  ) => Promise<{ ok: boolean; problems: string[] }>
  start: (id: string) => Promise<{ ok: boolean; state?: string; problem?: string }>
}

export interface RuntimeBootInput {
  /** The supervisor that owns the spawned children. */
  supervisor: RuntimeBootSupervisor
  /** The AEK home that holds the runtime-mode store. */
  aekHome: string
  /**
   * The discovered packages; omit for the host's own sibling discovery.
   * @defaultValue `[]`
   */
  packages?: DiscoveredAekPackage[]
}

export interface RuntimeBootResult {
  ok: boolean
  state?: string
  problem?: string
}

/**
 * The boot-time switch: for every class ① capability whose STORED mode is
 * `isolate`, register its spawnable entry under the supervisor and start it.
 * Best-effort: per-id failures are recorded, never fatal to host boot.
 */
export declare function bootIsolateRuntimePackages(
  input: RuntimeBootInput,
): Promise<Record<string, RuntimeBootResult>>
