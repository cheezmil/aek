/**
 * Config schema, defaults, and normalization for the aggregated search
 * plugin.
 *
 * Since dsh 0.1.7 the settings service derives a plugin's configuration
 * page from its composition entry's `Config` schema: every field marked
 * `.volatile()` is editable live (Settings -> Plugins), and a committed edit
 * is pushed into the running plugin's volatile references without a
 * remount — this schema IS the `aek-websearch` settings section,
 * so a queue a user writes by hand into the profile is validated at the
 * same boundary.
 *
 * One provider kind appears at most once in the queue (normalization keeps
 * the first entry per kind), and each kind reads exactly one fixed
 * credential — `DEFAULT_KEY_REF[kind]` — whose value holds all its API keys
 * joined by `,` (a single key is stored bare; see `keys.ts`).
 *
 * 类型导入说明：
 *   `Volatile` 从 `@cheezmil/coraek/types` 导入，遵循 AEK 插件统一规范。
 *   dsh 插件则直接从 `@deepseek-ai/cordis` 导入同名的 `Volatile`。
 *
 * @module aek-websearch/config
 */
import type { Volatile } from '@cheezmil/coraek/types'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  KIND_CREDENTIAL_REF,
  MAX_ATTEMPT_TIMEOUT_MS,
  MIN_ATTEMPT_TIMEOUT_MS,
  PROVIDER_KINDS,
} from './defaults.ts'
import type { AggregatedSearchConfig, QueueEntry, SearchProviderKind } from './types.ts'

// Public-API names for the shared constants (single source: `defaults.ts`).
export {
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  MAX_ATTEMPT_TIMEOUT_MS,
  MIN_ATTEMPT_TIMEOUT_MS,
}
/**
 * The single credential reference each kind reads — the conventional
 * environment name. Its value is the provider's keys joined by `,`
 * (single source `KIND_CREDENTIAL_REF` in `defaults.ts`).
 */
export { KIND_CREDENTIAL_REF as DEFAULT_KEY_REF }

/**
 * The shipped default queue: one enabled entry per kind — AnySearch sits
 * first only so the queue serves with no keys configured; beyond that the
 * order carries no meaning and is the user's to arrange in the card.
 */
export const DEFAULT_QUEUE: readonly QueueEntry[] = [
  { kind: 'anysearch', enabled: true },
  { kind: 'firecrawl', enabled: true },
  { kind: 'tavily', enabled: true },
  { kind: 'tinyfish', enabled: true },
  { kind: 'brave', enabled: true },
  { kind: 'exa', enabled: true },
  { kind: 'jina', enabled: true },
  { kind: 'serpapi', enabled: true },
  { kind: 'serper', enabled: true },
]

/** Plugin config (all optional — the schema fills constant defaults). */
export type ConfigInput = Partial<AggregatedSearchConfig>

/**
 * The config `apply` receives once the schema resolves: volatile fields
 * arrive as live references whose snapshot a settings commit replaces in
 * place, so the provider re-reads them per request (the plugin never
 * remounts for a queue edit).
 */
export interface AggregatedPluginConfig {
  /** The prioritized queue as a live reference. */
  providers: Volatile<QueueEntry[]>
  /** Per-attempt budget (ms) as a live reference. */
  attemptTimeoutMs: Volatile<number>
}

/**
 * The schema shared by the composition entry and the settings form projected
 * from it.
 *
 * The type annotation is REQUIRED (TS2883): `z.object()` infers
 * `Schema<ObjectS<X>, ObjectT<X>>`, and both `ObjectS` / `ObjectT` intersect
 * cosmokit's internal `Dict`, so declaration emit cannot name the inferred
 * type portably. Annotating with the global `Schemastery` interface keeps the
 * emitted `.d.mts` free of internal references. The runtime value is still
 * the very same schema instance built by `z.object` — the assertion only
 * narrows the public type face to what this plugin actually promises.
 */
export const Config: Schemastery<ConfigInput, AggregatedPluginConfig> = z.object({
  providers: z.array(z.object({
    kind: z.union(PROVIDER_KINDS),
    enabled: z.boolean().default(true),
    baseURL: z.string(),
  })).default(DEFAULT_QUEUE.map(entry => ({ ...entry, baseURL: '' }))).volatile(),
  attemptTimeoutMs: z.number().step(1).min(MIN_ATTEMPT_TIMEOUT_MS).max(MAX_ATTEMPT_TIMEOUT_MS)
    .default(DEFAULT_ATTEMPT_TIMEOUT_MS).volatile(),
}) as unknown as Schemastery<ConfigInput, AggregatedPluginConfig>

/**
 * Normalize one queue entry: trim the endpoint override and drop it when
 * empty. (API keys are not part of the entry — the kind's fixed credential
 * carries them; hand-written `apiKeyRefs` rows are simply ignored.)
 *
 * @param entry - the schema-validated entry.
 * @returns the normalized entry.
 */
export function normalizeEntry(entry: QueueEntry): QueueEntry {
  const baseURL = entry.baseURL?.trim()
  return {
    kind: entry.kind,
    enabled: entry.enabled,
    ...baseURL !== undefined && baseURL.length > 0 ? { baseURL } : {},
  }
}

/**
 * Resolve any accepted config input into the fully-defaulted, normalized
 * form the provider consumes per request. Later entries whose kind already
 * appeared are dropped (one provider can be queued once).
 *
 * Validation goes through the schema, so volatile fields resolve into live
 * references (exactly what the loader hands `apply`); their snapshots are
 * read out here and normalized. The input face is `Partial` by design
 * (composition entries and volatile snapshots both omit fields; defaults
 * supply them).
 *
 * @param config - composition entry, settings-section value, or volatile snapshots.
 * @returns the resolved config.
 */
export function resolveConfig(config: ConfigInput): AggregatedSearchConfig {
  // Re-validating fills the schema defaults; the volatile wrappers that
  // produces are unwrapped immediately — the provider consumes plain values.
  // (The callable takes the plain input face; the wrapper cast keeps the
  // signature honest about the volatile OUTPUT it returns.)
  const resolved = Config(config as never) as {
    providers: Volatile<QueueEntry[]>
    attemptTimeoutMs: Volatile<number>
  }
  const seen = new Set<SearchProviderKind>()
  const providers: QueueEntry[] = []
  for (const raw of resolved.providers.get()) {
    if (seen.has(raw.kind)) continue
    seen.add(raw.kind)
    providers.push(normalizeEntry(raw))
  }
  return {
    providers,
    attemptTimeoutMs: resolved.attemptTimeoutMs.get(),
  }
}

/**
 * Read the live references `apply` holds into one plain input for
 * {@link resolveConfig}; a settings commit has usually replaced the
 * snapshots since the last call, which is the whole point.
 *
 * @param config - the plugin config as the loader resolved it.
 * @returns the current snapshots, ready for resolution.
 */
export function snapshotsOf(config: AggregatedPluginConfig): ConfigInput {
  return {
    providers: [...config.providers.get()],
    attemptTimeoutMs: config.attemptTimeoutMs.get(),
  }
}
