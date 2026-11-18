/** Process-scoped user id for DeepSeek request attribution.
 *
 * Minted lazily as a random UUID per process and never persisted: the
 * identity is scoped to this launch only, so no cross-run identity file
 * lives in the harness home.
 */
import { randomUUID } from 'node:crypto'

let userId: string | undefined

/** Return the process's user id, minting one on first use. */
export function getOrCreateUserId(): string {
  return (userId ??= randomUUID())
}
