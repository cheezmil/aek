/** Type surface for the dependency-free `@cheezmil/coraek/backups` subpath. */

export declare const DEFAULT_KEEP: number

/** `^\d{8}(\d{6}|-\d{6})?-` — the provenance prefix on every snapshot folder. */
export declare const SNAPSHOT_NAME: RegExp

/** `YYYYMMDD-HHMMSS`, the prefix every snapshot folder starts with. */
export declare function snapshotStamp(date?: Date): string

export interface BackupRow {
  name: string
  path: string
  mtimeMs: number
}

/** Snapshot directories in `dir`, newest first. Non-snapshot entries are skipped. */
export declare function listBackups(dir: string): BackupRow[]

export interface PruneOptions {
  /** How many to keep (newest first). Defaults to `DEFAULT_KEEP`. */
  keep?: number
  /** Absolute paths never deleted, even outside the newest `keep`. */
  protect?: string[]
  /** false previews (default), true deletes. */
  apply?: boolean
}

export interface PruneResult {
  dir: string
  keep: number
  total: number
  kept: string[]
  removed: string[]
  protected: string[]
  errors: string[]
  applied: boolean
}

export declare function pruneBackups(dir: string, options?: PruneOptions): PruneResult
