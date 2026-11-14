/**
 * `aek runtime` — operator face for the SELECTIVE runtime-mode choice.
 *
 * A TS/JS AEK capability (class ①) defaults to `share` (in-process on the
 * shared coraek Node runtime — the memory-lean default). The operator can
 * selectively switch one to `isolate` (its own process, speaking
 * `aek-capability/1` under the external supervisor). Strong-copyleft (②) and
 * native (③) capabilities are `isolate`-only and cannot be switched back.
 *
 * Read-only by default; the writes (`set`, `create`, `remove`) require
 * `--confirm`, mirroring the CLI analogue of the console's confirmation rule.
 * The deep decision lives in `@cheezmil/coraek/runtime`; this command is a
 * thin operator face.
 *
 * Actions:
 *   list [--memory]               stored choices + registered providers, with
 *                                  mode + reason; `--memory` adds the numbered
 *                                  runtime view with the isolated runtimes'
 *                                  live process RSS (host-runtime memory is
 *                                  only readable by the host process itself —
 *                                  the console's "运行时与内存" section shows it)
 *   status <id>                   one capability: stored choice, effective mode, reason
 *   set <id> share|isolate --confirm   persist the operator's selective choice
 *   create <id> --confirm         alias of `set <id> isolate` (validates the
 *                                  capability supports a spawnable isolate bin)
 *   remove <id> --confirm         stop the isolated process (best effort) and
 *                                  move the capability back to the shared host
 *
 * @module @cheezmil/coraek/commands/runtime
 */

import { Command } from '@oclif/core'
import { readFileSync } from 'node:fs'
import {
  RUNTIME_MODES,
  isStrongCopyleft,
  readRuntimeModes,
  writeRuntimeMode,
  resolveRuntimeMode,
  hasExternalManifest,
  effectiveModes,
} from '../../runtime.mjs'
import { runtimesSnapshot, processRss } from '../../runtimes.mjs'
import { resolveAekHome } from '../../home.mjs'
import { findAekPackageDirs } from '../../plugin-meta.mjs'
import { CapabilitySupervisor } from '../../external-supervisor.mjs'

interface RuntimeFlags {
  confirm: boolean
  json: boolean
  memory: boolean
}

/** Parse the raw argv tokens (after the command id) into action + positionals + flags. */
function parseRuntime(argv: string[]): { action: string; id: string | undefined; mode: string | undefined; flags: RuntimeFlags } {
  const positionals: string[] = []
  const flags: RuntimeFlags = { confirm: false, json: false, memory: false }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === undefined) continue
    if (token === '--confirm') { flags.confirm = true; continue }
    if (token === '--json') { flags.json = true; continue }
    if (token === '--memory') { flags.memory = true; continue }
    if (token.startsWith('--')) continue // unknown flag: ignore, stay permissive
    positionals.push(token)
  }
  return { action: positionals[0] ?? 'list', id: positionals[1], mode: positionals[2], flags }
}

/**
 * Best-effort local capability manifest lookup by id. In a dev checkout the
 * operator runs from the repo root, so `packages/aek/**` is discoverable; in an
 * installed context this yields an empty map and the operator's choice is
 * trusted (the host validates at spawn time).
 * @returns a Map of capability id → parsed package.json.
 */
function localManifests(): Map<string, Record<string, unknown>> {
  const root = process.cwd()
  const byId = new Map<string, Record<string, unknown>>()
  for (const dir of findAekPackageDirs(root)) {
    const id = dir.split('/').at(-1)
    if (id === undefined) continue
    try {
      byId.set(id, JSON.parse(readFileSync(`${root}/${dir}/package.json`, 'utf8')) as Record<string, unknown>)
    } catch { /* absent / unreadable */ }
  }
  return byId
}

type Reason = 'license-forced' | 'runtime-forced' | 'user-select' | 'default-share'

export default class RuntimeCommand extends Command {
  static override description = 'Selectively choose the runtime topology for a capability (share in-process vs isolate in its own process)'

  static override examples = [
    '<%= config.bin %> runtime list',
    '<%= config.bin %> runtime list --memory',
    '<%= config.bin %> runtime status <id>',
    '<%= config.bin %> runtime set <id> isolate --confirm',
    '<%= config.bin %> runtime create <id> --confirm',
    '<%= config.bin %> runtime remove <id> --confirm',
  ]

  /** Forward unknown flags verbatim; we parse our own argv. */
  static override strict = false

  override async run(): Promise<void> {
    const argv = this.argv.filter(token => token !== 'runtime')
    const { action, id, mode, flags } = parseRuntime(argv)
    const aekHome = resolveAekHome()
    const stored = readRuntimeModes(aekHome)
    const manifests = localManifests()
    const supervisor = new CapabilitySupervisor()
    const providers = await supervisor.list()

    const effectiveFor = (capabilityId: string): { mode: 'share' | 'isolate'; forced: boolean; reason: Reason } => {
      const manifest = manifests.get(capabilityId)
      if (manifest !== undefined && hasExternalManifest(manifest)) {
        // ②/③ by construction: isolate-only, never switchable.
        return resolveRuntimeMode({ manifest })
      }
      if (manifest !== undefined && manifest.aek !== null && typeof manifest.aek === 'object' && (manifest.aek as Record<string, unknown>).runtime !== undefined && (manifest.aek as Record<string, unknown>).runtime !== null) {
        // Class ① with a runtime block: user-select always, even when a
        // runtime-boot registration also sits in the provider registry —
        // that registration is the isolate TOPOLOGY, not a license/runtime
        // forcing, so `share` must stay reachable.
        const input: { manifest?: Record<string, unknown>; storedMode?: string } = {}
        input.manifest = manifest
        const storedMode = stored[capabilityId]
        if (storedMode !== undefined) input.storedMode = storedMode
        return resolveRuntimeMode(input)
      }
      const provider = providers[capabilityId]
      if (provider !== undefined) {
        const spdx = provider.declared?.spdx
        return { mode: 'isolate', forced: true, reason: isStrongCopyleft(spdx) ? 'license-forced' : 'runtime-forced' }
      }
      // exactOptionalPropertyTypes: build the input conditionally so no
      // property is ever passed an explicit `undefined`.
      const input: { manifest?: Record<string, unknown>; storedMode?: string } = {}
      if (manifest !== undefined) input.manifest = manifest
      const storedMode = stored[capabilityId]
      if (storedMode !== undefined) input.storedMode = storedMode
      return resolveRuntimeMode(input)
    }

    switch (action) {
      case 'list': {
        const ids = new Set<string>([...Object.keys(stored), ...Object.keys(providers)])
        if (ids.size === 0 && !flags.memory) {
          this.log(flags.json
            ? '[]'
            : `no runtime-mode choices stored yet (store: ${resolveAekHome()}/runtime-modes.json) — class ① capabilities default to share`)
          return
        }
        for (const capabilityId of [...ids].sort()) {
          const eff = effectiveFor(capabilityId)
          const line = `${capabilityId.padEnd(24)} mode=${eff.mode.padEnd(7)} ${eff.reason}${eff.forced ? ' (forced)' : ''}`
          this.log(flags.json ? JSON.stringify({ id: capabilityId, stored: stored[capabilityId] ?? null, ...eff }) : line)
        }
        if (flags.memory) {
          this.log(flags.json ? '' : 'runtimes (numbered):')
          const snapshot = runtimesSnapshot({
            aekHome,
            packages: [...manifests.entries()].map(([pkgId, manifest]) => ({ id: pkgId, manifest })),
            supervisorRows: await supervisor.statusAll().then(rows => rows as { id: string; state: string; pid?: number }[]),
          })
          const fmt = (bytes?: number) => (bytes === undefined ? '—' : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
          const host = snapshot.host
          // The CLI process is NOT the host runtime: only the host process can
          // read its own total memory (the console's section shows it). The
          // isolated rows are live: their pids live in the shared store.
          const hostLine = `  ${String(host.number).padStart(2)} ${host.label.padEnd(24)} shared-host rss/host-total=console-only plugins=[${host.plugins.join(', ')}]`
          this.log(flags.json ? JSON.stringify(host) : hostLine)
          for (const row of snapshot.runtimes) {
            const rss = row.pid !== null ? processRss(row.pid) : undefined
            const rowLine = `  ${String(row.number).padStart(2)} ${row.label.padEnd(24)} ${row.memoryCaliber} state=${row.state} rss=${fmt(rss ?? row.memory?.rss)} plugins=[${row.plugins.join(', ')}]`
            this.log(flags.json ? JSON.stringify(row) : rowLine)
          }
          if (snapshot.runtimes.length === 0) {
            this.log(flags.json ? '' : '  (no isolated runtimes yet — class ① capabilities default to the shared host)')
          }
        }
        return
      }
      case 'status': {
        if (id === undefined) this.error('usage: aek runtime status <id>')
        const eff = effectiveFor(id)
        const body = {
          id,
          stored: stored[id] ?? null,
          mode: eff.mode,
          forced: eff.forced,
          reason: eff.reason,
          supportsIsolate: (() => {
            const manifest = manifests.get(id)
            return manifest !== undefined ? effectiveModes(manifest).canIsolate : true
          })(),
        }
        this.log(JSON.stringify(body, null, 2))
        return
      }
      case 'set': {
        if (id === undefined || mode === undefined) this.error('usage: aek runtime set <id> share|isolate --confirm')
        if (!RUNTIME_MODES.includes(mode as 'share' | 'isolate')) this.error(`mode must be one of ${JSON.stringify(RUNTIME_MODES)} (got '${mode}')`)
        const eff = effectiveFor(id)
        if (eff.forced && mode === 'share') {
          this.error(`cannot set '${id}' to share — it is ${eff.reason} (strong-copyleft / native capabilities are isolate-only)`)
        }
        const manifest = manifests.get(id)
        if (manifest !== undefined && mode === 'isolate' && !effectiveModes(manifest).canIsolate) {
          this.error(`cannot set '${id}' to isolate — the capability does not declare a spawnable aek.runtime.isolate.bin`)
        }
        if (!flags.confirm) this.error('set is a write operation: re-run with --confirm')
        const result = writeRuntimeMode(aekHome, id, mode as 'share' | 'isolate')
        this.log(JSON.stringify(result))
        if (!result.ok) process.exitCode = 1
        return
      }
      case 'create': {
        // Alias of `set <id> isolate --confirm` with the isolatable validation
        // made explicit: it persists the user-select choice. The process itself
        // spawns under the host's supervisor at the next host boot, or LIVE
        // through the console's "新增运行时" action — a CLI-side spawn would
        // create a second, host-untracked supervisor instance (never do that).
        if (id === undefined) this.error('usage: aek runtime create <id> --confirm')
        const manifest = manifests.get(id)
        if (manifest !== undefined && !effectiveModes(manifest).canIsolate) {
          this.error(`cannot create — '${id}' does not declare a spawnable aek.runtime.isolate.bin`)
        }
        if (!flags.confirm) this.error('create is a write operation: re-run with --confirm')
        const result = writeRuntimeMode(aekHome, id, 'isolate')
        this.log(flags.json
          ? JSON.stringify(result)
          : `${result.ok ? 'created (choice persisted) ' : 'FAILED '}— '${id}' will run in its own process at the next host boot, or immediately via the console's "add runtime" action`)
        if (!result.ok) process.exitCode = 1
        return
      }
      case 'remove': {
        // Stop the isolated process (best effort: the shared on-disk store
        // carries the pid, so a signal reaches the host-spawned child) and
        // move the capability back to the shared host runtime.
        if (id === undefined) this.error('usage: aek runtime remove <id> --confirm')
        if (!flags.confirm) this.error('remove is a write operation: re-run with --confirm')
        const stop = await supervisor.stop(id)
        const result = writeRuntimeMode(aekHome, id, 'share')
        this.log(flags.json
          ? JSON.stringify({ stop, persist: result })
          : `removed — '${id}' is back on the shared host runtime (process stop ${stop.ok ? 'ok' : 'skipped/failed'})`)
        if (!result.ok) process.exitCode = 1
        return
      }
      default:
        this.error(`unknown action '${action}' — try: list, status, set, create, remove`)
    }
  }
}
