/**
 * AEK home surface, host half. The host side owns no UI state: the console is
 * mounted by the client half directly into `#root` with `createRoot`.
 * The About page's inventory API is registered by `@cheezmil/aek-websearch/admin`
 * (that plugin already owns the `webServer` seam; aek-home's host entry is a
 * tsc emit artifact, so it must stay free of relative TS imports).
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
 * Host-side apply is a no-op: the home view is mounted entirely by the client
 * half, and every host API the console reads lives in the admin plugin.
 * @param _ctx - plugin context (typed via @cheezmil/coraek/types).
 */
export function apply(_ctx: Context): void {
  // Identity-only entry for the client roster.
}
