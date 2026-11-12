/**
 * Local type face for `pino-roll` (v4 ships no bundled declarations).
 * Only the surface `@cheezmil/coraek` uses is declared.
 */
declare module 'pino-roll' {
  import type { WritableStream } from 'node:stream'

  /** Rolling destination options (see pino-roll README: size/frequency/limit). */
  interface PinoRollOptions {
    /** Destination file (rolled names get `.1`, `.2`, … suffixes). */
    file: string
    /** Max size of one file before rolling: bytes (number) or string like `'2mb'`. */
    size?: number | string
    /** Time frequency (e.g. `'5m'`); optional when `size` is set. */
    frequency?: string
    /** File extension for rolled names. @default `.log` handling of `file` */
    extension?: string
    /** Prune strategy when rolling: keep at most `count` files. */
    limit?: { count: number; removeOtherLogFiles?: boolean }
    /** Explicit date-format override (rarely needed). */
    dateFormat?: string
    /** Keep a stable symlink at `file` pointing at the live rolled file. */
    symlink?: boolean
  }

  /**
   * Build the rolling destination stream. Resolves once the live file is
   * open; the stream rolls automatically when `size` is reached and prunes
   * to `limit.count` generations.
   */
  export default function pinoRoll(options: PinoRollOptions): Promise<WritableStream>
}
