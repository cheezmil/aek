/**
 * AEK runtime resolution for the `aek` CLI.
 *
 * The `aek` command boots an AEK profile. The booting code itself lives in
 * the harness runtime (this repo's `apps/cli` in a checkout, or an installed
 * runtime package elsewhere) — this module only LOCATES that runtime and
 * spawns it by explicit path, never through a `dsh`-prefixed command name.
 *
 * Resolution order (first hit wins):
 *   1. `AEK_RUNTIME_BIN` — explicit override (absolute path or command).
 *   2. A repo checkout: walk up from this file to the directory holding
 *      `pnpm-workspace.yaml`, then prefer `apps/cli/lib/bin.js` (built) and
 *      fall back to `apps/cli/src/bin.ts` through tsx.
 *   3. An installed runtime package: `@cheezmil/aek-runtime`.
 *
 * No absolute path is hardcoded: every candidate is derived from this file's
 * own location or from the environment.
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { resolveAekHome } from '../home.mjs'

/** A resolved way to execute the harness runtime. */
export interface RuntimeInvocation {
  /** Executable to spawn. */
  command: string
  /** Arguments that precede the profile arguments. */
  prefixArgs: string[]
}

/** Walk up from `start` until a directory containing `pnpm-workspace.yaml`. */
export function findRepoRoot(start: string): string | undefined {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** Find the tsx binary of a checkout — used to run the runtime from source. */
function findTsx(repoRoot: string): string | undefined {
  const candidate = join(repoRoot, 'node_modules', '.bin', 'tsx')
  return existsSync(candidate) ? candidate : undefined
}

/**
 * Resolve the harness runtime for this machine.
 * @param here - directory of the calling module, used to locate a checkout.
 * @returns the invocation, or undefined when no runtime can be found.
 */
export function resolveRuntime(here: string): RuntimeInvocation | undefined {
  const override = process.env.AEK_RUNTIME_BIN
  if (override !== undefined && override.trim() !== '') {
    return { command: override.trim(), prefixArgs: [] }
  }

  const repoRoot = findRepoRoot(here)
  if (repoRoot !== undefined) {
    const built = join(repoRoot, 'apps', 'cli', 'lib', 'bin.js')
    if (existsSync(built)) return { command: process.execPath, prefixArgs: [built] }
    const source = join(repoRoot, 'apps', 'cli', 'src', 'bin.ts')
    const tsx = findTsx(repoRoot)
    if (existsSync(source) && tsx !== undefined) {
      return { command: tsx, prefixArgs: [source] }
    }
  }

  // Installed runtime: resolve the package entry through Node's resolver so
  // the path follows the installation layout instead of assuming one.
  try {
    const require = createRequire(join(here, 'noop.js'))
    const entry = require.resolve('@cheezmil/aek-runtime')
    return { command: process.execPath, prefixArgs: [entry] }
  } catch {
    return undefined
  }
}

/**
 * The AEK home directory. `home.mjs` is the single source of truth; this
 * wrapper keeps the CLI layer's existing call site while making every caller
 * (including the Next slot) resolve the same root.
 */
export function aekHome(): string {
  return resolveAekHome()
}

/**
 * Apply AEK's isolated environment before the runtime starts.
 * The native harness reads `DSH_HOME`; the AEK profile tree lives under the
 * AEK data root (`AEK_HOME` or the default).
 *
 * The pin is unconditional: an inherited `DSH_HOME` is the outer DSH
 * product's home (this fork's upstream shape) and must never steer AEK's
 * runtime at it. Pinning here only affects this product's own process tree,
 * never the launching parent's environment.
 */
export function applyAekEnvironment(): void {
  const home = aekHome()
  process.env.DSH_HOME = home
  process.env.AEK_HOME = home
  // The parent process may carry a --require from another product's runtime.
  delete process.env.NODE_OPTIONS
}
