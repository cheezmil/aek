/** Audience classes an AEK package may declare. */
export declare const PLUGIN_CLASSES: readonly ['A1', 'A2']

/** Manifest key holding the audience class (`aek.distribution`). */
export declare const DISTRIBUTION_KEY: 'distribution'

/** Human-readable meaning of each class. */
export declare const CLASS_LABELS: Readonly<Record<'A1' | 'A2', string>>

export interface LanguageScan {
  /** Every detected language, ordered by source-file count descending. */
  languages: string[]
  /** Main implementation language (styling/markup languages are skipped). */
  primary: string
  /** Number of source files counted. */
  files: number
  /** True when the file cap was reached. */
  truncated: boolean
}

export interface PluginClass {
  /** Declared class; empty when absent or illegal. */
  value: 'A1' | 'A2' | string
  /** Whether the declaration is legal. */
  ok: boolean
  /** Why it is not ok. */
  reason: 'missing' | 'invalid' | ''
}

export interface PluginMeta {
  id: string
  /** Repository-relative package directory, posix separators. */
  dir: string
  packageName: string
  version: string
  private: boolean
  distribution: PluginClass
  /** The `aek.external` block; absent when the package declares none. */
  external?: ExternalMeta
  languages: LanguageScan
  description: string
}

/**
 * Validated view of an `aek.external` block: a package marked as a thin
 * wrapper around an EXTERNAL capability provider. Wrappers may only reach
 * their provider out-of-process, so the block enforces the structural half
 * of the license boundary in the manifest (required `spdx`, whitelisted
 * `attach.kind`, no in-process `main` / `exports["."]` entries).
 */
export interface ExternalMeta {
  /** Absent block, or a fully legal block. */
  ok: boolean
  /** The block, `null` when absent. */
  value: Record<string, unknown> | null
  /** Deterministic, human-readable problems. */
  problems: string[]
}

/** Read `aek.distribution` from a parsed package.json. */
export declare function pluginClassOf(manifest: Record<string, unknown>): PluginClass

/** Friendly, actionable explanation of a bad declaration. */
export declare function classViolationMessage(result: PluginClass, packageName: string): string

/** Read and validate the `aek.external` block (optional marker). */
export declare function externalMetaOf(manifest: Record<string, unknown>): ExternalMeta

/** One actionable line per problem of a bad `aek.external` block. */
export declare function externalViolationMessages(result: ExternalMeta, packageName: string): string[]

/** Assert the external-wrapper rule for the whole tree. */
export declare function checkExternalPackages(repoRoot: string): {
  ok: boolean
  violations: string[]
  packages: PluginMeta[]
}

/**
 * Detect implementation languages by directory entries and extensions only.
 * Never opens a source file; bounded by a file/depth cap and a 60s cache.
 */
export declare function scanLanguages(
  packageDir: string,
  options?: { now?: number },
): LanguageScan

/** Forget cached language scans. */
export declare function clearLanguageCache(): void

/** Walk `packages/aek/**` for package directories (bounded, skips build output). */
export declare function findAekPackageDirs(repoRoot: string): string[]

/** Read every AEK package's classification and languages. */
export declare function readPluginMeta(
  repoRoot: string,
  options?: { now?: number; languages?: boolean },
): PluginMeta[]

/** Assert every AEK package declares a legal class. */
export declare function checkPluginClasses(repoRoot: string): {
  ok: boolean
  violations: string[]
  packages: PluginMeta[]
}

/** Packages a publish path may include: A1, declared, and not private. */
export declare function publishablePlugins(repoRoot: string): PluginMeta[]
