#!/usr/bin/env node
/**
 * Inspect / operate the external capability provider registry.
 *
 * The registry is the host side of the process boundary: providers are
 * SEPARATE processes that self-describe with an `aek-capability/1`
 * descriptor; this script never reads provider internals, it only reports
 * the host's view (state, pid liveness, compliance lines).
 *
 *   node scripts/aek/external-capabilities.mjs                 # list + doctor (read-only, the default)
 *   node scripts/aek/external-capabilities.mjs list [--json]   # the registry
 *   node scripts/aek/external-capabilities.mjs describe <id>  # probe a live descriptor
 *   node scripts/aek/external-capabilities.mjs health <id>    # read-only liveness
 *   node scripts/aek/external-capabilities.mjs stop <id> --yes
 *   node scripts/aek/external-capabilities.mjs unregister <id> --yes
 *   node scripts/aek/external-capabilities.mjs register <id> --descriptor <json|@file> [--pin v] [--install-policy self|managed] --yes
 *
 * Without arguments the script only READS. Every mutating subcommand refuses
 * to run without `--yes` (repo rule: no-arg scripts are side-effect free).
 */
import { readFileSync } from 'node:fs'
import { CapabilitySupervisor } from '../../packages/aek/base/coraek/external-supervisor.mjs'

const USAGE = [
  'usage: node scripts/aek/external-capabilities.mjs [list|describe <id>|health <id>|stop <id> --yes|unregister <id> --yes|register <id> --descriptor <json|@file> [--pin v] [--install-policy self|managed] --yes]',
].join('\n')

/** Parse the argv tail into { cmd, id, flags }. No argument means `default`
 * (list + doctor, read-only). */
function parseArgs(argv) {
  const args = argv.slice(2)
  const cmd = args.length === 0 ? 'default' : args[0]
  const flags = { json: args.includes('--json'), yes: args.includes('--yes') }
  let id
  let descriptor
  let pin
  let installPolicy
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--json' || arg === '--yes') continue
    if (arg === '--descriptor') { descriptor = args[i + 1]; i += 1; continue }
    if (arg === '--pin') { pin = args[i + 1]; i += 1; continue }
    if (arg === '--install-policy') { installPolicy = args[i + 1]; i += 1; continue }
    if (id === undefined && !arg.startsWith('--')) id = arg
  }
  return { cmd, id, flags, descriptor, pin, installPolicy }
}

/** @returns a human failure with a non-zero exit code. */
function fail(message) {
  console.error(`external-capabilities: ${message}`)
  process.exitCode = 1
}

const { cmd, id, flags, descriptor, pin, installPolicy } = parseArgs(process.argv)
const supervisor = new CapabilitySupervisor()

/** Print the registry (the `list` body, shared with the no-arg default). */
async function printList() {
  const rows = await supervisor.statusAll()
  if (flags.json) {
    console.log(JSON.stringify(rows.map(row => ({
      id: row.id,
      state: row.state,
      pid: row.pid ?? null,
      startedBy: row.startedBy ?? null,
      pin: row.pin ?? null,
      installPolicy: row.installPolicy ?? null,
      spdx: row.declared.spdx ?? null,
      source: row.declared.source ?? null,
      compliance: CapabilitySupervisor.complianceLine(row),
    })), null, 2))
    return
  }
  if (rows.length === 0) {
    console.log(`no external capability providers registered (store: ${supervisor.storePath()})`)
  }
  for (const row of rows) {
    const liveness = row.state === 'running' && row.pid !== undefined
      ? (CapabilitySupervisor.isPidAlive(row.pid) ? 'alive' : 'DEAD (stale)')
      : '—'
    console.log(`${row.id.padEnd(20)} state=${row.state.padEnd(7)} pid=${String(row.pid ?? '-').padEnd(6)} ${liveness} ${row.startedBy !== undefined ? `startedBy=${row.startedBy}` : ''}`.trimEnd())
    console.log(`  ${CapabilitySupervisor.complianceLine(row)}`)
  }
}

/** Read-only health sweep over every registered provider. */
async function printDoctor() {
  const rows = await supervisor.statusAll()
  if (rows.length === 0) {
    console.log('nothing registered; nothing to doctor')
    return
  }
  for (const row of rows) {
    const health = await supervisor.health(row.id)
    console.log(`${row.id.padEnd(20)} ${health.healthy ? 'healthy' : 'UNHEALTHY'} — ${health.detail}`)
  }
}

switch (cmd) {
  case 'default':
    await printList()
    console.log('doctor:')
    await printDoctor()
    break

  case 'list':
    await printList()
    break

  case 'doctor':
    await printDoctor()
    break

  case 'describe': {
    if (id === undefined) fail(`describe needs an id\n${USAGE}`)
    const result = await supervisor.describe(id)
    if (result.ok === false) fail(result.problem ?? 'describe failed')
    console.log(JSON.stringify(result, null, 2))
    break
  }

  case 'health': {
    if (id === undefined) fail(`health needs an id\n${USAGE}`)
    const result = await supervisor.health(id)
    console.log(`${result.healthy ? 'healthy' : 'unhealthy'} — ${result.detail}`)
    process.exitCode = result.healthy ? 0 : 1
    break
  }

  case 'stop': {
    if (id === undefined) fail(`stop needs an id\n${USAGE}`)
    if (!flags.yes) { fail('stop is a write operation: re-run with --yes'); break }
    const result = await supervisor.stop(id)
    if (result.ok === false) fail(result.problem ?? `stop ${id} failed`)
    console.log(`${id}: ${result.state}`)
    break
  }

  case 'unregister': {
    if (id === undefined) fail(`unregister needs an id\n${USAGE}`)
    if (!flags.yes) { fail('unregister is a write operation: re-run with --yes'); break }
    const result = await supervisor.unregister(id)
    if (result.ok === false) fail(result.problem ?? `unregister ${id} failed`)
    console.log(`${id}: ${result.state ?? 'removed'}`)
    break
  }

  case 'register': {
    if (id === undefined || descriptor === undefined) fail(`register needs <id> and --descriptor <json|@file>\n${USAGE}`)
    if (!flags.yes) { fail('register is a write operation: re-run with --yes'); break }
    const raw = descriptor.startsWith('@')
      ? readFileSync(descriptor.slice(1), 'utf8')
      : descriptor
    let declared
    try {
      declared = JSON.parse(raw)
    } catch (cause) {
      fail(`--descriptor is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`)
      break
    }
    const result = await supervisor.register(id, declared, { pin, installPolicy })
    if (result.ok === false) fail(result.problems?.join('; ') ?? 'registration failed')
    console.log(`${id}: registered (installPolicy=${installPolicy ?? 'self'})`)
    break
  }

  default:
    fail(`unknown command '${cmd}'\n${USAGE}`)
}
