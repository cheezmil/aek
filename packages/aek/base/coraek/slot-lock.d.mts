/** The per-slot runtime lock shared by the Electron shell and the arbiter. */
export interface SlotLock {
  /** The web server's pid, when one is running. */
  webPid?: number | null
  /** The Electron shell's pid, when one is running. */
  shellPid?: number | null
  /** When the lock was first written. */
  startedAt?: number
}

/** The lock file name inside a slot's data root. */
export declare const SLOT_LOCK_FILENAME: string
/** The lock file's path for a slot. */
export declare function slotLockPath(slot: 'aek' | 'next', env?: Record<string, string | undefined>): string
/** Read the lock of a slot. */
export declare function readSlotLock(slot: 'aek' | 'next', env?: Record<string, string | undefined>): SlotLock | null
/** Merge fields into the lock of a slot. */
export declare function writeSlotLock(
  slot: 'aek' | 'next',
  patch: Partial<SlotLock>,
  env?: Record<string, string | undefined>,
): SlotLock
/** Remove the lock of a slot entirely. */
export declare function clearSlotLock(slot: 'aek' | 'next', env?: Record<string, string | undefined>): void
/** Is a pid alive? */
export declare function isPidAlive(pid: number | undefined | null): boolean
