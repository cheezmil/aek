/**
 * AEK CLI layer — re-exports oclif core plus AEK-specific conventions.
 *
 * All AEK plugins should import CLI primitives from here instead of
 * importing @oclif/core directly.
 *
 * @module @cheezmil/coraek/cli
 */

// Re-export oclif core
export { Command, Args, Flags, run } from '@oclif/core'

// Local binding for AEKCommand below (export-from does not bind in local scope)
import { Command } from '@oclif/core'

// Re-export error class
// Note: ExitError is in @oclif/core/errors but may not be in types
// We use a type assertion to avoid TS errors
declare module '@oclif/core' {
  export class ExitError extends Error {
    code: number
    constructor(code: number | undefined, message?: string)
  }
}

/**
 * Base command class for all AEK CLI commands.
 */
export abstract class AEKCommand extends Command {
  // AEK-specific hooks go here
}
