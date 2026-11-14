/**
 * AEK base identity layer, client half. With aek-web as the direct-render
 * application root and the dsh sidebar/shell disabled, there are no sidebar
 * brand slots to fill; the client half is an identity no-op. The host half
 * still prints `aek web:` and pins the AEK home dir.
 * @module @cheezmil/coraek/src/client/index
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'

// Re-export AEK framework client types so plugins don't import cordis directly.
export type { Context as ClientContext } from '@deepseek-ai/cordis'

/** aek-web owns the surface; coraek contributes no client UI. */
export const inject: readonly string[] = []

/** Identity no-op: the AEK brand now lives in aek-web's own surface. */
export function apply(_ctx: ClientContext): void {
  /* no-op */
}
