/**
 * Type face for `@cheezmil/coraek/logging` (the `.mjs` runtime face carries
 * JSDoc; this file is the TS import face).
 *
 * Read side ONLY — the write side of AEK's built-in logging lives in the
 * established SDKs: `electron-log` (desktop shell) and `pino` + `pino-roll`
 * (web host command). This module resolves the log files and reads/follows
 * them for the `aek logs` command.
 *
 * @module @cheezmil/coraek/logging
 */

export type LogSource = string
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Writer-SDK file naming: `live-first` (electron-log: `<stem>.log` live +
 * `.1`, `.2`, … rolls) vs `numbered` (pino-roll: `<stem>.<N>.log`, the
 * highest N is live).
 */
export type LogScheme = 'live-first' | 'numbered'

/**
 * @param slot - slot name (`aek` | `next`); defaults to `aek`.
 * @param source - logical source tag; sanitized into a file stem.
 * @returns the live log file path inside the slot's data root
 *   (live-first naming; for `numbered` sources use {@link logFiles}).
 */
export function logPath(slot: string | undefined, source: LogSource): string

export interface LogTailOptions {
  /** @default 'aek' */
  slot?: string
  source: LogSource
  /** @default 100 */
  maxLines?: number
  /** Minimum level of event lines (continuations follow their event). @default 'debug' */
  level?: LogLevel
  /** ISO timestamp floor. */
  since?: string
  /** Literal substring filter. */
  grep?: string
  /** Writer-SDK naming scheme. @default 'live-first' */
  scheme?: LogScheme
  /**
   * Transform each raw line into its display form (e.g. pino JSON → text)
   * before the level/since/grep filters run. Returning `null` drops the
   * line.
   */
  render?(line: string): string | null
}

/**
 * Read up to `maxLines` lines across one source's rotated generations,
 * oldest → newest.
 */
export function readLogTail(opts: LogTailOptions): Promise<string[]>

/**
 * That source's log files, newest first (scheme-dependent: live file then
 * rolls, or highest generation number first).
 */
export function logFiles(slot: string | undefined, source: LogSource, opts?: { scheme?: LogScheme }): Promise<string[]>

export interface FollowOptions extends Pick<LogTailOptions, 'slot' | 'source' | 'scheme'> {
  /** Poll interval in milliseconds. @default 1000 */
  pollMs?: number
  onLine(line: string): void
  /** When it returns true, the follow loop resolves. */
  done?(): boolean
}

/**
 * Follow a source by polling (cross-platform: no inotify dependency).
 * Resolves when `done()` becomes true.
 */
export function followLog(opts: FollowOptions): Promise<void>
