/**
 * `aek external` — operator face for EXTERNAL capability providers.
 *
 * A provider is a separate process (possibly strong-copyleft licensed) that
 * AEK talks to over a standard protocol; the host NEVER imports it. This
 * command drives the generic capability supervisor: read-only by default,
 * and every write operation requires `--confirm` (the CLI analogue of the
 * console's 428 confirmation rule).
 *
 * Actions:
 *   list                          every registered provider + live state
 *   status <id>                   one provider, liveness-corrected
 *   describe <id>                 live self-description (bounded probe)
 *   stop <id> --confirm           SIGTERM a supervisor-spawned child only
 *   register <id> --descriptor <json|@file> [--pin v] [--install-policy self|managed] --confirm
 *
 * @module @cheezmil/coraek/commands/external
 */

import { Command } from '@oclif/core'
import { readFileSync } from 'node:fs'
import { CapabilitySupervisor } from '../../external-supervisor.mjs'

/** The flags this command understands (parsed manually, see {@link parseExternal}). */
interface ExternalFlags {
  confirm: boolean
  json: boolean
  descriptor: string | undefined
  pin: string | undefined
  installPolicy: string | undefined
}

/**
 * Parse the raw `this.argv` tokens (after the command id) into an action, an
 * optional provider id, and the flag set. Following the `aek web` command,
 * this package does not use oclif's typed `parse` — it reads the raw argv so
 * an unknown flag is just ignored rather than a hard type error.
 * @param argv - raw tokens.
 * @returns the positional action + id and the flags.
 */
function parseExternal(argv: string[]): { action: string; id: string | undefined; flags: ExternalFlags } {
  const positionals: string[] = []
  const flags: ExternalFlags = { confirm: false, json: false, descriptor: undefined, pin: undefined, installPolicy: undefined }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === undefined) continue
    if (token === '--confirm') { flags.confirm = true; continue }
    if (token === '--json') { flags.json = true; continue }
    if (token === '--descriptor') { flags.descriptor = argv[++i]; continue }
    if (token === '--pin') { flags.pin = argv[++i]; continue }
    if (token === '--install-policy') { flags.installPolicy = argv[++i]; continue }
    if (token.startsWith('--')) continue // unknown flag: ignore, stay permissive
    positionals.push(token)
  }
  return {
    action: positionals[0] ?? 'list',
    id: positionals[1],
    flags,
  }
}

export default class ExternalCommand extends Command {
  static override description = 'Manage external capability providers (separate processes, standard protocols only)'

  static override examples = [
    '<%= config.bin %> external list',
    '<%= config.bin %> external status <id>',
    '<%= config.bin %> external describe <id>',
    '<%= config.bin %> external stop <id> --confirm',
    '<%= config.bin %> external register <id> --descriptor {"protocol":"aek-capability/1","name":"x","version":"1","spdx":"AGPL-3.0-or-later","attach":{"kind":"mcp-stdio","command":"x-mcp"}} --confirm',
  ]

  /** Forward unknown flags verbatim; we parse our own argv. */
  static override strict = false

  override async run(): Promise<void> {
    // `this.argv` holds the tokens after the command id, unparsed (the same
    // shape `aek web` reads) — we parse them ourselves to stay permissive.
    const argv = this.argv.filter(token => token !== 'external')
    const { action, id, flags } = parseExternal(argv)
    const supervisor = new CapabilitySupervisor()

    switch (action) {
      case 'list': {
        const rows = await supervisor.statusAll()
        for (const row of rows) {
          const health = row.state === 'running'
            ? (await supervisor.health(row.id)).detail
            : row.state
          const compliance = CapabilitySupervisor.complianceLine(row)
          if (flags.json) {
            const body = {
              id: row.id,
              state: row.state,
              pid: row.pid ?? null,
              startedBy: row.startedBy ?? null,
              pin: row.pin ?? null,
              installPolicy: row.installPolicy ?? null,
              health,
              spdx: row.declared.spdx ?? null,
              source: row.declared.source ?? null,
            }
            this.log(JSON.stringify(body, null, 2))
          } else {
            this.log(`${row.id.padEnd(24)} state=${row.state.padEnd(7)} pid=${String(row.pid ?? '-').padEnd(7)} ${health}`)
            this.log(`${''.padEnd(24)} ${compliance}`)
          }
        }
        if (rows.length === 0) this.log(flags.json ? '[]' : `no external capability providers registered (store: ${supervisor.storePath()})`)
        return
      }
      case 'status': {
        if (id === undefined) this.error('usage: aek external status <id>')
        const row = await supervisor.status(id)
        if (row === null) this.error(`no such provider '${id}'`)
        const health = row.state === 'running' ? await supervisor.health(id) : null
        const body = {
          id,
          state: row.state,
          pid: row.pid ?? null,
          startedBy: row.startedBy ?? null,
          pin: row.pin ?? null,
          installPolicy: row.installPolicy ?? null,
          spdx: row.declared.spdx ?? null,
          source: row.declared.source ?? null,
          health: health?.detail ?? null,
        }
        this.log(JSON.stringify(body, null, 2))
        return
      }
      case 'describe': {
        if (id === undefined) this.error('usage: aek external describe <id>')
        const result = await supervisor.describe(id)
        this.log(JSON.stringify(result, null, 2))
        if (!result.ok) process.exitCode = 1
        return
      }
      case 'stop': {
        if (id === undefined) this.error('usage: aek external stop <id> --confirm')
        if (!flags.confirm) this.error('stop is a write operation: re-run with --confirm (attached/foreign instances are never killed)')
        const result = await supervisor.stop(id)
        this.log(JSON.stringify(result))
        if (!result.ok) process.exitCode = 1
        return
      }
      case 'register': {
        if (id === undefined || flags.descriptor === undefined || !flags.confirm) {
          this.error('usage: aek external register <id> --descriptor <json|@file> [--pin v] [--install-policy self|managed] --confirm')
        }
        let raw = flags.descriptor
        if (raw.startsWith('@')) {
          const file = raw.slice(1)
          if (file.length === 0) this.error('register: --descriptor @file needs a path')
          raw = readFileSync(file, 'utf8')
        }
        let declared: unknown
        try { declared = JSON.parse(raw) } catch { this.error('register: --descriptor is not valid JSON') }
        const extra: { pin?: string; installPolicy?: 'self' | 'managed' } = {}
        if (flags.pin !== undefined) extra.pin = flags.pin
        if (flags.installPolicy !== undefined) extra.installPolicy = flags.installPolicy === 'managed' ? 'managed' : 'self'
        const result = await supervisor.register(id, declared, extra)
        this.log(JSON.stringify(result))
        if (!result.ok) process.exitCode = 1
        return
      }
      default:
        this.error(`unknown action '${action}' — try: list, status, describe, stop, register`)
    }
  }
}
