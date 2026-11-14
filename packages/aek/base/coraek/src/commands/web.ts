/**
 * `aek web` — boot the AEK web profile.
 *
 * The profile boot itself belongs to the harness runtime; this command
 * resolves that runtime and hands it the profile plus any app arguments.
 * App arguments are forwarded VERBATIM (they belong to the booted web app,
 * e.g. `--port 1680`, `--no-open`), so this command parses no flags of its
 * own and never rejects an app flag.
 *
 * T round: the web host's structured log. Pino (JSON lines, lowest overhead —
 * AEK will host many plugin backends, the log path must stay cheap) rolling
 * through `pino-roll` into `<slotHome(slot)>/logs/web-host.log` (2 MiB × 5
 * generations, resolved through `@cheezmil/coraek/slots` — no hardcoded
 * paths). The raw stdout/stderr still flow to `web.log` / `web.err.log`
 * through the launcher; `aek logs` renders the JSON lines back into
 * human-readable text.
 *
 * @module @cheezmil/coraek/commands/web
 */

import { Command } from '@oclif/core'
import { execFileSync, spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import pinoRoll from 'pino-roll'
import type { Logger } from 'pino'
import { slotHome } from '../../slots.mjs'
import { resolveSlot } from '../../slots.mjs'
import { migrateOnBoot } from '../../schema.mjs'
import { applyAekEnvironment, resolveRuntime } from '../runtime.ts'

/** Max size of one web-host.log generation before it rolls. */
const LOG_MAX_BYTES = 2 * 1024 * 1024
/** Retained rolled generations. */
const LOG_KEEP_GENERATIONS = 5

/**
 * Best-effort `git describe` of the tree the web host runs from — the line
 * that tells a post-incident operator EXACTLY which build the backend was.
 * Never throws: a non-git checkout simply logs `tree=<path>`.
 * @param cwd - the tree root.
 * @returns the describe string, or undefined.
 */
function treeTag(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['describe', '--tags', '--always', '--dirty'], {
      cwd,
      timeout: 2_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim()
  } catch {
    return undefined
  }
}

/**
 * The web-host logger: pino JSON lines into a rolling file in the slot's
 * data root. Any failure to build the file transport degrades to the
 * default pino (stdout) — logging must never crash the host.
 * @param slot - the slot whose data root receives the file.
 */
async function createWebHostLogger(slot: string): Promise<Logger> {
  const level = (process.env.AEK_LOG_LEVEL ?? 'info').toLowerCase()
  try {
    const destination = await pinoRoll({
      file: join(slotHome(slot), 'logs', 'web-host.log'),
      size: LOG_MAX_BYTES,
      limit: { count: LOG_KEEP_GENERATIONS },
    })
    return pino({ level }, destination)
  } catch {
    return pino({ level })
  }
}

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

    // B2: the AEK web profile serves the standalone @cheezmil/aek-web console.
    // web-app's resolveDistIndex() now resolves aek-web unconditionally (the dsh
    // shell was retired from the AEK surface), so no AEK_WEB_SERVE flag is set.

    // T round: structured boot context + lifecycle. Which tree, which tag,
    // how the child died — the things raw console output cannot tell you.
    // pino's base logger already records `pid`/`hostname`; only operator
    // fields go in the event object.
    const slot = resolveSlot(process.env)
    const hostLog = await createWebHostLogger(slot)
    hostLog.info({
      slot,
      tree: process.cwd(),
      treeTag: treeTag(process.cwd()),
      args: appArgs,
      runtime: `${runtime.command} ${runtime.prefixArgs.join(' ')}`.trim(),
    }, 'web boot')

    // Data-schema migration, before the runtime that READS those files starts.
    // This is the one hook every install passes through — the packaged app's
    // launcher and a dev checkout both boot the backend with this command — so
    // it is the only place that reaches machines with no `scripts/` directory
    // and no `next` slot. It never throws and never blocks: a failed migration
    // leaves the version file untouched, so the next boot retries.
    migrateOnBoot()

    const args = [...runtime.prefixArgs, 'web', ...appArgs]
    const child = spawn(runtime.command, args, {
      stdio: 'inherit',
      env: process.env,
    })
    // Forward the child's exit code: the launcher must not swallow a failure.
    await new Promise<void>((resolve, reject) => {
      child.on('error', (error) => {
        hostLog.error(error, 'web host spawn failed')
        reject(error)
      })
      child.on('exit', (code, signal) => {
        if (code === 0 && signal === null) {
          hostLog.info({ code: 0 }, 'web host stopped')
        } else {
          hostLog.error({ code: code ?? undefined, signal: signal ?? undefined }, 'web host exited abnormally')
        }
        if (signal !== null) {
          void hostLog.flush()
          process.kill(process.pid, signal)
          return
        }
        process.exitCode = code ?? 1
        resolve()
      })
    })
    await hostLog.flush()
  }
}
