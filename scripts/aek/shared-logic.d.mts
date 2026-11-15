/**
 * Typed face of `shared-logic.mjs` for TypeScript consumers (plain JS, no
 * inline types). Declare only what the TS importers need; the module keeps
 * its own runtime behavior and every other consumer stays untyped JS.
 */
import type { ChildProcess } from 'node:child_process'

/** One slot's launch configuration: its ports and home root. */
export interface SharedLogicSlot {
  readonly webPort: number
  readonly cdpPort: number
  readonly [field: string]: unknown
}

/** Slot name → slot configuration (`aek` = current slot, `next` = dev slot). */
export const SLOTS: Record<string, SharedLogicSlot>

/**
 * Brand the slot's dev bundle (if needed) and spawn its dev Electron shell,
 * detached, with the slot's home / ports / CDP environment wired.
 * @returns the spawned shell process, or null when no bundle could be prepared.
 */
export function launchShellForSlot(slot: string, options?: { headless?: boolean }): ChildProcess | null
