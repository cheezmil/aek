/**
 * `@cheezmil/aek-skill-manager` — Coraek plugin entry (host half).
 *
 * Registers the in-process `skillsManager` service on the host context. The
 * webui (typert remote) and the agent model tools call this service; it runs
 * the SAME engine the `aeksm` CLI drives, so the CLI stays the primary
 * human/script face and this is the host face of the identical operations.
 *
 * This is a *function plugin*: named exports `name` / `inject` / `Config` /
 * `apply`, no default export — the coraek loader only starts the namespace
 * when the shape is right. The `Config` schema (one volatile `home` field) is
 * what the host's settings service projects into the `aek-skill-manager`
 * settings section, and what the webui settings card edits live.
 *
 * The CLI entry is separate (`src/cli.ts`, built to `lib/cli.js`, exposed via
 * the `aeksm` bin) and is NOT this module.
 *
 * @module @cheezmil/aek-skill-manager
 */

import type { Context } from '@cheezmil/coraek/types'
import {
  Config,
  resolveConfig,
  snapshotsOf,
  AEK_SKILL_MANAGER_SETTINGS_NAMESPACE,
  type AeksmPluginConfig,
} from './config.js'
import {
  SkillsManagerService,
  type DistributeRequest,
} from './plugin/skills-manager-service.js'

/** Stable Coraek plugin name. */
export const name = 'aek-skill-manager'

/**
 * Service seams this plugin registers into. It only PROVIDES `skillsManager`
 * and consumes no host seam, so the inject list is empty, keeping this entry
 * mountable in every composition, CLI test harness included. The host
 * management API lives in the separate ADMIN face (`./admin`, the
 * `aek-skill-manager-admin` profile entry): it declares `webServer` +
 * `skillsManager` in its own inject list, so a headless composition that
 * mounts only this face never waits for a web server that never comes.
 */
export const inject: string[] = []

/**
 * The settings-page config schema (projected into the `aek-skill-manager`
 * settings section) plus the resolution helpers the loader and the host
 * service share.
 */
export { Config, resolveConfig, snapshotsOf, AEK_SKILL_MANAGER_SETTINGS_NAMESPACE }
export type { AeksmPluginConfig, DistributeRequest }
export { SkillsManagerService }

/**
 * Register the in-process skill-hub engine as `ctx.skillsManager`.
 *
 * @param ctx - the host plugin context to register the service on.
 * @param config - the host-resolved plugin config; its `home` is a volatile
 *   live reference (a settings commit replaces it in place), read per
 *   operation. Empty `home` = the default `~/.aek/skill-manager` hub.
 */
export function apply(ctx: Context, config: AeksmPluginConfig): void {
  // The service registers itself (and auto-disposes with the owning fiber) in
  // its constructor; nothing here spawns a process or touches the hub. The
  // console routes are registered by the ADMIN face (`./admin`), which
  // injects this face's `skillsManager` service plus the composition's
  // `webServer` seam — the SAME engine the CLI drives, over the
  // browser-reachable channel, only where a web server exists.
  new SkillsManagerService(ctx, config)
}
