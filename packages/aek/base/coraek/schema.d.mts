/** Type surface for the dependency-free `@cheezmil/coraek/schema` subpath. */

export declare const SCHEMA_FILE: '.schema-version'
export declare const SCHEMA_VERSION: number

export interface FileWrite {
  file: string
  /** Current contents, null when the file is absent. */
  before: string | null
  /** Desired contents, null when the file should be removed. */
  after: string | null
  reason: string
}

export interface StepContext {
  home: string
  container: string
  /** Resolve a manifest-named folder inside the slot. */
  dir: (name: string) => string
  /** File contents, null when absent. */
  read: (file: string) => string | null
}

export interface Step {
  /** The schema version this step produces. */
  version: number
  id: string
  title: string
  /** Pure: returns the writes it would perform, touches nothing. */
  run: (ctx: StepContext) => FileWrite[]
}

export declare const STEPS: Step[]

export interface StepReport {
  version: number
  id: string
  title: string
  state: 'done' | 'pending' | 'noop' | 'error'
  writes: number
  error?: string
}

export interface SchemaPlan {
  home: string
  version: number
  target: number
  pending: { version: number; id: string; title: string }[]
  writes: FileWrite[]
  steps: StepReport[]
  consistent: boolean
}

export interface SchemaOutcome {
  home: string
  version: number
  target: number
  changed: boolean
  steps: StepReport[]
  written: string[]
  snapshot: string | null
  error: string | null
  pruned: number
}

export interface SchemaOptions {
  /** false plans only (default), true writes. */
  apply?: boolean
  /** Record the version even when nothing needed migrating. Defaults to `apply`. */
  stamp?: boolean
  keepBackups?: number
}

/** Version recorded in a data root; 0 means "predates versioning". */
export declare function readSchemaVersion(home: string): number

export declare function writeSchemaVersion(home: string, version: number): void

export declare function stepContext(home: string): StepContext

/** Read-only: what a run WOULD do. */
export declare function planSchema(home: string): SchemaPlan

export declare function applySchema(home: string, options?: SchemaOptions): SchemaOutcome

/** Boot hook: migrate a slot, never throw, never block. */
export declare function migrateOnBoot(options?: {
  home?: string
  log?: (line: string) => void
}): SchemaOutcome | null

export { pruneBackups } from './backups'
