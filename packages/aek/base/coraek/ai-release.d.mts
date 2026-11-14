/**
 * Type declarations for `@cheezmil/coraek/ai-release` (the AI auto-release
 * switch, S7, 2026-11-15).
 *
 * @module @cheezmil/coraek/ai-release
 */

/** The file name inside the AEK home directory. */
export declare const AI_RELEASE_FILE: 'ai-release.json'

/** The switch document. Missing / corrupt file = the safe default (false). */
export interface AiReleaseDoc {
  /** Whether the AI agent may run the release chain without asking per run. */
  allowed: boolean
}

/** The store path inside the AEK home. */
export declare function aiReleasePath(aekHome: string): string

/** Read the switch (missing / corrupt = `{ allowed: false }`, never an error). */
export declare function readAiRelease(aekHome: string): AiReleaseDoc

/** Persist the switch (atomic tmp + rename). */
export declare function writeAiRelease(
  aekHome: string,
  allowed: boolean,
): { ok: boolean; problems: string[] }
