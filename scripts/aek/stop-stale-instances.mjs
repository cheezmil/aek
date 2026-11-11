#!/usr/bin/env node
/**
 * Stop AEK backend processes that still belong to a previous checkout path.
 *
 * After the repository folder is renamed, launchd's `bootout` stops the
 * supervisor, but an already-spawned web backend can be orphaned (PPID 1) and
 * keep the port bound. It was started with `--require` / `--import` paths into
 * the OLD directory, so Node resolves modules from a directory that no longer
 * exists: the shell still answers HTTP, but every plugin import fails. A fresh
 * supervisor cannot bind the port until the orphan exits — which is why a
 * plain rebuild appears to "fix nothing".
 *
 * Detection is layout-independent: processes whose command line references
 * `scripts/aek/serve-slot.mjs`, `apps/cli/lib/bin.js`, or a pnpm `tsx`
 * preflight under a checkout root are inspected, and any root that no longer
 * exists is considered stale. Nothing is inferred from a folder NAME.
 *
 * SAFETY: read-only by default (prints the stale PIDs). `--yes` sends SIGTERM
 * (never SIGKILL) and waits up to 10s for a graceful exit. It never touches
 * AEK.app / the desktop shell, and never starts a new instance.
 *
 * Usage:
 *   node scripts/aek/stop-stale-instances.mjs          # plan (read-only)
 *   node scripts/aek/stop-stale-instances.mjs --yes    # graceful stop
 *
 * @module scripts/aek/stop-stale-instances
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const APPLY = process.argv.includes('--yes')
const ME = process.pid
/** Only these AEK launcher entry points identify a checkout-relative process. */
const MARKER = 'scripts/aek/serve-slot\\.mjs|apps/cli/lib/bin\\.js|node_modules/\\.pnpm/tsx@'
/** Capture the checkout root that precedes one of the marker paths. */
const ROOT_IN_COMMAND = /(\/[^\s"']*?)\/(?:scripts\/aek\/serve-slot\.mjs|apps\/cli\/lib\/bin\.js|node_modules\/\.pnpm\/tsx@)/gu

/**
 * List stale AEK backend PIDs.
 * @returns {{ pid: number, root: string }[]}
 */
function staleProcesses() {
  let out
  try {
    out = execFileSync('pgrep', ['-fl', MARKER], { encoding: 'utf8' })
  } catch (error) {
    // pgrep exits 1 when nothing matches; other failures are real errors.
    if (error?.status === 1) return []
    throw error
  }
  /** @type {{ pid: number, root: string }[]} */
  const found = []
  for (const line of out.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/u.exec(line)
    if (match === null) continue
    const pid = Number(match[1])
    if (pid === ME || !Number.isFinite(pid)) continue
    for (const rootMatch of match[2].matchAll(ROOT_IN_COMMAND)) {
      const root = resolve(rootMatch[1])
      if (!existsSync(root)) {
        if (!found.some(item => item.pid === pid)) found.push({ pid, root })
        break
      }
    }
  }
  return found
}

/**
 * @param {number} pid
 * @returns {boolean} whether the process still exists.
 */
function alive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

const stale = staleProcesses()
if (stale.length === 0) {
  console.log('no stale AEK backend process found; nothing to stop.')
  process.exit(0)
}
for (const { pid, root } of stale) {
  console.log(`${APPLY ? 'STOP  ' : 'WOULD '} pid ${pid}  (checkout root no longer exists: ${root})`)
}
if (!APPLY) {
  console.log(`\nDry run: ${stale.length} stale process(es). Re-run with --yes to stop them gracefully.`)
  process.exit(0)
}

for (const { pid } of stale) {
  try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
}
const deadline = Date.now() + 10_000
while (Date.now() < deadline && stale.some(({ pid }) => alive(pid))) {
  execFileSync(process.execPath, ['-e', 'setTimeout(() => {}, 250)'], { stdio: 'ignore' })
}
const remaining = stale.filter(({ pid }) => alive(pid))
if (remaining.length > 0) {
  console.error(`still running after SIGTERM (no SIGKILL sent): ${remaining.map(({ pid }) => pid).join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`stopped ${stale.length} stale process(es) gracefully; the supervisor can now start a fresh backend.`)
}
