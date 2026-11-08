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
 * Resolution order (first non-empty wins):
 *   1. `AEK_HOME` — set by the launcher for a specific app slot.
 *   2. `DSH_HOME` — the harness runtime's own environment variable.
 *   3. `join(homedir(), '.aek')` — the default for a plain single install.
 *
 * This is the ONLY file in the AEK source tree allowed to spell out the
 * default directory name. `scripts/aek/verify-aek-home.mjs` enforces that
 * rule as a compile-time gate. No absolute path is hardcoded: every candidate
 * is derived from the environment or from the OS home directory.
 *
 * Deliberately dependency-free plain ESM: bin bootstraps and installed
 * tarballs can import the `@cheezmil/coraek/home` subpath without loading the
 * cordis/oclif host half.
 *
 * @module @cheezmil/coraek/home
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Environment variable set by the AEK launcher for the running app slot. */
export const AEK_HOME_ENV = 'AEK_HOME'

/** Environment variable the harness runtime itself reads. */
export const DSH_HOME_ENV = 'DSH_HOME'

/** Default directory name under the OS home directory. */
export const AEK_HOME_DIRNAME = '.aek'

/**
 * Resolve the data root for the current process.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {string} an absolute path to the AEK data root.
 */
export function resolveAekHome(env = process.env) {
  const configured = (env[AEK_HOME_ENV] || env[DSH_HOME_ENV] || '').trim()
  return configured ? resolve(configured) : join(homedir(), AEK_HOME_DIRNAME)
}

/**
 * Join path segments under the resolved data root.
 * @param {...string} segments - path segments below the data root.
 * @returns {string} an absolute path inside the AEK data root.
 */
export function aekHomePath(...segments) {
  return join(resolveAekHome(), ...segments)
}

/**
 * Pin both environment variables to the resolved root without overwriting an
 * operator's explicit choice. Returns the root actually applied.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {string} the resolved data root.
 */
export function applyAekHomeEnvironment(env = process.env) {
  const home = resolveAekHome(env)
  if (!env[AEK_HOME_ENV]) env[AEK_HOME_ENV] = home
  if (!env[DSH_HOME_ENV]) env[DSH_HOME_ENV] = home
  return home
}
