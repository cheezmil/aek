/**
 * Aggregated web-search Cordis plugin.
 *
 * Contributes an `aggregated` search provider to `ctx.web` that walks a
 * prioritized queue of upstream providers (tavily, exa, brave, …), rotating
 * API keys per provider and falling through on failure.
 *
 * 类型导入来源：
 *   使用 `@cheezmil/coraek/types` 而非 `@deepseek-ai/cordis`，
 *   这是 AEK 插件的统一规范——让 AI 对话和代码 review 能一眼识别
 *   这是一个 AEK 插件（而非 dsh 官方插件）。
 *
 * @module @cheezmil/aek-websearch
 */

import type { Context } from '@cheezmil/coraek/types'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'
import type { AggregatedSearchConfig } from './types.ts'
import { AggregatedSearchProvider } from './provider.ts'
import { Config } from './config.ts'
import { AGGREGATED_PROVIDER_ID } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-aggregation'

/** The web seam this provider registers into. */
export const inject = ['web'] as const

export { Config, AGGREGATED_PROVIDER_ID }

/**
 * Minimal AEK-side contract for the dsh `ctx.web` seam.
 *
 * `@deepseek-ai/dsh-web` augments cordis' `Context` with `web`, but that
 * augmentation does not reach the `Context` re-exported by
 * `@cheezmil/coraek/types` in this package's compilation: the repo tsconfig
 * maps `@deepseek-ai/cordis` to `vendor/cordis/src`, while coraek and the
 * published dsh-web resolve the npm `cordis@4.0.5` copy. Those are two
 * distinct `Context` declarations, so interface merging never happens and
 * `ctx.web` used to fail with TS2339 (which also blocked the root lint).
 * Declaring just the method this plugin uses keeps the AEK layer typed
 * without editing any dsh source.
 */
interface WebSeam {
  registerSearchProvider(provider: WebSearchProvider): () => void
}

/**
 * Register the aggregated search provider with `ctx.web`.
 *
 * @param ctx - the cordis context (typed via @cheezmil/coraek/types).
 * @param config - resolved plugin configuration (from patch or settings).
 */
export function apply(ctx: Context, config: AggregatedSearchConfig): void {
  const web = (ctx as Context & { web: WebSeam }).web
  web.registerSearchProvider(new AggregatedSearchProvider({
    config: () => config,
    resolveKey: async (ref: string) => {
      const key = ctx.get('credentials')?.get(ref)
      return key?.value
    },
    logger: {
      info: (format: string, ...args: unknown[]) =>
        ctx.logger?.('web-search-aggregation')?.info?.(format, ...args) ??
        console.info(`[aek-websearch] ${String(format)}`, ...args),
      warn: (format: string, ...args: unknown[]) =>
        ctx.logger?.('web-search-aggregation')?.warn?.(format, ...args) ??
        console.warn(`[aek-websearch] ${String(format)}`, ...args),
    },
  }))
}
