#!/usr/bin/env node
/**
 * AEK slot switching — one command to decide which instances are running.
 *
 * Two equal apps share one source tree: `AEK` (slot `aek`) and `AEK Next`
 * (slot `next`). The runtime arbiter owns the lifecycle; this script is the
 * operator-facing way to drive it.
 *
 * SAFETY: the default is `--check`, which is a true dry run — it prints what
 * WOULD happen and changes nothing. Every state change (`--only`, `--both`,
 * `--stop-all`, `--warm`) requires an explicit `--yes`.
 *
 * The switch is a BOTH transition: the target slot is brought up and health
 * checked FIRST, and only then is the old one stopped with SIGTERM. That
 * follows the "prepare and verify the new resource before removing the old
 * one" rule — a failed start never leaves the user with nothing running.
 *
 * Usage:
 *   node scripts/aek/slots.mjs                          # check (read-only)
 *   node scripts/aek/slots.mjs --check                   # same
 *   node scripts/aek/slots.mjs --only next --yes         # run only AEK Next
 *   node scripts/aek/slots.mjs --both --yes              # run both
 *   node scripts/aek/slots.mjs --stop-all --yes          # stop everything
 *   node scripts/aek/slots.mjs --warm next --yes         # warm a slot headlessly
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS, slotConfig, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { readSlotLock, isPidAlive } from '../../packages/aek/base/coraek/slot-lock.mjs'
import { buildFingerprint, isBuildFresh, slotWebUp } from './shared-logic.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

const USAGE = `AEK slot switching

  slots.mjs                          check (read-only, no side effects)
  slots.mjs --check                  same
  slots.mjs --only <aek|next> --yes  run only that slot
  slots.mjs --both --yes             run both slots
  slots.mjs --stop-all --yes         stop both slots
  slots.mjs --warm <aek|next> --yes  keep a slot warm without a window

Slots: ${Object.keys(SLOTS).join(' | ')}`

// ── Arguments ────────────────────────────────────────────────────────────────

/** @type {Record<string, string | boolean>} */
const options = {}
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i]
  if (!token.startsWith('--')) continue
  const key = token.slice(2)
  const next = process.argv[i + 1]
  if (next !== undefined && !next.startsWith('--')) {
    options[key] = next
    i++
  } else {
    options[key] = true
  }
}

/**
 * Validate a slot name.
 * @param {unknown} value - the candidate slot.
 * @returns {'aek' | 'next'} the validated slot.
 */
function requireSlot(value) {
  if (typeof value !== 'string' || !SLOTS[value]) {
    throw new Error(`expected a slot name (${Object.keys(SLOTS).join(' | ')}), got ${String(value)}`)
  }
  return /** @type {'aek' | 'next'} */ (value)
}

// ── Inspection ────────────────────────────────────────────────────────────────

/**
 * Describe one slot's state.
 * @param {'aek' | 'next'} slot - the slot to describe.
 * @returns {{ slot: string, productName: string, home: string, webPort: number, webUp: boolean, shellPid: number | null, shellAlive: boolean, buildFresh: boolean }} the state.
 */
function slotState(slot) {
  const cfg = slotConfig(slot)
  const lock = readSlotLock(slot)
  const shellPid = lock?.shellPid ?? null
  return {
    slot,
    productName: cfg.productName,
    home: slotHome(slot),
    webPort: cfg.webPort,
    webUp: slotWebUp(slot),
    shellPid,
    shellAlive: isPidAlive(shellPid),
    buildFresh: isBuildFresh(slot),
  }
}

/**
 * Print the state table.
 * @returns {void}
 */
function printState() {
  const fingerprint = buildFingerprint()
  console.log(`build fingerprint  ${fingerprint}`)
  for (const slot of Object.keys(SLOTS)) {
    const s = slotState(/** @type {'aek' | 'next'} */ (slot))
    console.log('')
    console.log(`[${s.slot}] ${s.productName}`)
    console.log(`  data root     ${s.home}`)
    console.log(`  web ${String(s.webPort).padEnd(6)} ${s.webUp ? 'running' : 'stopped'}`)
    console.log(`  shell         ${s.shellAlive ? `running (pid ${String(s.shellPid)})` : 'stopped'}`)
    console.log(`  build         ${s.buildFresh ? 'fresh' : 'STALE (source changed since the last build)'}`)
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Run the arbiter.
 * @param {string[]} args - the arbiter arguments.
 * @returns {number} the exit code.
 */
function arbiter(args) {
  const result = spawnSync(process.execPath, [join(HERE, 'arbiter.mjs'), ...args], {
    encoding: 'utf8',
  })
  const out = (result.stdout ?? '').trim()
  if (out) console.log(out)
  if (result.stderr) console.error(result.stderr.trim())
  return result.status ?? 1
}

/**
 * Health-check a slot's web server.
 * @param {'aek' | 'next'} slot - the slot to check.
 * @returns {Promise<boolean>} true when the slot answers.
 */
async function healthy(slot) {
  const port = slotConfig(slot).webPort
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, 2000)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal })
      return response.status < 500
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return false
  }
}

/**
 * Wait until a slot's web server answers.
 * @param {'aek' | 'next'} slot - the slot to wait for.
 * @param {number} timeoutMs - how long to wait.
 * @returns {Promise<boolean>} true when it answered in time.
 */
async function waitHealthy(slot, timeoutMs = 25000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await healthy(slot)) return true
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

/**
 * Bring a slot up and wait for it to answer.
 * @param {'aek' | 'next'} slot - the slot to start.
 * @returns {Promise<boolean>} true when the slot is up.
 */
async function startAndVerify(slot) {
  arbiter(['start', slot])
  const ok = await waitHealthy(slot)
  if (!ok) {
    console.error(`[slots] slot "${slot}" did not become healthy — the old instance was NOT stopped`)
  }
  return ok
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

try {
  const wantsCheck = options.check === true || (
    options.only === undefined &&
    options.both === undefined &&
    options['stop-all'] === undefined &&
    options.warm === undefined
  )

  if (wantsCheck) {
    printState()
    console.log('')
    console.log(USAGE)
    console.log('')
    console.log('dry run: nothing executed, no files changed.')
    process.exit(0)
  }

  const mutating = options.only !== undefined || options.both === true ||
    options['stop-all'] === true || options.warm !== undefined
  if (!mutating) {
    console.log(USAGE)
    process.exit(0)
  }
  if (!options.yes) {
    console.error('[slots] refusing to change anything without --yes')
    console.error(USAGE)
    process.exit(2)
  }

  if (options['stop-all'] === true) {
    printState()
    console.log('')
    for (const slot of Object.keys(SLOTS)) {
      const s = slotState(/** @type {'aek' | 'next'} */ (slot))
      if (s.webUp || s.shellAlive) {
        console.log(`[slots] stopping ${s.productName}`)
        arbiter(['stop', slot])
      }
    }
    process.exit(0)
  }

  if (options.warm !== undefined) {
    const slot = requireSlot(options.warm)
    console.log(`[slots] warming ${slotConfig(slot).productName} (headless — no window, no Dock icon)`)
    // A headless warm start needs the shell to run without a window; the
    // arbiter starts the web server plus the shell, and the shell is told to
    // stay windowless through AEK_HEADLESS.
    const result = spawnSync(process.execPath, [
      join(HERE, 'arbiter.mjs'), 'start', slot, '--headless',
    ], { encoding: 'utf8' })
    if (result.stdout) console.log(result.stdout.trim())
    if (result.stderr) console.error(result.stderr.trim())
    process.exit(result.status ?? 1)
  }

  if (options.both === true) {
    // BOTH transition: start the missing ones FIRST and verify them, only
    // then stop anything. A failure leaves the current state intact.
    printState()
    console.log('')
    for (const slot of Object.keys(SLOTS)) {
      const s = slotState(/** @type {'aek' | 'next'} */ (slot))
      if (!s.webUp) {
        console.log(`[slots] starting ${s.productName}…`)
        if (!await startAndVerify(/** @type {'aek' | 'next'} */ (slot))) process.exit(3)
      }
    }
    console.log('[slots] both slots are up')
    process.exit(0)
  }

  // --only <slot>
  const target = requireSlot(options.only)
  const other = target === 'aek' ? 'next' : 'aek'
  printState()
  console.log('')

  const targetState = slotState(target)
  if (!targetState.webUp) {
    console.log(`[slots] starting ${targetState.productName}…`)
    if (!await startAndVerify(target)) process.exit(3)
  }

  const otherState = slotState(other)
  if (otherState.webUp || otherState.shellAlive) {
    console.log(`[slots] stopping ${otherState.productName}…`)
    arbiter(['stop', other])
  }
  console.log(`[slots] only ${slotConfig(target).productName} is running`)
  process.exit(0)
} catch (error) {
  console.error(`[slots] ${error instanceof Error ? error.message : String(error)}`)
  console.error(USAGE)
  process.exit(2)
}
