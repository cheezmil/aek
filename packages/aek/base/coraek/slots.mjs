#!/usr/bin/env node
/**
 * The single source of truth for the AEK app slots.
 *
 * AEK ships two equal, named instances: `AEK` and `AEK Next`. They share one
 * source tree but must behave as two separate apps — separate bundle identity,
 * separate data root, separate ports, separate installed bundle.
 *
 * Every layer that needs to know "which app am I?" reads this table:
 *   - `apps/aek-desktop/v0/electron-builder.config.mjs` — appId / productName /
 *     output dir / injected metadata, so a build produces one concrete app.
 *   - `apps/aek-desktop/v0/src/main/index.ts` — which port to connect to and
 *     which data root to lock.
 *   - `scripts/aek/shared-logic.mjs` — the dev bundle, packaging and install.
 *   - `scripts/aek/arbiter.mjs` — start / stop one slot.
 *
 * Deliberately dependency-free plain ESM (same rationale as `home.mjs`): the
 * electron-builder config loads it before any build machinery exists, and the
 * desktop main imports it inside the packaged app.
 *
 * No absolute path is hardcoded here: the data roots are derived from
 * `resolveAekHome()`, which is the only place allowed to spell out the default
 * directory name.
 *
 * @module @cheezmil/coraek/slots
 */

import { basename, dirname, join } from 'node:path'
import { resolveAekHome } from './home.mjs'

/** Environment variable that names the slot a process belongs to. */
export const AEK_SLOT_ENV = 'AEK_SLOT'

/** The two slot names, in canonical order. */
export const SLOT_NAMES = /** @type {const} */ (['aek', 'next'])

/**
 * Slot descriptors. `bundleId` is what macOS sees as the app identity, so the
 * two apps never collide in Spotlight, the Dock or `userData`.
 */
export const SLOTS = {
  aek: {
    slot: 'aek',
    appId: 'com.aek.desktop',
    bundleId: 'com.aek.desktop',
    productName: 'AEK',
    // The dev bundle wears the SAME name as the prod one: the user's Dock and
    // Finder must show `AEK.app` / `AEK Next.app`, never an "AEK DEV" label.
    // Dev and prod then collide on one ~/Applications/AEK.app path and one
    // bundle id — by design, only one instance of each slot may exist.
    devAppName: 'AEK',
    // C1 one-off migration: retired dev-bundle names that still carry this
    // slot's bundle id. `performSwap` removes them from ~/Applications so the
    // Dock/Finder never shows two entries for one slot.
    legacyDevAppNames: ['AEK DEV'],
    // 1680/1682 are NOT usable on this project's port range: 1680 is held by a
    // third-party app on some machines. 1685/1686 are allocated via `cpuh` for
    // agent-enhance-kit (1680-1689) and stay adjacent, so one slot owns one pair.
    webPort: 1685,
    cdpPort: 1686,
  },
  next: {
    slot: 'next',
    appId: 'com.aek.desktop.next',
    bundleId: 'com.aek.desktop.next',
    productName: 'AEK Next',
    // Same naming rationale as the `aek` slot: no "DEV" suffix in the UI.
    devAppName: 'AEK Next',
    legacyDevAppNames: ['AEK DEV Next'],
    // Same project range (1680-1689), numbered straight on from `aek` so the
    // whole table is contiguous: every slot owns one adjacent pair.
    webPort: 1687,
    cdpPort: 1688,
  },
}

/**
 * @param {unknown} value - candidate slot name.
 * @returns {value is 'aek' | 'next'} true when the value names a known slot.
 */
export function isSlot(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SLOTS, value)
}
/**
 * Work out which slot this process belongs to.
 *
 * Resolution order (first hit wins):
 *   1. `AEK_SLOT` — set explicitly by the launcher / build scripts.
 *   2. The data root: a root whose name ends in `-next` is the Next slot.
 *   3. `aek` — the default single install.
 *
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {'aek' | 'next'} the slot name.
 */
export function resolveSlot(env = process.env) {
  const explicit = (env[AEK_SLOT_ENV] ?? '').trim()
  if (isSlot(explicit)) return explicit
  const home = resolveAekHome(env)
  return basename(home).endsWith('-next') ? 'next' : 'aek'
}

/**
 * Get the descriptor of a slot.
 * @param {unknown} slot - slot name.
 * @returns {typeof SLOTS['aek']} the slot descriptor.
 * @throws {Error} when the slot name is unknown.
 */
export function slotConfig(slot) {
  if (!isSlot(slot)) throw new Error(`unknown AEK slot: ${String(slot)}`)
  return SLOTS[slot]
}

/**
 * Resolve the data root of a slot. The Next root is the sibling of the base
 * root, so pointing `AEK_HOME` at a custom root keeps the two apart.
 *
 * The base root may ALREADY be the Next root (the launcher sets
 * `AEK_HOME=~/.aek-next` for the Next slot). Appending `-next` again would
 * point at `~/.aek-next-next`, which nothing else knows about — so a base
 * that already ends in `-next` is returned unchanged.
 * @param {unknown} slot - slot name.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {string} the absolute data-root path for that slot.
 */
export function slotHome(slot, env = process.env) {
  const base = resolveAekHome(env)
  if (slot !== 'next') return base
  if (basename(base).endsWith('-next')) return base
  return join(dirname(base), `${basename(base)}-next`)
}
