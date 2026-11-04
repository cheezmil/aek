/**
 * AEK base identity layer, host half. Prints the `aek web:` readiness line.
 * The dsh web-app bundle's own `dsh web:` line is suppressed via
 * `printUrl: false` in the web profile's cordis patch, so AEK surfaces the
 * AEK-prefixed URL instead. Set `DSH_CLIENT_TITLE` at build time to rebrand
 * the document title; this host half owns the process-stdout announcement.
 *
 * 类型 re-export 说明：
 *   所有 AEK 插件通过 `@cheezmil/coraek/types` 导入 Context/Volatile/ClientContext，
 *   而不是直接 import `@deepseek-ai/cordis`（框架底层，保持不变）。这做了两件事：
 *     1. AEK 插件和 dsh 插件在 import 来源上一眼可辨（对话中 AI 能区分）
 *     2. 未来若切换框架底层，只需改 coraek 一处，所有插件自动跟随
 *
 *   - AEK 插件导入：`import type { Context } from '@cheezmil/coraek/types'`
 *   - dsh 插件导入：`import type { Context } from '@deepseek-ai/cordis'`（框架底层，保持不变）
 *
 * @module @cheezmil/coraek
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'

// Re-export AEK framework types so plugins don't import cordis/cosmokit directly.
export type { Context } from '@deepseek-ai/cordis'
export type { Volatile } from '@deepseek-ai/cosmokit'

/** Stable Coraek plugin name. */
export const name = 'coraek'

/** Services required before the AEK URL line can print. */
export const inject = ['webServer']

const ANNOUNCED_ROOTS = new WeakSet<Context>()

/**
 * Print the `aek web:` readiness line once the connection service mounts.
 * @param ctx - plugin context carrying the webServer service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['connection'], (connectionCtx) => {
    if (ANNOUNCED_ROOTS.has(connectionCtx.root)) return
    const url = connectionCtx.connection.authenticatedUrl(ctx.webServer.getOrigin())
    ANNOUNCED_ROOTS.add(connectionCtx.root)
    console.log(`aek web: ${url}`)
  })
}

// CLI re-exports — plugins import from '@cheezmil/coraek/cli'
export * from './cli.ts'

// Coraek framework layer identity
export * from './coraek.ts'
