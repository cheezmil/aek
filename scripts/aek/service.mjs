#!/usr/bin/env node
/**
 * Install / remove the per-slot backend LaunchAgent.
 *
 * Why this exists: `AEK.app` is a client-only Electron shell. Clicking it in
 * Spotlight or Finder does not start a backend, so without one the window opens
 * on the "Reconnecting…" page. The agent runs `serve-slot.mjs --serve`, which
 * keeps this slot's web server alive (and steps aside when another session
 * already owns the port).
 *
 * Default (no arguments) is a READ-ONLY status report: it writes nothing to
 * disk and never talks to launchd beyond `print` / `list`.
 * Installing or removing requires `--yes`.
 *
 * Usage:
 *   node scripts/aek/service.mjs                          # status (read-only)
 *   node scripts/aek/service.mjs status [aek|next]
 *   node scripts/aek/service.mjs install <aek|next|all> --yes
 *   node scripts/aek/service.mjs uninstall <aek|next|all> --yes
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS, slotConfig, slotHome, slotWebUp } from './shared-logic.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SCRIPT_DIR, '..', '..')
const SERVE_SCRIPT = join(SCRIPT_DIR, 'serve-slot.mjs')
const AGENTS_DIR = join(homedir(), 'Library', 'LaunchAgents')

const USAGE = `AEK backend service (per-user LaunchAgent)

  service.mjs                             status for both slots (read-only)
  service.mjs status <aek|next>            status for one slot
  service.mjs install <aek|next|all> --yes  keep the slot backend running at login
  service.mjs uninstall <aek|next|all> --yes
                                    remove the agent (the app then needs a
                                    manually started backend again)`

/**
 * @param slot - 'aek' | 'next'.
 * @returns {string} the LaunchAgent label for that slot.
 */
function labelFor(slot) {
  return `com.cheezmil.aek.web.${slot}`
}

/**
 * @param slot - 'aek' | 'next'.
 * @returns {string} absolute path of the slot's plist.
 */
function plistPathFor(slot) {
  return join(AGENTS_DIR, `${labelFor(slot)}.plist`)
}

/**
 * Is this agent loaded in the current GUI session?
 * @param slot - 'aek' | 'next'.
 * @returns {{ loaded: boolean, state: string }} launchd's view.
 */
function agentState(slot) {
  try {
    const out = execFileSync('launchctl', ['print', `gui/${String(process.getuid())}/${labelFor(slot)}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return { loaded: true, state: out.match(/state = (\w+)/)?.[1] ?? 'unknown' }
  } catch {
    return { loaded: false, state: 'not loaded' }
  }
}

/**
 * Render the plist for a slot.
 * @param slot - 'aek' | 'next'.
 * @returns {string} the plist XML.
 */
function plistFor(slot) {
  const home = slotHome(slot)
  const logs = join(home, 'logs')
  // launchd starts agents with a minimal PATH. `dshBin()` is reached through
  // `#!/usr/bin/env node`, so node has to be findable.
  const path = [
    dirname(process.execPath),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].join(':')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${labelFor(slot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${SERVE_SCRIPT}</string>
    <string>--slot</string>
    <string>${slot}</string>
    <string>--serve</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${path}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>${join(logs, 'web.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(logs, 'web.err.log')}</string>
</dict>
</plist>
`
}

/**
 * Print one slot's state.
 * @param slot - 'aek' | 'next'.
 */
function printStatus(slot) {
  const cfg = slotConfig(slot)
  const plist = plistPathFor(slot)
  const agent = agentState(slot)
  console.log(`\n[${slot}] ${cfg.productName}  port ${cfg.webPort}`)
  console.log(`  plist    ${existsSync(plist) ? 'present' : 'absent '}  ${plist}`)
  console.log(`  agent    ${agent.loaded ? `loaded (${agent.state})` : 'not loaded'}`)
  console.log(`  backend  ${slotWebUp(slot) ? 'UP' : 'down'}`)
}

const [command = 'status', ...rest] = process.argv.slice(2)
const args = rest.filter(a => a !== '--yes')
const confirmed = rest.includes('--yes')

/**
 * Expand `<slot|all>` into slot names.
 * @param target - the argument as typed.
 * @returns {string[]} slot names.
 */
function expandSlots(target) {
  if (target === 'all') return Object.keys(SLOTS)
  if (target && SLOTS[target]) return [target]
  return []
}

if (command === 'status') {
  const names = expandSlots(args[0])
  for (const slot of names.length > 0 ? names : Object.keys(SLOTS)) printStatus(slot)
  console.log('')
  process.exit(0)
}

if (command !== 'install' && command !== 'uninstall') {
  console.error(USAGE)
  process.exit(2)
}

const slots = expandSlots(args[0] ?? 'all')
if (slots.length === 0) {
  console.error(`unknown slot: ${args[0] ?? '(none)'} — expected one of ${Object.keys(SLOTS).join(', ')}, or "all"`)
  process.exit(2)
}
if (!confirmed) {
  console.error(`"${command}" changes what runs at login. Re-run with --yes to confirm.`)
  process.exit(2)
}

const uid = String(process.getuid())

for (const slot of slots) {
  const plist = plistPathFor(slot)
  // Always unload first so a changed plist is picked up.
  try {
    execFileSync('launchctl', ['bootout', `gui/${uid}/${labelFor(slot)}`], { stdio: 'ignore' })
  } catch { /* not loaded — fine */ }

  if (command === 'uninstall') {
    if (existsSync(plist)) rmSync(plist, { force: true })
    console.log(`[service] ${slot}: agent removed`)
    continue
  }

  mkdirSync(AGENTS_DIR, { recursive: true })
  mkdirSync(join(slotHome(slot), 'logs'), { recursive: true })
  writeFileSync(plist, plistFor(slot))
  try {
    execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plist], { stdio: 'inherit' })
    console.log(`[service] ${slot}: agent installed (${labelFor(slot)})`)
  } catch (err) {
    console.error(`[service] ${slot}: bootstrap failed — ${String(err.message).split('\n')[0]}`)
    console.error(`[service] the plist is in place; load it with: launchctl bootstrap gui/${uid} "${plist}"`)
  }
}

for (const slot of slots) printStatus(slot)
