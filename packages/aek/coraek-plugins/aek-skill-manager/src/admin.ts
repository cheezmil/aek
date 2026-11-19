/**
 * `@cheezmil/aek-skill-manager/admin` — the ADMIN face (host half).
 *
 * This is the second module entry of the dual package, mounted in the aek web
 * profile as its own plugin entry (`aek-skill-manager-admin`), mirroring the
 * `@cheezmil/aek-websearch/admin` split. Headless compositions mount only the
 * main face (`@cheezmil/aek-skill-manager`), so a web-server dependency is
 * never declared in a place that has no web server.
 *
 * The face registers the skill-hub routes (`GET /api/aek/skills…`, writes
 * 428-confirm) on the composition's `webServer` seam. It does NOT own the
 * engine: the main face's `SkillsManagerService` is consumed through the
 * `skillsManager` seam, so the browser and the `aeksm` CLI share one engine
 * and one lazily-rebuilt hub cache.
 *
 * @module @cheezmil/aek-skill-manager/admin
 */

import type { Context } from '@cheezmil/coraek/types'
import { registerSkillsManagerApi } from './plugin/skills-admin-api.js'
import type { SkillsManagerService } from './plugin/skills-manager-service.js'

/** Stable Coraek plugin name of this face. */
export const name = 'aek-skill-manager-admin'

/**
 * The seams this face consumes: the composition's web server, plus the
 * `skillsManager` service the main face provides. Activation waits for both.
 */
export const inject = ['webServer', 'skillsManager'] as const

/**
 * Register the skill-hub management API on the current host.
 * @param ctx - the plugin context (typed via @cheezmil/coraek/types).
 */
export function apply(ctx: Context): void {
  const svc = (ctx as unknown as { skillsManager: SkillsManagerService }).skillsManager
  registerSkillsManagerApi(ctx, svc)
}
