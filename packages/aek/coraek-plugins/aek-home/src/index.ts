/**
 * AEK home surface, host half. The host side owns no runtime state: the
 * hello-world landing is a pure client-side registration into the UI slot
 * registry, so this entry only establishes the plugin identity for the Loader.
 * The client half (`./client`) registers the home view.
 *
 * 类型导入说明：
 *   使用 `@cheezmil/coraek/types` 而非 `@deepseek-ai/cordis`，
 *   这是 AEK 插件的统一规范。dsh 插件直接 import `@deepseek-ai/cordis`，
 *   两者 import 来源不同，一眼可辨。
 *
 * @module @cheezmil/aek-home
 */

import type { Context } from '@cheezmil/coraek/types'

/** Stable Cordis plugin name. */
export const name = 'aek-home'

/** The home surface needs no host-side services. */
export const inject: readonly string[] = []

/**
 * Host-side apply is a no-op: the home view is registered entirely on the
 * client side through the `slots` service.
 * @param ctx - plugin context (typed via @cheezmil/coraek/types).
 */
export function apply(_ctx: Context): void {
  // no host-side work; identity-only entry for the client roster.
}
