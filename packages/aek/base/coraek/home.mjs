#!/usr/bin/env node
/**
 * The single source of truth for the AEK data root.
 *
 * Every AEK package — plugins, CLIs, host halves and bin bootstraps — MUST
 * obtain its data directory from `resolveAekHome()` / `aekHomePath()`, or from
 * an explicit path supplied by the caller. Re-deriving `~/.aek` locally makes
 * a second installation (for example AEK Next with `~/.aek-next`) silently
 * read and write the first installation's data.
 *
 * Layout: `~/.aek` is a CONTAINER, not a data root. It holds one directory per
 * app slot (`current/`, `next/`), `backups/`, and the path manifest
 * `aek.yaml`. A slot's data root is declared in that manifest (default
 * `join(<container>, 'current')`), so the two apps stay fully independent — no
 * shared `skill-manager`, no shared `quick-git` — which is what makes isolated
 * testing possible.
 *
 * The manifest — not this file — decides where the folders are. Adding a parent
 * folder (`current/` → `v2/current/`) or moving a slot to another disk is an
 * edit to `<container>/aek.yaml`, with no code change anywhere. See
 * `paths.mjs` for the schema.
 *
 * Resolution order (first non-empty wins):
 *   1. `AEK_HOME` — the running slot's data root (set by the launcher).
 *   2. `<container>/aek.yaml` → `slots.aek` — the path manifest.
 *   3. `join(resolveAekRoot(env), 'current')` — the historical default, kept
 *      for installs that predate the manifest.
 *
 * The container itself comes from `AEK_ROOT`, else the default `~/.aek`.
 *
 * `DSH_HOME` is deliberately NOT an input. It is the environment variable of
 * the OUTER DSH product this fork descended from, and an AEK process — most
 * of all one running inside a coding-agent session — inherits that outer
 * home. Treating it as AEK's data root would make every AEK script, plugin
 * and CLI read and write the outer product's home, which AEK must never
 * touch. AEK's data root is exactly `AEK_HOME` or the default; the launcher
 * pins the spawned runtime's `DSH_HOME` to it explicitly (see
 * `applyAekHomeEnvironment`), so the native reader still finds the AEK home
 * without us ever reading the inherited variable.
 *
 * The literal default directory name lives in `paths.mjs` (`DEFAULT_SLOT_DIRS`)
 * and is re-exported here, so it is spelled exactly once. This file and
 * `paths.mjs` are the only ones allowed to build the data root;
 * `scripts/aek/verify-aek-home.mjs` enforces that as a compile-time gate. No
 * absolute path is hardcoded: every candidate is derived from the environment,
 * from the manifest, or from the OS home directory.
 *
 * Deliberately dependency-free plain ESM: bin bootstraps and installed
 * tarballs can import the `@cheezmil/coraek/home` subpath without loading the
 * cordis/oclif host half.
 *
 * @module @cheezmil/coraek/home
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DEFAULT_BACKUPS_DIR, DEFAULT_SLOT_DIRS, manifestFor, readAekManifest, resolveDir } from './paths.mjs'

/** Environment variable set by the AEK launcher for the running app slot. */
export const AEK_HOME_ENV = 'AEK_HOME'

/**
 * Environment variable naming the CONTAINER that holds every slot's data root.
 *
 * Separate from {@link AEK_HOME_ENV} on purpose: `AEK_HOME` is "where this
 * process reads its data", while `AEK_ROOT` is "where all slots live". A
 * process must be able to start or stop a SIBLING slot, which is only possible
 * when the container is known independently of the caller's own root.
 */
export const AEK_ROOT_ENV = 'AEK_ROOT'

/** Environment variable the harness runtime itself reads. */
export const DSH_HOME_ENV = 'DSH_HOME'

/** Default container directory name under the OS home directory. */
export const AEK_HOME_DIRNAME = '.aek'

/**
 * Directory name of the default (`aek`) slot inside the container.
 *
 * `current` is chosen for one reason: it is the only word that pairs with
 * `next` without extra meaning. `stable`/`prod` would wrongly imply the next
 * slot is unstable, and `aek` would read as `~/.aek/aek/`.
 *
 * Re-exported from `paths.mjs` (`DEFAULT_SLOT_DIRS`) so the literal spelling of
 * the default folder name exists exactly once in the tree — and so that the
 * manifest, not this constant, is what actually decides the location.
 */
export const AEK_DEFAULT_SLOT_DIRNAME = DEFAULT_SLOT_DIRS.aek

/**
 * Resolve the container that holds every slot's data root.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {string} an absolute path to the container.
 */
export function resolveAekRoot(env = process.env) {
  const configured = (env[AEK_ROOT_ENV] || '').trim()
  return configured ? resolve(configured) : join(homedir(), AEK_HOME_DIRNAME)
}

/**
 * Resolve the data root for the current process.
 *
 * `AEK_HOME` wins. Otherwise the container's path manifest (`aek.yaml`, see
 * `paths.mjs`) decides where the default slot lives; only when there is no
 * manifest is the historical `<container>/current` used. That indirection is
 * the whole point: inserting a parent folder (`current/` → `v2/current/`) is a
 * one-line manifest edit instead of a repository-wide code change.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {string} an absolute path to the AEK data root.
 */
export function resolveAekHome(env = process.env) {
  const configured = (env[AEK_HOME_ENV] || '').trim()
  if (configured) return resolve(configured)
  const root = resolveAekRoot(env)
  return readAekManifest(root)?.slots.aek ?? join(root, AEK_DEFAULT_SLOT_DIRNAME)
}

/**
 * Resolve the data root of a slot named by its manifest slot key.
 *
 * Lives here (not in `slots.mjs`) so `resolveAekHome()` can answer without the
 * slot table and without a circular import.
 * @param {'aek' | 'next'} slot - manifest slot key.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {string} the absolute data root of that slot.
 */
export function resolveDefaultSlotHome(slot, env = process.env) {
  const root = resolveAekRoot(env)
  const manifest = readAekManifest(root)
  if (manifest) return manifest.slots[slot]
  return join(root, slot === 'next' ? 'next' : AEK_DEFAULT_SLOT_DIRNAME)
}

/**
 * Join path segments under the resolved data root.
 *
 * The FIRST segment is looked up in the manifest `dirs` table, so
 * `aekHomePath('websearch', 'providers.yml')` follows a renamed or relocated
 * `websearch` folder automatically. This is what makes every existing call site
 * manifest-aware without being rewritten.
 * @param {...string} segments - path segments below the data root.
 * @returns {string} an absolute path inside the AEK data root.
 */
export function aekHomePath(...segments) {
  const home = resolveAekHome()
  if (segments.length === 0) return home
  const [first, ...rest] = segments
  if (typeof first === 'string' && /^[A-Za-z0-9._-]+$/u.test(first)) {
    const manifest = manifestFor(home)
    if (manifest) return join(resolveDir(manifest.dirs, home, first), ...rest)
  }
  return join(home, ...segments)
}

/**
 * Absolute path of the container's backups directory.
 * @param {...string} segments - extra segments inside it.
 * @returns {string} for example `<container>/backups`.
 */
export function aekBackupsPath(...segments) {
  const backups = manifestFor(resolveAekHome())?.backups ?? join(resolveAekRoot(), DEFAULT_BACKUPS_DIR)
  return segments.length === 0 ? backups : join(backups, ...segments)
}

/**
 * Pin the root variables. The pin is unconditional: an inherited `DSH_HOME`
 * (for example the outer DSH product's home, when AEK runs inside a
 * coding-agent session) must not leak into spawned children, because children'
 * native runtimes would then read the foreign home. An operator who wants a
 * custom data root sets `AEK_HOME`; that value wins and is what gets pinned.
 * `AEK_ROOT` is pinned alongside it so a child can still address the SIBLING
 * slot instead of guessing from its own path. Returns the root applied.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {string} the resolved data root.
 */
export function applyAekHomeEnvironment(env = process.env) {
  const home = resolveAekHome(env)
  const root = env[AEK_ROOT_ENV]?.trim() ? resolve(env[AEK_ROOT_ENV]) : resolveAekRoot(env)
  env[AEK_ROOT_ENV] = root
  env[AEK_HOME_ENV] = home
  env[DSH_HOME_ENV] = home
  return home
}
