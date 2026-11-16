/**
 * Type declarations for `scripts/aek/build-flags.mjs` (the build-flag reader
 * for the build scripts, BB round, 2026-11-16).
 */

/** The persisted build flags. Missing / corrupt file = the safe default. */
export interface BuildFlagsDoc {
  /** Whether the aek-web console build emits source maps. */
  sourcemap: boolean
}

/**
 * Read the persisted build flags of one slot.
 * @param slot - `aek` = the live current slot, `next` = the dev slot.
 * @returns the flags; missing / corrupt = `{ sourcemap: false }`.
 */
export declare function buildFlagsForSlot(slot: 'aek' | 'next'): BuildFlagsDoc

/**
 * The env vars to export for the aek-web vite build so `vite.config.ts`
 * honors the persisted source-map flag.
 * @param slot - the slot whose console wrote the flag.
 * @returns `{ AEK_WEB_SOURCEMAP: '1' | '0' }`.
 */
export declare function buildFlagsEnv(slot: 'aek' | 'next'): Record<string, string>
