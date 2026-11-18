#!/usr/bin/env node
/**
 * close-next.mjs — close the AEK Next instances the AI opened during a dev
 * round (S9, 2026-11-18).
 *
 * Scope (deliberate): ONLY what the AI/dev tooling opens for the next slot:
 *   - the next-slot backend on 1687 (spawned by launch.mjs / dev-web /
 *     serve-slot — command lines carry the `~/.aek/next/` data root or the
 *     `--port 1687` marker);
 *   - the next-slot DEV shell (`<next home>/dev/AEK Next.app`, CDP 1688 —
 *     spawned by the dev-web flow);
 *   - the slot-lock pids of the next slot.
 * The PRODUCTION install (`~/Applications/AEK Next.app`, opened by the user
 * from Finder/Spotlight without any CDP flag) is NEVER in the kill set —
 * it carries no data-root / port / CDP marker — so the one-instance rule and
 * the user's own running prod shell are preserved.
 *
 * Gate: the `autoCloseNext` switch (S9) in `<slot home>/ai-release.json`
 * (default: the current slot's home, i.e. the switch the running console
 * shows; `--gate next` reads the next slot's own file). `--yes` refuses to
 * kill anything when the gate is OFF; the default call (no `--yes`) is a
 * read-only report and never kills regardless of the gate.
 *
 * Where the release chains already cover this: `release.mjs --yes` and
 * `dev-cycle.mjs run` end with `slots.mjs --stop-all` + `--only aek`,
 * which SIGTERMs both slots' owned processes — so a FULL close-out never
 * leaves next instances. This script's value is the DEV-ONLY path: an AI
 * round that develops + verifies on the next slot but does not release in
 * that round. Run it at the end of such a round (the AI does, when the
 * switch is ON).
 *
 * LaunchAgent note: if the next slot's LaunchAgent
 * (`com.cheezmil.aek.web.next`) is loaded, launchd's KeepAlive respawns the
 * backend after the SIGTERM. The full close-out chains uninstall it first;
 * this script only WARNS and points at `service.mjs uninstall next --yes`
 * (an operator/system-level step, never automated here).
 *
 * Safety conventions (repo-wide):
 *   - no-args = read-only report, zero side effects, exit 0;
 *   - every kill requires an explicit `--yes`;
 *   - SIGTERM only (graceful), bounded wait; a stuck pid is reported,
 *     never escalated to SIGKILL;
 *   - foreign port squatters are reported, left alone;
 *   - no hardcoded paths (slot homes come from the coraek slot manifest).
 *
 * Usage:
 *   node scripts/aek/close-next.mjs                 # report (read-only)
 *   node scripts/aek/close-next.mjs --json          # machine readable
 *   node scripts/aek/close-next.mjs --yes           # close (gate: autoCloseNext)
 *   node scripts/aek/close-next.mjs --gate next --yes
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { SLOTS, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { aiReleasePath, readAiRelease } from '../../packages/aek/base/coraek/ai-release.mjs'
import { killSlot, slotOwnedPids, slotProcesses } from './shared-logic.mjs'

const TARGET_SLOT = 'next'
const argv = process.argv.slice(2)
const YES = argv.includes('--yes')
const JSON_OUT = argv.includes('--json')
const gateIdx = argv.indexOf('--gate')
const gateSlot = gateIdx !== -1 ? argv[gateIdx + 1] : 'aek'
if (!SLOTS[gateSlot]) {
  console.error(`unknown --gate slot: ${gateSlot} (expected ${Object.keys(SLOTS).join(' | ')})`)
  process.exit(2)
}

/** The next slot's LaunchAgent label (same convention as service.mjs). */
function nextAgentLabel() {
  return `com.cheezmil.aek.web.${TARGET_SLOT}`
}

/** Is the target slot's LaunchAgent loaded in this GUI session? */
function agentLoaded() {
  if (process.platform === 'win32') return { loaded: false, state: 'n/a (windows)' }
  try {
    const out = execFileSync('launchctl', ['print', `gui/${process.getuid()}/${nextAgentLabel()}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return { loaded: true, state: out.match(/state = (\w+)/)?.[1] ?? 'unknown' }
  } catch {
    return { loaded: false, state: 'not loaded' }
  }
}

// ── enumerate (read-only) ───────────────────────────────────────────────────

// The dev-web / dev-shell LAUNCHER chain the AI opens:
//   `bash -c … launch.mjs --slot next web` → `launch.mjs` → `aek.mjs web --port
//   1687` → tsx → `bin.js web --port 1687`. `slotOwnedPids` only sees the
//   PORT LISTENER (the leaf `bin.js`); its launcher ancestors carry no
//   listen-socket marker, so killing the leaf alone lets the parent `launch.mjs`
//   respawn it. Expand the kill set up the ancestor chain while each ancestor's
//   command line carries a next-slot launcher marker, stopping at the FIRST
//   ancestor that does not (that boundary is the operator/harness — never kill
//   it). Bounded: ≤ 20 hops and never above pid 1.
const NEXT_LAUNCH_MARKERS = [
  `--slot ${TARGET_SLOT}`,
  `--port ${SLOTS[TARGET_SLOT].webPort}`,
  `--trusted-host ${SLOTS[TARGET_SLOT].webHost}`,
  `--remote-debugging-port=${SLOTS[TARGET_SLOT].cdpPort}`,
]

/** `ps -p <pid> -o ppid=,command=` → `{ ppid, cmd }`, or null when gone. */
function psLink(pid) {
  try {
    const raw = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'ppid=,command='], {
      encoding: 'utf8',
    }).trim()
    const space = raw.indexOf(' ')
    if (space < 0) return null
    return { ppid: Number(raw.slice(0, space)), cmd: raw.slice(space + 1) }
  } catch {
    return null
  }
}

/**
 * The launcher ancestors to kill WITH the owned leaves. For each seed pid
 * walk up the ppid chain; collect every ancestor whose command line carries a
 * next-slot launcher marker, stopping at the first non-matching ancestor
 * (the operator / harness boundary). Returns them top-most-first so the root
 * launcher is signalled before its children (no mid-kill respawn).
 * @param {number[]} seedPids
 * @returns {number[]}
 */
function launcherChainAncestors(seedPids) {
  const extra = new Set()
  for (const seed of seedPids) {
    let pid = seed
    for (let depth = 0; depth < 20; depth++) {
      const link = psLink(pid)
      if (!link || !Number.isInteger(link.ppid) || link.ppid <= 1) break
      if (!NEXT_LAUNCH_MARKERS.some((m) => link.cmd.includes(m))) break
      extra.add(link.ppid)
      pid = link.ppid
    }
  }
  // Sequential dev-web spawn assigns rising pids down the chain, so ascending
  // pid order = top-most-first in the common case (signal the root launcher
  // before its children → no mid-kill respawn). SIGTERM is graceful and
  // idempotent, so a rare out-of-order pid is still safe.
  return [...extra].sort((a, b) => a - b)
}

const gateHome = slotHome(gateSlot)
const gate = readAiRelease(gateHome)
const owned = process.platform === 'win32' ? [] : slotOwnedPids(TARGET_SLOT)
const { foreign } = process.platform === 'win32' ? { foreign: [] } : slotProcesses(TARGET_SLOT)
const agent = agentLoaded()
// The full close set: the owned port-listener leaves + the launcher ancestors
// that would respawn them.
const chainPids = owned.length ? launcherChainAncestors(owned) : []
const killSet = [...new Set([...chainPids, ...owned])]

const report = {
  slot: TARGET_SLOT,
  gate: {
    slot: gateSlot,
    file: aiReleasePath(gateHome),
    autoCloseNext: gate.autoCloseNext,
    aiReleaseAllowed: gate.allowed,
  },
  ownedPids: owned,
  launcherChain: chainPids,
  killSet,
  foreignHolders: foreign,
  nextAgent: agent,
  action: 'pending',
}

function describe(r) {
  return [
    `close-next: slot=${TARGET_SLOT} (report only — add --yes to close)`,
    `  gate: ${r.gate.file} → autoCloseNext=${String(r.gate.autoCloseNext)}${r.gate.autoCloseNext ? '' : ' (OFF: --yes will REFUSE to kill)'}`,
    `  next-slot owned pids: ${r.ownedPids.length ? r.ownedPids.join(' ') : '(none running)'}`,
    r.launcherChain.length
      ? `  launcher chain (would also close, top-first): ${r.launcherChain.join(' ')}`
      : null,
    r.foreignHolders.length
      ? `  foreign holders (left alone): ${r.foreignHolders.map((f) => `${f.kind} :${f.port} pid ${f.pid}`).join(', ')}`
      : null,
    `  next LaunchAgent: ${r.nextAgent.loaded ? `loaded (${r.nextAgent.state})` : 'not loaded'}`,
  ].filter(Boolean).join('\n')
}

if (process.platform === 'win32') {
  console.log('close-next: this platform is not supported (POSIX ps/launchctl based); skipped.')
  process.exit(0)
}

if (!YES) {
  if (JSON_OUT) {
    console.log(JSON.stringify({ ...report, action: 'report-only' }, null, 2))
  } else {
    console.log(describe(report))
  }
  process.exit(0)
}

// ── the gated kill ──────────────────────────────────────────────────────────
if (gate.autoCloseNext !== true) {
  report.action = 'refused'
  console.error(
    `[close-next] REFUSED: autoCloseNext is OFF in ${report.gate.file} — leaving the ` +
      `AEK Next instances running for the operator. Flip the switch in the console ` +
      `(or write autoCloseNext: true) and retry, or run the full close-out ` +
      `(` + 'dev-cycle.mjs run' + ' / ' + 'release.mjs' + ') instead.',
  )
  if (JSON_OUT) console.log(JSON.stringify(report, null, 2))
  process.exit(1)
}

if (killSet.length === 0) {
  report.action = 'nothing-to-close'
  console.log('[close-next] gate ON, but no next-slot owned instances are running — nothing to close.')
  if (JSON_OUT) console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

// Close the launcher ancestors FIRST (top-most first, already sorted), so the
// parent `launch.mjs` / `bash` chain cannot respawn the leaf mid-kill. A
// graceful SIGTERM to the ancestors; a process that survives is left for the
// operator (no SIGKILL escalation, matching killSlot's posture).
const chainKilled = []
const chainStuck = []
if (chainPids.length) {
  for (const pid of chainPids) {
    try {
      process.kill(pid, 'SIGTERM')
      chainKilled.push(pid)
    } catch {
      continue // vanished or not ours — report it, never escalate
    }
  }
  // Bounded settle: give the ancestors a moment to tear their children down.
  await new Promise((r) => setTimeout(r, 500))
  for (const pid of chainKilled) {
    try {
      process.kill(pid, 0) // 0 = liveness probe, no signal sent
      chainStuck.push(pid)
      chainKilled.splice(chainKilled.indexOf(pid), 1)
    } catch {
      /* exited as expected */
    }
  }
}

const result = await killSlot(TARGET_SLOT)
report.action = 'closed'
report.killed = [...chainKilled, ...result.killed]
report.stuck = [...chainStuck, ...result.stuck]
if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(
    [
      `[close-next] gate ON → closed ${report.killed.length} pid(s): ${report.killed.join(' ') || '(none)'}${chainPids.length ? ` (incl. launcher chain ${chainPids.join(' ')})` : ''}`,
      report.stuck.length
        ? `[close-next] STUCK after SIGTERM: ${report.stuck.join(' ')} (check manually; no SIGKILL escalation)`
        : null,
      result.foreign.length
        ? `[close-next] FOREIGN holders left alone: ${result.foreign.map((f) => `${f.kind} :${f.port} pid ${f.pid}`).join(', ')}`
        : null,
      agent.loaded
        ? `[close-next] WARNING: the next LaunchAgent is loaded (KeepAlive) — launchd may respawn the backend. To stop that: ${'service.mjs'} uninstall ${TARGET_SLOT} --yes`
        : null,
    ].filter(Boolean).join('\n'),
  )
}
process.exit(result.ok ? 0 : 1)
