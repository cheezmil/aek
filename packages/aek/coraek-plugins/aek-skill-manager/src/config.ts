/**
 * Config schema and normalization for the skill-hub plugin.
 *
 * The settings service derives this plugin's configuration page from the
 * composition entry's `Config` schema: the one field (`home`) is marked
 * `.volatile()`, so a committed edit is pushed into the running plugin's
 * volatile reference without a remount — the host service re-reads it per
 * operation. An empty value means "use the default hub" (`~/.aek/skill-manager`,
 * or `AEK_SKILL_MANAGER_HOME` when set), which is what the `aeksm` CLI does.
 *
 * 类型导入说明：
 *   `Volatile` 从 `@cheezmil/coraek/types` 导入，遵循 AEK 插件统一规范。
 *   dsh 插件则直接从 `@deepseek-ai/cordis` 导入同名的 `Volatile`。
 *
 * @module @cheezmil/aek-skill-manager/config
 */
import type { Volatile } from '@cheezmil/coraek/types'
import z from '@deepseek-ai/schemastery'

/**
 * The settings namespace carrying this plugin's configuration page — the
 * composition entry id the host's settings service derives the section from.
 */
export const AEK_SKILL_MANAGER_SETTINGS_NAMESPACE = 'aek-skill-manager'

/**
 * The schema shared by the composition entry and the settings form projected
 * from it. One optional field: an explicit skill-hub root that overrides the
 * default `~/.aek/skill-manager` (env `AEK_SKILL_MANAGER_HOME` still applies
 * when left empty).
 */
export const Config = z.object({
  /** Skill hub root; absent = the default hub. Bare `z.string()` is optional; `.volatile()` makes the resolved value a live reference. */
  home: z.string().volatile(),
})

/** The config input face: composition entry or a settings-section value. */
export type AeksmConfigInput = { home?: string }

/**
 * The config `apply` receives once the schema resolves: `home` arrives as a
 * live reference whose snapshot a settings commit replaces in place, so the
 * host service re-reads it per operation (the plugin never remounts for an
 * edit).
 */
export interface AeksmPluginConfig {
  /** The skill-hub root as a live reference (undefined = default hub). */
  home: Volatile<string | undefined>
}

/**
 * Normalize one config input: trim the hub root and drop it when empty, so an
 * explicitly-blank value means the default hub rather than a broken path.
 *
 * @param config - composition entry, settings-section value, or volatile snapshots.
 * @returns the plain resolved config the engine consumes.
 */
export function resolveConfig(config: AeksmConfigInput = {}): { home?: string } {
  const home = config.home?.trim()
  return home !== undefined && home.length > 0 ? { home } : {}
}

/**
 * Read the live references `apply` holds into one plain input for
 * {@link resolveConfig}; a settings commit has usually replaced the snapshot
 * since the last call, which is the whole point.
 *
 * @param config - the plugin config as the loader resolved it.
 * @returns the current snapshots, ready for resolution.
 */
export function snapshotsOf(config: AeksmPluginConfig): AeksmConfigInput {
  return { home: config.home.get() }
}
