/**
 * `aek-websearch`: registers the queue-backed
 * {@link AggregatedSearchProvider} with `ctx.web`.
 *
 * Reads config from `~/.aek/websearch/`:
 * - `providers.yml` — which providers are enabled
 * - `{kind}.txt` — API keys, one per line
 *
 * @module aek-websearch
 */

import type { Context } from '@cheezmil/coraek/types'
import type {} from '@deepseek-ai/dsh-web'
import { resolveConfig, snapshotsOf } from './config.ts'
import type { AggregatedPluginConfig } from './config.ts'
import { AggregatedSearchProvider } from './provider.ts'
import { KIND_CREDENTIAL_REF } from './defaults.ts'
import { readProviders, readKeys } from './config-reader.ts'

export { Config, DEFAULT_QUEUE, resolveConfig, snapshotsOf } from './config.ts'
export type { AggregatedPluginConfig } from './config.ts'
export {
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  DEFAULT_KEY_REF,
  MAX_ATTEMPT_TIMEOUT_MS,
  MIN_ATTEMPT_TIMEOUT_MS,
} from './config.ts'
export { formatApiKeys, keyRefLabel, maskApiKey, parseApiKeys } from './keys.ts'
export type {
  AggregatedSearchConfig,
  AttemptFailure,
  QueueEntry,
  SearchProviderKind,
} from './types.ts'
export type { ConfigInput } from './config.ts'
export {
  ADAPTERS,
  ANYSEARCH_DEFAULT_BASE_URL,
  BRAVE_DEFAULT_BASE_URL,
  BRAVE_DEFAULT_COUNT,
  BRAVE_MAX_COUNT,
  EXA_DEFAULT_BASE_URL,
  EXA_DEFAULT_NUM_RESULTS,
  EXA_MAX_NUM_RESULTS,
  FIRECRAWL_DEFAULT_BASE_URL,
  FIRECRAWL_DEFAULT_LIMIT,
  FIRECRAWL_MAX_LIMIT,
  JINA_DEFAULT_BASE_URL,
  JINA_MAX_NUM,
  SERPAPI_DEFAULT_BASE_URL,
  SERPAPI_MAX_NUM,
  SERPER_DEFAULT_BASE_URL,
  SERPER_MAX_NUM,
  SERPER_MIN_NUM,
  TAVILY_DEFAULT_BASE_URL,
  TAVILY_DEFAULT_MAX_RESULTS,
  TINYFISH_DEFAULT_BASE_URL,
  braveCount,
  braveURL,
  exaNumResults,
  firecrawlLimit,
  jinaNum,
  mapBraveResponse,
  mapBraveRow,
  mapExaResponse,
  mapExaRow,
  mapFirecrawlResponse,
  mapFirecrawlRow,
  mapJinaResponse,
  mapJinaRow,
  mapSerpApiResponse,
  mapSerpApiRow,
  serpapiNum,
  serpapiURL,
  mapSerperResponse,
  mapSerperRow,
  serperNum,
} from './adapters/index.ts'
export { AggregatedSearchProvider, AGGREGATED_PROVIDER_ID } from './provider.ts'
export type {
  AggregatedSearchProviderOptions,
  ProviderLogger,
} from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'aek-websearch'

/**
 * The capability seams this plugin registers into. Only needs `web` — keys
 * are read directly from `~/.aek/websearch/{provider}.txt` files.
 */
export const inject = ['web']

/**
 * Settings namespace carrying this provider's configuration page.
 */
export const WEB_SEARCH_AGGREGATION_SETTINGS_NAMESPACE = 'aek-websearch'

/**
 * Register the aggregated search provider with `ctx.web`.
 *
 * @param ctx - plugin context supplying the web seam.
 * @param config - the loader-resolved plugin config; its volatile fields are
 *   live references a settings commit updates in place.
 */
export function apply(ctx: Context, config: AggregatedPluginConfig): void {
  // Load providers from ~/.aek/websearch/providers.yml
  const providers = readProviders()

  ctx.web.registerSearchProvider(new AggregatedSearchProvider({
    config: () => resolveConfig(snapshotsOf(config)),
    resolveKey: async (ref) => {
      // Map credential ref back to provider kind, then read from .txt file
      const kind = Object.entries(KIND_CREDENTIAL_REF).find(
        ([, value]) => value === ref,
      )?.[0]
      if (!kind) return undefined
      return readKeys(kind)
    },
    logger: ctx.logger,
  }))
}
