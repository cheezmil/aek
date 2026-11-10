/** Type surface for the dependency-free `@cheezmil/coraek/paths` subpath. */

export declare const AEK_MANIFEST_FILENAME: 'aek.yaml'
export declare const AEK_MANIFEST_VERSION: 1
export declare const DEFAULT_SLOT_DIRS: Readonly<Record<'aek' | 'next', string>>
export declare const DEFAULT_BACKUPS_DIR: string
export declare const DEFAULT_DIRS: Readonly<Record<string, string>>

export interface AekManifest {
  /** Absolute path of the manifest file. */
  readonly file: string
  /** Directory the manifest was found in. */
  readonly container: string
  /** Schema version this module applied. */
  readonly version: number
  /** Absolute base every relative path in the file is resolved against. */
  readonly root: string
  /** Absolute data root per slot. */
  readonly slots: Readonly<Record<'aek' | 'next', string>>
  /** Absolute path of the backups directory. */
  readonly backups: string
  /** Folder name inside a slot → path (relative to the slot root unless absolute). */
  readonly dirs: Readonly<Record<string, string>>
  /** Non-fatal problems found while reading. */
  readonly warnings: readonly string[]
}

/** Expand `~` and resolve a manifest value against a base directory. */
export declare function resolveManifestPath(base: string, value: unknown): string

/**
 * Parse the YAML subset the manifest uses (nested maps, scalars, comments,
 * simple lists). A file starting with `{` is parsed as JSON instead.
 */
export declare function parseYamlSubset(
  text: string,
  file?: string,
): Record<string, unknown>

/** Read (and mtime-cache) `<container>/aek.yaml`; null when absent. */
export declare function readAekManifest(container: string): AekManifest | null

/** Manifest that declares the given data root as one of its slots, if any. */
export declare function findManifestFor(home: string): AekManifest | null

/** Container that a given data root lives in (manifest first, then the name). */
export declare function containerOf(home: string): string

/** Manifest governing a data root: the one claiming it, else its container's. */
export declare function manifestFor(home: string): AekManifest | null

/** Resolve a named folder inside a slot, honouring absolute overrides. */
export declare function resolveDir(
  dirs: Record<string, string>,
  home: string,
  name: string,
): string

/**
 * Render the default manifest text.
 *
 * The output contains no absolute path: it is generated on every platform and
 * must read identically for every user.
 */
export declare function renderManifest(): string

/** Write the default manifest into a container when it is missing. */
export declare function writeDefaultManifest(
  container: string,
  options?: { force?: boolean },
): { file: string; written: boolean }
