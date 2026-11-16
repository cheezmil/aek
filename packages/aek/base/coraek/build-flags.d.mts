/**
 * Type declarations for `@cheezmil/coraek/build-flags` (the build-flag
 * switch, BB round, 2026-11-16).
 *
 * @module @cheezmil/coraek/build-flags
 */

/** The file name inside the AEK home directory. */
export declare const BUILD_FLAGS_FILE: 'build-flags.json'

/**
 * The build-flags document. Missing / corrupt file = the safe default
 * (sourcemap: false).
 */
export interface BuildFlagsDoc {
  /**
   * Whether the aek-web console build should emit source maps (helps
   * post-build debugging; costs build size/time and embeds the full
   * source in the `.map` files — never ship those in a distributed build).
   */
  sourcemap: boolean
}

/** The store path inside the AEK home. */
export declare function buildFlagsPath(aekHome: string): string

/** Read the build flags (missing / corrupt = `{ sourcemap: false }`, never an error). */
export declare function readBuildFlags(aekHome: string): BuildFlagsDoc

/** Persist the build flags (atomic tmp + rename). */
export declare function writeBuildFlags(
  aekHome: string,
  sourcemap: boolean,
): { ok: boolean; problems: string[] }
