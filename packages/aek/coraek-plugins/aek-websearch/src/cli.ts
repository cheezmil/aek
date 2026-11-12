/**
 * AEK web search CLI.
 *
 * Usage:
 *   aekws <query>                — default: search (tavily unless provider set)
 *   aekws search <query> [flags] — explicit subcommand form
 *   aekws doctor / status / pool / use ...
 */
import { Errors, run } from '@oclif/core'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)

// `--version` / `-v` is an oclif v5 non-auto flag — intercept early so it
// works both in dev and in the installed context (which runs lib/cli.mjs).
if (args.includes('--version') || args.includes('-v')) {
  const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)))
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  console.log(`${pkg.name}/${pkg.version} ${process.platform}-${process.arch} node-v${process.version.slice(1)}`)
  process.exit(0)
}

// Routing: the first token that is neither a flag (`-…` or `--…`) nor an empty
// string determines whether we inject `search` or pass through to oclif as-is.
// This prevents `aekws "" --free` from swallowing --free into the query: the
// empty string at index 0 is skipped, --free at index 1 is a flag, so no
// query was found → leave the args for oclif to reject.
const KNOWN_COMMANDS = new Set([
  'search', 'extract', 'pool', 'doctor', 'use', 'status',
  'help', '--help', '-h',
])
const firstNonFlag = args.find(a => a.length > 0 && !a.startsWith('-'))
if (firstNonFlag && !KNOWN_COMMANDS.has(firstNonFlag)) {
  // A bare query token was found with no leading command — inject `search`.
  process.argv = [process.argv[0], process.argv[1], 'search', args.join(' ')]
}
// Otherwise (no query, or first non-flag is a known command) pass through so
// oclif handles flag validation and displays help / errors.

// Oclif v5's programmatic `run()` RE-THROWS command errors (a required-arg
// miss, an unknown command, a load failure). Without a catch they surface as
// raw Node crash dumps. `Errors.handle` turns every one of them into the
// clean one-line message + exit code oclif's bin wrapper would produce.
await run(process.argv.slice(2), import.meta.url).catch(Errors.handle)
