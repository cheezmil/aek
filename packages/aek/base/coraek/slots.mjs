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

import { basename, join, resolve } from 'node:path'
import {
  AEK_HOME_ENV,
  AEK_ROOT_ENV,
  resolveAekHome,
  resolveAekRoot,
  resolveDefaultSlotHome,
} from './home.mjs'
import { DEFAULT_SLOT_DIRS, containerOf, findManifestFor, readAekManifest } from './paths.mjs'

/** Environment variable that names the slot a process belongs to. */
export const AEK_SLOT_ENV = 'AEK_SLOT'

/** The two slot names, in canonical order. */
export const SLOT_NAMES = /** @type {const} */ (['aek', 'next'])

/**
 * Directory name of each slot INSIDE the container (`~/.aek`), as a DEFAULT.
 *
 * The real locations live in `<container>/aek.yaml` (see `paths.mjs`): a slot
 * may sit several parent folders deep (`v2/current`) or on another disk, and
 * that is a manifest edit — never a code change. This table only supplies the
 * historical names for installs without a manifest, and for the one-off
 * migration script that has to name the old layout.
 */
export const SLOT_DIRS = DEFAULT_SLOT_DIRS

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
    // Browser-facing host. A DIFFERENT PORT IS NOT ENOUGH: Chromium keys site
    // zoom by host (port dropped), so `127.0.0.1:1685` and any other local app
    // on `127.0.0.1:<port>` share one zoom level — zooming AEK also zoomed the
    // DeepSeek Harness web UI (verified in Chrome's Preferences →
    // partition.per_host_zoom_levels, which holds a single "127.0.0.1" entry).
    // `*.localhost` is resolved to loopback by the OS and by Chromium itself
    // (RFC 6761) and still counts as a trustworthy origin, so the console keeps
    // working over plain http while owning its own zoom/storage key. The socket
    // still binds 127.0.0.1 — only the URL the browser sees differs.
    webHost: 'aek.localhost',
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
    // Same rationale as the `aek` slot's webHost: a distinct host keeps the two
    // slots — and any other local app — from sharing one Chromium zoom level.
    webHost: 'aek-next.localhost',
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
 *   2. The data root: `<container>/next` is the Next slot, `<container>/current`
 *      the default one.
 *   3. `aek` — the default single install.
 *
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {'aek' | 'next'} the slot name.
 */
export function resolveSlot(env = process.env) {
  const explicit = (env[AEK_SLOT_ENV] ?? '').trim()
  if (isSlot(explicit)) return explicit
  const home = resolveAekHome(env)
  const manifest = findManifestFor(home)
  if (manifest) return manifest.slots.next === home ? 'next' : 'aek'
  return basename(home) === SLOT_DIRS.next ? 'next' : 'aek'
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
 * Browser-facing base URL of a slot's console.
 *
 * Always spell the console URL through this helper instead of building
 * `http://127.0.0.1:<port>` by hand: the host, not the port, is what keeps
 * Chromium from sharing one zoom level between every local web UI.
 * @param {unknown} slot - slot name.
 * @param {number} [port] - override the table's `webPort` (the launcher may
 * remap a slot's port before the table is rebuilt).
 * @returns {string} for example `http://aek.localhost:1685`.
 */
export function webUrl(slot, port) {
  const cfg = slotConfig(slot)
  return `http://${cfg.webHost}:${String(port ?? cfg.webPort)}`
}

/**
 * Host the console socket actually binds to.
 *
 * The alias in {@link webUrl} is a browser-side name only; the listener stays
 * on the loopback literal so the network stack, the loopback access checks in
 * `aek-websearch` and every probe script keep working unchanged.
 * @returns {string} the bind address.
 */
export function bindHost() {
  return '127.0.0.1'
}

/**
 * Resolve the container that holds every slot's data root.
 *
 * `AEK_ROOT` wins — it names the container directly. Otherwise it is recovered
 * from `AEK_HOME` so a process that was only handed its own root (the packaged
 * app is launched with `AEK_HOME` alone) can still address the sibling slot.
 * Recovery walks up looking for the `aek.yaml` that claims this path, which is
 * why a nested layout (`<container>/v2/current`) keeps working; the directory
 * name alone would no longer be enough to tell slot from parent.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {string} the absolute container path.
 */
function aekContainer(env) {
  const explicitRoot = (env[AEK_ROOT_ENV] || '').trim()
  if (explicitRoot) return resolve(explicitRoot)

  const raw = (env[AEK_HOME_ENV] || '').trim()
  if (raw) return containerForHome(raw)
  return resolveAekRoot(env)
}

/**
 * Container that a given data root lives in.
 *
 * Used by callers that hold a root VALUE rather than an environment
 * (`spawnWebServerWith(home, port)`), so the child can still be told where the
 * sibling slot is.
 * @param {string} home - an absolute path to some slot's data root.
 * @returns {string} the container path.
 */
export function containerForHome(home) {
  return containerOf(home)
}

/**
 * Resolve the data root of a slot.
 *
 * The answer must NOT depend on which slot the CALLING process belongs to:
 * both apps share one source tree and one arbiter, so the AEK Next console can
 * start / stop the AEK slot and vice versa. The container's path manifest
 * (`<container>/aek.yaml`) is the source of truth; without one, the historical
 * `join(<container>, SLOT_DIRS[slot])` applies.
 *
 * Both slot directories are REAL directories. There is deliberately no symlink
 * compatibility layer: a linked slot would let one app's writes land inside the
 * other's tree and destroy the isolation the container exists to provide.
 * @param {unknown} slot - slot name.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {string} the absolute data-root path for that slot.
 * @throws {Error} when the slot name is unknown.
 */
export function slotHome(slot, env = process.env) {
  if (!isSlot(slot)) throw new Error(`unknown AEK slot: ${String(slot)}`)
  const container = aekContainer(env)
  return readAekManifest(container)?.slots[slot] ?? join(container, SLOT_DIRS[slot])
}

/**
 * Same as {@link slotHome}, but resolved from the default container only.
 *
 * Kept for callers that have no environment to hand (build-time config) and
 * must not be affected by an inherited `AEK_HOME`.
 * @param {unknown} slot - slot name.
 * @returns {string} the absolute data-root path for that slot.
 */
export function defaultSlotHome(slot) {
  if (!isSlot(slot)) throw new Error(`unknown AEK slot: ${String(slot)}`)
  return resolveDefaultSlotHome(slot)
}
