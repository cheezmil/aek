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
  languages: LanguageScan
  description: string
}

/** Read `aek.distribution` from a parsed package.json. */
export declare function pluginClassOf(manifest: Record<string, unknown>): PluginClass

/** Friendly, actionable explanation of a bad declaration. */
export declare function classViolationMessage(result: PluginClass, packageName: string): string

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
