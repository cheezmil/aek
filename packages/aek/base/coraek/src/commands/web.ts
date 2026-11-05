/**
 * `aek web` — boot the AEK web profile.
 *
 * The profile boot itself belongs to the harness runtime; this command
 * resolves that runtime and hands it the profile plus any app arguments.
 * App arguments are forwarded VERBATIM (they belong to the booted web app,
 * e.g. `--port 1680`, `--no-open`), so this command parses no flags of its
 * own and never rejects an app flag.
 *
 * @module @cheezmil/coraek/commands/web
 */

import { Command } from '@oclif/core'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyAekEnvironment, resolveRuntime } from '../runtime.ts'

export default class WebCommand extends Command {
  static override description = 'Boot the AEK web profile (browser UI + its host)'

  /** App flags are forwarded verbatim — this command declares none. */
  static override strict = false

  override async run(): Promise<void> {
    // `this.argv` holds the arguments after the command id, unparsed.
    const appArgs = this.argv.filter(token => token !== 'web')
    const runtime = resolveRuntime(dirname(fileURLToPath(import.meta.url)))
    if (runtime === undefined) {
      this.error('aek: no harness runtime found. Set AEK_RUNTIME_BIN to the runtime entry.')
    }

    applyAekEnvironment()

    const args = [...runtime.prefixArgs, 'web', ...appArgs]
    const child = spawn(runtime.command, args, {
      stdio: 'inherit',
      env: process.env,
    })
    // Forward the child's exit code: the launcher must not swallow a failure.
    await new Promise<void>((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', (code, signal) => {
        if (signal !== null) {
          process.kill(process.pid, signal)
          return
        }
        process.exitCode = code ?? 1
        resolve()
      })
    })
  }
}
