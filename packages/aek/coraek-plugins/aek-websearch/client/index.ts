/**
 * Browser half of `aek-websearch`: registers the locale
 * dictionary and the plugin-configuration card keyed by the
 * `aek-websearch` settings namespace (the composition entry id the
 * host's settings service derives from the plugin's Config schema).
 *
 * Since dsh 0.1.7 the Plugins page owns a plugin's configuration, and its
 * slot contract offers a bundle two seats: the bundle's own form on its
 * package page (`plugins.bundle.config`, keyed by package name — what the
 * user opens straight from the plugin list) and one row's page
 * (`plugins.row.config`, keyed `<package name>#<row id>` — the row's
 * configure control). This bundle is one plugin with one config, so BOTH
 * seats inject the SAME card and controller: whichever way the user arrives,
 * the form is on the first page they land on, and one staging area follows
 * them between the two. The mounts ride `configForms.whileServed`, so a
 * deployment that never composed the host entry shows no trace of the card.
 *
 * @module aek-websearch/client
 */

import type { Context } from '@cheezmil/coraek'
// Type-only: pulls the ctx.configForms Context merge (the shared forms
// service) from the owning client package, the ctx.slots merge from the
// renderer, and the 'plugins.bundle.config' / 'plugins.row.config' SlotMap
// declarations from the Plugins page (type-only imports are erased before
// the purity gate).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { AggregatedCardController, WEB_SEARCH_AGGREGATION_NS } from './controller.ts'
import { AggregatedCard } from './card.tsx'
import { en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'aek-websearch'

/**
 * This bundle's package name — the Plugins page keys a bundle's own
 * configuration by it. Spelled here rather than read from any manifest:
 * this bundle must stay self-contained.
 */
const PACKAGE_NAME = 'aek-websearch'

/**
 * The row's configuration key `<package name>#<row id>` with the row id as
 * the bundle's patch declares it.
 */
const ROW_CONFIG_KEY = `${PACKAGE_NAME}#aek-websearch`

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms', 'remote', 'remote.credentials']

/**
 * Mount the aggregated-search plugin-configuration card while the Host
 * serves the `aek-websearch` namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'aek-websearch: card dictionary')

  const controller = new AggregatedCardController(
    ctx.configForms.get(WEB_SEARCH_AGGREGATION_NS),
    ctx.remote.credentials,
  )
  ctx.effect(() => () => { controller.dispose() }, 'aek-websearch: form subscription')

  // A key can be written from another surface (the credentials store, another
  // card); this is the only signal that a reference this card shows changed.
  ctx.effect(
    () => ctx.remote.$on('credentials/reference-updated', (ref: string) => {
      controller.refreshCredential(ref)
    }),
    'aek-websearch: credential invalidations',
  )

  // The card's two seats on the Plugins page, one shared controller behind
  // both: the bundle's own page shows the form between its description and
  // its rows, and the row keeps its configure control opening the same form
  // under the plugin's own title. `whileServed` owns both mounts, so a host
  // without the entry never renders an empty section.
  ctx.effect(
    () => ctx.configForms.whileServed([WEB_SEARCH_AGGREGATION_NS], () => {
      const offBundle = ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        locale: NS,
        inject: () => controller.inject(),
      }, AggregatedCard))
      const offRow = ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: ROW_CONFIG_KEY,
        locale: NS,
        inject: () => controller.inject(),
      }, AggregatedCard))
      return () => { offBundle(); offRow() }
    }),
    'aek-websearch: plugins-page card',
  )
}
