/**
 * Client face: starts from the access snapshot the index injected, follows
 * the calling Peer's snapshot stream, provides the `remoteAccess` Client
 * service whose `source(kind, id, action)` answers for any declared-kind
 * resource, and publishes `useRemoteAccess(action)` on the global resource.
 * Domain UI adapters publish their own resource Hooks over `source()`. Every
 * answer is a boolean: true for the owner, false without a snapshot or after
 * a non-owner stream fails; the Host enforces every call regardless.
 * @module @deepseek-ai/dsh-api-remote-access/client
 */

import type { Context } from '@deepseek-ai/cordis'
import remoteAccessRemote from '@deepseek-ai/dsh-api-remote-access/remote'
import { REMOTE_ACCESS_SNAPSHOT_KEY } from '../snapshot.ts'
import { mountAccess } from './mount.ts'
import { parseInjectedBaseline } from './state.ts'

export type {
  RemoteAccessAction, RemoteAccessEndpoint, RemoteAccessFrame, RemoteAccessGrant, RemoteAccessResource, TypertResourceKind,
} from '../types.ts'
export type { ClientRemoteAccess, RemoteEndpoint } from './mount.ts'

/** Required Client services: the Remote mount face. The Slot registry is
 * optional (only present when the dsh shell's `ui-renderer` is loaded); AEK's
 * aek-home direct-render profile disables ui-renderer, so `slots` is absent
 * and `provideRoot` is skipped via `ctx.get('slots')`. */
export const inject = ['remote']

/**
 * Mount the generated `remoteAccess` namespace and publish the access Hooks.
 * @param ctx - Client root Context.
 * @returns disposer that withdraws the namespace after the stream stops.
 */
export function apply(ctx: Context): Promise<() => Promise<void>> {
  return mountAccess(ctx, remoteAccessRemote, parseInjectedBaseline(Reflect.get(globalThis, REMOTE_ACCESS_SNAPSHOT_KEY)))
}
