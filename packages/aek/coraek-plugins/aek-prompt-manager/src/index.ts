/**
 * `@cheezmil/aek-prompt-manager` — Coraek plugin entry (host half).
 *
 * Registers the in-process `promptManager` service on the host context. The
 * webui (typert remote) and the agent model tools call this service; it runs
 * the SAME plain-JS engine the `aekpm` CLI drives, so the CLI stays the
 * primary human/script face and this is the host face of the identical
 * operations (patch / map / apply / remove / status / pr init / pr gen).
 *
 * This is a *function plugin*: named exports `name` / `inject` / `Config` /
 * `apply`, no default export — the coraek loader only starts the namespace
 * when the shape is right (a default export would make the loader discard it).
 *
 * The CLI entry is separate (`src/cli.js`, run by the `aekpm` bin) and is NOT
 * this module.
 *
 * @module @cheezmil/aek-prompt-manager
 */

import type { Context } from '@cheezmil/coraek/types'
import {
  Config,
  AEK_PROMPT_MANAGER_SETTINGS_NAMESPACE,
  type PromptManagerPluginConfig,
} from './config.js'
import {
  PromptManagerService,
  PromptManagerError,
  type PromptManagerErrorCode,
  type ToolOutcome,
  type ToolError,
  type ToolStatusEntry,
  type StatusReport,
  type OperationResult,
  type RemoveResult,
  type PrInitResult,
  type PrGenerateResult,
  isToolError,
} from './plugin/prompt-manager-service.js'

/** Stable Coraek plugin name. */
export const name = 'aek-prompt-manager'

/**
 * Service seams this plugin registers into. It only PROVIDES
 * `promptManager` and consumes no host seam, so the inject list is empty.
 */
export const inject: string[] = []

/**
 * The settings-page config schema (projected into the `aek-prompt-manager`
 * settings section). v1 is empty — see `config.ts` for the deferral of a
 * live-editable `home` field until a consumer (webui card / model tools)
 * exists.
 */
export { Config, AEK_PROMPT_MANAGER_SETTINGS_NAMESPACE }
export type { PromptManagerPluginConfig }

export {
  PromptManagerService,
  PromptManagerError,
  isToolError,
}
export type {
  PromptManagerErrorCode,
  ToolOutcome,
  ToolError,
  ToolStatusEntry,
  StatusReport,
  OperationResult,
  RemoveResult,
  PrInitResult,
  PrGenerateResult,
}

/**
 * Register the in-process prompt-manager engine as `ctx.promptManager`.
 *
 * @param ctx - the host plugin context to register the service on.
 * @param config - the host-resolved plugin config (v1: an empty object).
 */
export function apply(ctx: Context, config: PromptManagerPluginConfig): void {
  // The service registers itself (and auto-disposes with the owning fiber) in
  // its constructor; nothing here spawns a process or touches the user dir.
  new PromptManagerService(ctx, config)
}
