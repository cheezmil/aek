/**
 * Config schema for the prompt-manager plugin.
 *
 * The settings service derives this plugin's configuration page from the
 * composition entry's `Config` schema. v1 declares NO fields: the engine's
 * data root (`~/.aek/prompt-manager`) and tool set are fixed by the CLI
 * contract, and no host consumer (webui card, agent model tools) needs a
 * live-editable field yet. A `home` override and per-tool toggles are
 * deliberately deferred until such a consumer exists — an unsupported
 * default is a public choice that would need its own evidence.
 *
 * 类型导入说明：
 *   `Volatile` 从 `@cheezmil/coraek/types` 导入，遵循 AEK 插件统一规范。
 *
 * @module @cheezmil/aek-prompt-manager/config
 */
import z from '@deepseek-ai/schemastery'

/**
 * The settings namespace carrying this plugin's configuration page — the
 * composition entry id the host's settings service derives the section from.
 */
export const AEK_PROMPT_MANAGER_SETTINGS_NAMESPACE = 'aek-prompt-manager'

/**
 * The v1 schema: no fields. The host service runs the same fixed-root engine
 * the `aekpm` CLI drives; when a live-editable field lands (phase-2 webui /
 * model tools), it is added here with `.volatile()` like the skill-manager
 * `home` field.
 */
export const Config = z.object({})

/**
 * The config `apply` receives once the schema resolves. v1 is empty (no
 * fields), so the loader hands through an empty object; the type is the
 * narrowest honest bag and gains named fields as they are added.
 */
export type PromptManagerPluginConfig = object
