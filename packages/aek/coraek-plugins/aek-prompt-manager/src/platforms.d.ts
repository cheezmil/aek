/**
 * Hand-maintained sidecar declarations for the plain-JS engine modules.
 *
 * The engine (`core.js`, `platforms.js`, `project-rules.js`, `cli.js`) stays
 * plain ESM JavaScript — it ships from source and the `aekpm` bin runs it
 * directly (no build step in the dev flow). The Coraek host half is
 * TypeScript and imports the engine through these sidecars, so the compiled
 * `lib/` service type-checks without `allowJs`.
 *
 * Keep these declarations in sync with the JS exports they describe.
 */

/** One supported agent tool (an entry of `PLATFORMS`). */
export interface ToolDef {
  /** Stable tool id, e.g. `claude-code` (directory names use underscores). */
  id: string
  /** Display name, e.g. `Claude Code`. */
  name: string
  /**
   * Resolve the tool's global prompt file. Empty string = no such file on
   * this platform/OS combination. `home`/`os` override the running
   * environment (the WSL dual-write passes the Windows-native root + `win32`).
   */
  globalPromptPath: (id: string, options?: { home?: string; os?: string }) => string
  /** Human label for the global prompt target (status/help output). */
  globalPromptLabel: (id: string) => string
  /** Optional front-matter header written ahead of the block for this tool. */
  fileHeader?: string
  /** Extra Windows-native target candidates beyond the primary path. */
  winAltTargets?: (winRoot: string) => string[]
}

/** Every supported tool, with its id/name/target resolvers. */
export const PLATFORMS: readonly ToolDef[]

/** Tool ids that have a real global prompt file (the supported set). */
export const SUPPORTED_IDS: readonly string[]

/** Known agent ids without a global prompt file (reported unsupported). */
export const UNSUPPORTED: readonly string[]
