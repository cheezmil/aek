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
