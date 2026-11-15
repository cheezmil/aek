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

/** Whether a capability is AUTOMATICALLY isolatable (JS part or custom bin, not the host itself). */
export declare function isAutoIsolatable(
  manifest: unknown,
  packageDir?: string,
  hostDir?: string,
): boolean

/** The coraek package's own directory (the generic-runner default cwd). */
export declare function hostPackageDir(): string

/** The coraek generic isolate runner's absolute bin path. */
export declare function genericIsolateBin(): string

/**
 * Resolve what to SPAWN for one capability: the declared custom bin when the
 * manifest supplies one, else the coraek generic runner.
 */
export declare function resolveIsolateAttach(input: {
  id: string
  manifest?: unknown
  packageDir?: string
}): { command: string; args: string[]; cwd?: string; custom: boolean }

/** The v2 runtime store document version (X2: `assignments` + `containers`). */
export declare const RUNTIME_DOC_VERSION: number

/** The full v2 runtime document (`modes` + `assignments` + `labels` + `containers`). */
export interface RuntimeDocV2 {
  version: number
  modes: Record<string, 'share' | 'isolate'>
  /** Capability id → runtime id it lives in. */
  assignments: Record<string, string>
  /** Runtime id → operator label (`runtime0` = the host row). */
  labels: Record<string, string>
  /** Runtime id → explicitly created container. */
  containers: Record<string, true>
}

/** Read the full v2 runtime document; a missing / corrupt store is fresh-install shape. */
export declare function readRuntimeDocV2(aekHome: string): RuntimeDocV2

/** Persist one full v2 runtime document (atomic). */
export declare function writeRuntimeDocV2(
  aekHome: string,
  doc: Omit<RuntimeDocV2, 'version'>,
): WriteResult

/** The numeric part of a `runtime{n}` id (non-conforming ids sort last). */
export declare function runtimeNumber(runtimeId: string): number

/** The next free numeric runtime id for a document. */
export declare function nextRuntimeId(doc: Pick<RuntimeDocV2, 'assignments' | 'labels' | 'containers'>): string

/** The declared custom isolate bin of one manifest, or `undefined`. */
export declare function customIsolateBinOf(manifest: unknown): string | undefined

/** Create a NEW runtime container (possibly empty); the label is optional (blank = auto-number). */
export declare function createRuntime(
  aekHome: string,
  label?: string,
): { ok: boolean; runtimeId?: string; problems?: string[] }

/**
 * Move ONE capability to a runtime container (`runtime0` = the shared host).
 * Enforces the custom-bin exclusivity rule: a custom-bin capability owns its
 * whole process and shares a container with nobody.
 */
export declare function moveCapability(
  aekHome: string,
  capability: string,
  target: string,
  input?: {
    pkg?: { manifest?: unknown; packageDir?: string } | undefined
    targetMembers?: Array<{ id: string; manifest?: unknown }> | undefined
  } | undefined,
): { ok: boolean; runtimeId: string; problems?: string[] }

/** Delete a runtime container: members go back to the shared host (the caller stops the process). */
export declare function removeRuntime(
  aekHome: string,
  runtimeId: string,
): { ok: boolean; movedToHost: string[]; problems?: string[] }

/** The effective capability → runtime table (stored wins; legacy isolates auto-number). */
export declare function effectiveAssignments(
  doc: Pick<RuntimeDocV2, 'modes' | 'assignments' | 'containers'>,
  packages: Array<{ id: string; manifest: Record<string, unknown> }>,
): Map<string, string>

/** One runtime container group (X2: several capabilities per process). */
export interface RuntimeGroup {
  label: string
  number: number
  members: Array<{ id: string; manifest: Record<string, unknown>; packageDir?: string }>
  /** An explicitly created container (counts even when empty). */
  explicit: boolean
}

/** Group the stored-`isolate` capabilities into runtime containers (pure). */
export declare function runtimeGroups(
  doc: Pick<RuntimeDocV2, 'modes' | 'assignments' | 'labels' | 'containers'>,
  packages: Array<{ id: string; manifest: Record<string, unknown>; packageDir?: string }>,
): Map<string, RuntimeGroup>

/** Resolve what to spawn for ONE container (custom-bin solo member, else the generic runner). */
export declare function resolveRuntimeGroupAttach(input: {
  runtimeId: string
  label?: string
  members: Array<{ id: string; manifest: Record<string, unknown>; packageDir?: string }>
}): { command: string; args: string[]; cwd?: string; custom: boolean; descriptor: Record<string, unknown> }

/** The live-supervisor surface the add / move / remove paths need. */
export interface RuntimeGroupSupervisor {
  register: (
    id: string,
    declared: unknown,
    extra?: { pin?: string; installPolicy?: 'self' | 'managed' },
  ) => Promise<{ ok: boolean; problems: string[] }>
  start: (id: string) => Promise<{ ok: boolean; state?: string; problem?: string }>
  stop?: (id: string) => Promise<{ ok: boolean; problem?: string }>
  unregister?: (id: string) => Promise<{ ok: boolean }>
  list?: () => Promise<Record<string, unknown>>
}

export interface RuntimeGroupInput {
  supervisor: RuntimeGroupSupervisor
  aekHome: string
  packages?: Array<{ id: string; manifest: Record<string, unknown>; packageDir?: string }>
  /** The runtime container id. */
  runtimeId: string
}

export interface RuntimeGroupResult {
  ok: boolean
  runtimeId: string
  state?: string
  problem?: string
  members?: string[]
}

/** Register + start ONE container's process live (the X2 console add / move path). */
export declare function startRuntimeGroup(input: RuntimeGroupInput): Promise<RuntimeGroupResult>

/** Stop one container's process (the X2 console remove path). */
export declare function stopRuntimeGroup(input: Omit<RuntimeGroupInput, 'packages'>): Promise<RuntimeGroupResult>

export interface RuntimeBootInput {
  /** The supervisor that owns the spawned children. */
  supervisor: RuntimeGroupSupervisor
  /** The AEK home that holds the runtime-mode store. */
  aekHome: string
  /**
   * The discovered packages; omit for the host's own sibling discovery.
   * @defaultValue `[]`
   */
  packages?: Array<{ id: string; manifest: Record<string, unknown>; packageDir?: string }>
}

export interface RuntimeBootResult {
  ok: boolean
  state?: string
  problem?: string
}

/**
 * The boot-time switch for the X2 runtime model: group every stored-`isolate`
 * capability into its container and register + start each group; prunes the
 * stale capability-keyed v1 provider rows. Best-effort, never fatal.
 */
export declare function bootIsolateRuntimePackages(
  input: RuntimeBootInput,
): Promise<Record<string, RuntimeBootResult & { members?: string[] }>>
