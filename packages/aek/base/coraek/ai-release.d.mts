/**
 * Type declarations for `@cheezmil/coraek/ai-release` (the AI auto-release
 * switch S7, 2026-11-15 + the auto-close-next switch S9, 2026-11-18).
 *
 * @module @cheezmil/coraek/ai-release
 */

/** The file name inside the AEK home directory. */
export declare const AI_RELEASE_FILE: 'ai-release.json'

/**
 * The per-key safe defaults. The two keys intentionally differ: `allowed`
 * defaults to `false` (asking is safe), `autoCloseNext` to `true` (closing
 * the AI's own dev instances is the expected behavior — S9 ruling).
 */
export declare const AI_RELEASE_DEFAULTS: Readonly<{
  allowed: false
  autoCloseNext: true
}>

/** The switch document. Each key has its own default when absent. */
export interface AiReleaseDoc {
  /** Whether the AI agent may run the release chain without asking per run. */
  allowed: boolean
  /** Whether the AI closes the AEK Next instances it opened after a dev round. */
  autoCloseNext: boolean
}

/** A partial switch patch: at least one known key, every carried key a boolean. */
export interface AiReleasePatch {
  allowed?: boolean
  autoCloseNext?: boolean
}

/** The store path inside the AEK home. */
export declare function aiReleasePath(aekHome: string): string

/**
 * Read the switches (per-key defaults on missing / corrupt file, never an
 * error).
 */
export declare function readAiRelease(aekHome: string): AiReleaseDoc

/**
 * Persist a partial patch merged over the document on disk (atomic tmp +
 * rename). Returns `{ ok, problems }`; the file is untouched on invalid input.
 */
export declare function writeAiRelease(
  aekHome: string,
  patch: AiReleasePatch,
): { ok: boolean; problems: string[] }
