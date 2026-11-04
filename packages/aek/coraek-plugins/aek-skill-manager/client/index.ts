/**
 * Browser half of `aek-skill-manager`: registers the locale dictionary and the
 * plugin-configuration card keyed by the `aek-skill-manager` settings
 * namespace (the composition entry id the host's settings service derives
 * from the plugin's `Config` schema).
 *
 * The Plugins page offers a bundle two seats: the bundle's own form on its
 * package page (`plugins.bundle.config`, keyed by package name) and one row's
 * page (`plugins.row.config`, keyed `<package name>#<row id>`). This bundle is
 * one plugin with one config, so BOTH seats inject the SAME card and
 * controller: whichever way the user arrives, the form is on the first page
 * they land on, and one staging area follows them between the two. The mounts
 * ride `configForms.whileServed`, so a deployment that never composed the
 * host entry shows no trace of the card.
 *
 * The card stages the hub `home` root (a settings edit) and shows a read-only
 * hub status block. The status crosses the `aeksm` remote namespace when the
 * host composed it; read defensively here, the card degrades to the "run the
 * aeksm CLI" guidance when the namespace is absent — the CLI stays primary.
 *
 * @module aek-skill-manager/client
 */

import type { Context } from '@cheezmil/coraek'
// Type-only: pulls the ctx.configForms / ctx.locale / ctx.slots Context
// merges from the owning client packages (type-only imports are erased before
// the purity gate).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { AEKSM_NS, SkillManagerCardController, type AeksmRemoteFace } from './controller.ts'
import { SkillManagerCard } from './card.tsx'
import { en, zh } from './locales.ts'

/** This bundle's package name — the Plugins page keys a bundle's own
 *  configuration by it. Spelled here rather than read from any manifest:
 *  this bundle must stay self-contained. */
const PACKAGE_NAME = 'aek-skill-manager'

/** The row's configuration key `<package name>#<row id>`. */
const ROW_CONFIG_KEY = `${PACKAGE_NAME}#aek-skill-manager`

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms', 'remote']

/**
 * Mount the skill-hub plugin-configuration card while the Host serves the
 * `aek-skill-manager` namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(AEKSM_NS, { zh, en }), 'aek-skill-manager: card dictionary')

  // The `aeksm` namespace is a follow-on typert wiring step; read it
  // structurally so the card runs with or without it (absent → CLI guidance).
  const remoteFace: AeksmRemoteFace | undefined = (
    ctx.remote as { aeksm?: AeksmRemoteFace }
  ).aeksm

  const controller = new SkillManagerCardController(
    ctx.configForms.get(AEKSM_NS),
    remoteFace,
  )
  ctx.effect(() => () => { controller.dispose() }, 'aek-skill-manager: form subscription')

  // The card's two seats on the Plugins page, one shared controller behind
  // both. `whileServed` owns both mounts, so a host without the entry never
  // renders an empty section.
  ctx.effect(
    () => ctx.configForms.whileServed([AEKSM_NS], () => {
      const offBundle = ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        locale: AEKSM_NS,
        inject: () => controller.inject(),
      }, SkillManagerCard))
      const offRow = ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: ROW_CONFIG_KEY,
        locale: AEKSM_NS,
        inject: () => controller.inject(),
      }, SkillManagerCard))
      return () => { offBundle(); offRow() }
    }),
    'aek-skill-manager: plugins-page card',
  )
}
