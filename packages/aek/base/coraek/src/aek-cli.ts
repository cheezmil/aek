/**
 * `aek` — AEK's operator command line.
 *
 * AEK plugins under `packages/` are operated ONLY through `aek`-prefixed
 * commands. The legacy `dsh` prefix belongs to the copied upstream harness and
 * is rejected here, in code, before anything is spawned.
 *
 * Commands:
 *   aek web [app-args...]    boot the web profile (browser UI + its host)
 *   aek <profile> [args...]  boot any named profile under $DSH_HOME/profiles
 *   aek plugin ...           manage a profile's plugins
 *   aek --help | -h          this help
 *   aek --version | -V       the version
 *
 * The profile boot itself is performed by the harness runtime; this CLI only
 * resolves that runtime and hands it the profile arguments.
 */

import { run } from '@oclif/core'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { forbiddenCommandMessage, isForbiddenDshCommand } from './command-namespace.ts'

const argv = process.argv.slice(2)

// The operator-facing command token is the first non-flag argument. Flag
// values (e.g. `--profile web`) and oclif subcommand names (`web`) belong to
// the CLI's own namespace, so only a legacy dsh-prefixed command is refused.
const first = argv.find(token => token.length > 0 && !token.startsWith('-'))
if (first !== undefined && isForbiddenDshCommand(first)) {
  console.error(forbiddenCommandMessage(first))
  process.exit(2)
}

// `--version` is an oclif v5 non-auto flag: intercept it so it works both in
// dev (running the TypeScript source) and installed (running lib/aek-cli.mjs).
if (argv.includes('--version') || argv.includes('-V')) {
  const pkgRoot = findPkgRoot(dirname(fileURLToPath(import.meta.url)))
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
  console.log(`${pkg.name}/${pkg.version} ${process.platform}-${process.arch} node-v${process.version.slice(1)}`)
  process.exit(0)
}

/** Walk up to the nearest ancestor that owns a package.json. */
function findPkgRoot(start: string): string {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}

await run(argv, import.meta.url)
