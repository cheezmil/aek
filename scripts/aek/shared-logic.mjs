/**
 * AEK Desktop — shared logic for start-dev.mjs and start-release.mjs.
 *
 * All path resolution is done relative to the project root (agent-enhance-kit/),
 * so these modules can be imported from any location in the repo.
 */
import { execSync, execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, dirname, basename } from 'node:path'
import { existsSync, renameSync, copyFileSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { resolveAekHome, resolveAekRoot } from '../../packages/aek/base/coraek/home.mjs'
import { SLOTS, slotConfig, slotHome, containerForHome, webUrl } from '../../packages/aek/base/coraek/slots.mjs'
import { readSlotLock, isPidAlive } from '../../packages/aek/base/coraek/slot-lock.mjs'
import { assertBuildIdentity } from './signing-identity.mjs'
import { assertBuildRules } from './verify-build-rules.mjs'

// The slot table (identity, ports, data root) lives in @cheezmil/coraek/slots —
// one source of truth shared by the desktop build, the desktop main process and
// these scripts. Re-exported here so existing importers keep working.
export { SLOTS, slotHome, slotConfig, containerForHome, resolveAekRoot }

// ── Root detection ────────────────────────────────────────────────────────────
// walk up from this file's location until we find pnpm-workspace.yaml (the repo root)
const HERE = dirname(fileURLToPath(import.meta.url))

/** Find the project root (agent-enhance-kit/) by walking up until pnpm-workspace.yaml */
function findProjectRoot() {
  let dir = HERE
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return HERE // fallback
}

// We need readFileSync — import it
import { readFileSync } from 'node:fs'

const PROJECT_ROOT = findProjectRoot()
export const APP_ROOT = join(PROJECT_ROOT, 'apps', 'aek-desktop', 'v0')

// ── Dual-tree layout (S round) ───────────────────────────────────────────────
/**
 * Derive the dev/stable tree pair from the git worktree structure — zero
 * hardcoding. The main worktree's .git is a DIRECTORY; a linked worktree's
 * .git is a FILE (`gitdir: <main>/.git/worktrees/<name>`). The stable tree
 * is the detached-HEAD linked worktree pinned to a release tag; the dev tree
 * is the main worktree.
 * @param {string} root - the tree the caller operates from.
 * @returns {{ dev: string, stable: string | null, operating: 'dev' | 'stable' }}
 *   `stable` is null when the layout is not dual-tree (single tree, or more
 *   than one detached linked worktree — pass an explicit override then).
 */
export function dualTreeLayout(root) {
  const dotgit = join(root, '.git')
  if (existsSync(dotgit) && !statSync(dotgit).isDirectory()) {
    // linked worktree: this tree is the stable one; the main worktree's path
    // is derivable from the .git gitdir file.
    const gd = readFileSync(dotgit, 'utf8').trim().replace(/^gitdir:\s*/, '')
    const mainGit = gd.replace(/(?:\/|\\)worktrees(?:\/|\\)[^/\\]+$/, '')
    return { dev: dirname(mainGit), stable: root, operating: 'stable' }
  }
  // main worktree: linked worktrees are the `detached` entries of `worktree list`.
  let stable = null
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' })
    const linked = []
    for (const block of out.split('\n\n').filter(Boolean)) {
      const lines = block.split('\n')
      if (lines.some((l) => l === 'detached')) linked.push(lines[0].replace(/^worktree /, ''))
    }
    if (linked.length === 1) stable = linked[0]
  } catch { /* not a git worktree layout */ }
  return { dev: root, stable, operating: 'dev' }
}

// ── Constants ─────────────────────────────────────────────────────────────────
// Ports are injected per slot by scripts/aek/launch.mjs (AEK 1685/1686, Next
// 1687/1688). When the env is unset (direct invocation / packaged app opened
// without the launcher) we fall back to the AEK defaults so the existing
// single-app flow keeps working.
export const WEB_PORT   = Number(process.env.AEK_WEB_PORT ?? 1685)
export const CDP_PORT   = Number(process.env.AEK_CDP_PORT ?? 1686)
// The dev bundle of the default slot wears the slot's public name (C1: the
// Dock/Finder must show `AEK.app`, never "AEK DEV"). It is only a fallback
// default; callers that know their slot pass `slotConfig(slot).devAppName`.
export const DEV_APP_NAME = 'AEK'

export const DSH_HOME   = resolveAekHome()
export const INSTALL_DIR = join(homedir(), 'Applications')

// ── Dual-app slots ─────────────────────────────────────────────────────────
// Two equal, named instances share one bundle (same app id, never swapped):
//   aek  → ~/.aek        web 1685 / cdp 1686
//   next → ~/.aek-next   web 1687 / cdp 1688
// scripts/aek/arbiter.mjs uses these to start/stop a whole instance (web + shell).
// The table itself comes from @cheezmil/coraek/slots (see the re-export above).

/**
 * Path to a slot's branded dev bundle.
 *
 * It deliberately does NOT live in ~/Applications next to the packaged app:
 * `devAppName` and `productName` are both "AEK" / "AEK Next", so branding a dev
 * shell there used to OVERWRITE the packaged bundle with a bare Electron copy
 * (no `app.asar`) — launching it from Spotlight then showed Electron's
 * "execute the following on the command line" placeholder instead of AEK.
 *
 * The `.app` suffix matters for what the user SEES: macOS keys the Dock label
 * and the tile icon off LaunchServices, and a `.bundle` folder is not an
 * application bundle — the Dock then falls back to the file name ("AEK
 * Next.bundle") and the generic grey icon. The place, not the suffix, is what
 * keeps it out of Spotlight: the slot data root is a dot-directory, and mds
 * does not index hidden trees (verified with a probe `.app` in `~/.aek-probe`,
 * which `mdfind` never returned).
 *
 * @param slot - 'aek' | 'next'.
 * @returns {string} `<data root>/dev/<devAppName>.app`.
 */
export function devAppDirForSlot(slot) {
  return join(slotHome(slot), 'dev', `${slotConfig(slot).devAppName}.app`)
}

/** Path to the default (AEK) branded dev bundle. */
export const devAppDir = devAppDirForSlot('aek')

/**
 * Path to a slot's packaged app in ~/Applications.
 * @param slot - 'aek' | 'next'.
 * @returns {string} the absolute path of the installed app for that slot.
 */
export function prodAppDirForSlot(slot) {
  return join(INSTALL_DIR, `${slotConfig(slot).productName}.app`)
}

/** Source Electron.app from pnpm store (resolved via v0's node_modules symlink) */
export const srcElectronApp = join(APP_ROOT, 'node_modules', 'electron', 'dist', 'Electron.app')

/** Compiled main process entry */
export const mainJs = join(APP_ROOT, 'lib', 'main', 'index.js')

/** electron-builder config path */
export const builderConfig = join(APP_ROOT, 'electron-builder.config.mjs')

/** Custom icon path */
export const customIcon = join(APP_ROOT, 'resources', 'icon.icns')

/** TSconfig path */
export const tsconfigPath = join(APP_ROOT, 'tsconfig.json')

/**
 * Electron binary path inside a bundled app.
 * @param appPath - the .app bundle path.
 * @param appName - the bundle's executable name (matches CFBundleExecutable).
 * @returns {string} the absolute path of the executable.
 */
export function electronBin(appPath, appName = DEV_APP_NAME) {
  return join(appPath, 'Contents', 'MacOS', appName)
}

/** electron-builder CLI */
export function builderCli() {
  return join(APP_ROOT, 'node_modules', 'electron-builder', 'cli.js')
}

/** tsx CLI in project root */
export function tsxBin() {
  return join(PROJECT_ROOT, 'node_modules', '.bin', 'tsx')
}

/** Shell CLI entry (compiled JS); the dsh fork's launcher, invoked as a module, not a command. */
export function dshBin() {
  return join(PROJECT_ROOT, 'apps', 'cli', 'lib', 'bin.js')
}

// ── Shell helpers ─────────────────────────────────────────────────────────────

/**
 * Build the environment for a spawned Electron shell.
 *
 * `ELECTRON_RUN_AS_NODE=1` makes the Electron binary start as a PLAIN NODE
 * process: it never injects the main-process API, so `import { app } from
 * 'electron'` resolves to the launcher path string instead of the module and
 * every named import fails with
 * `SyntaxError: The requested module 'electron' does not provide an export
 * named 'BrowserWindow'`. That error looks like an ESM-interop problem but is
 * not — the shell simply is not running as Electron.
 *
 * The variable is commonly inherited from an Electron-based host (VS Code,
 * Cursor, and similar IDEs set it so they can reuse the bundled Node binary
 * for sidecar scripts), so a shell launched from such a terminal silently
 * fails to boot. We always clear it for the shell we spawn.
 *
 * `NODE_OPTIONS` is dropped for the same reason: the parent process may carry
 * a `--require` belonging to another product's runtime.
 *
 * @param {Record<string, string | undefined>} extra - additional variables.
 * @returns {Record<string, string | undefined>} the environment for the shell.
 */
export function electronEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  // The shell must know WHERE THE SLOTS LIVE, not only which root it reads:
  // `~/.aek` is a container, and the console can start / stop the sibling slot.
  // Derive it from whatever home this child is being pointed at.
  if (env.AEK_HOME && !env.AEK_ROOT) env.AEK_ROOT = containerForHome(env.AEK_HOME)
  return env
}

/** Run a shell command and return trimmed stdout, or empty string on failure. */
export function shell(cmd, opts = {}) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim() }
  catch { return '' }
}

/**
 * PIDs of the processes actually LISTENING on a TCP port.
 *
 * Do NOT use `lsof -ti`: `-t` (terse) wins over `-sTCP:LISTEN` and lsof then
 * prints EVERY listening process on the machine (53 on this one) — which made
 * "who holds :1685" return the whole system. `-Fp` emits one `p<pid>` line per
 * process and is the reliable machine-readable form.
 * @param port - TCP port number.
 * @returns {string[]} listening pids.
 */
export function listenPids(port) {
  try {
    return execFileSync('/usr/sbin/lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' })
      .split('\n').filter(l => l.startsWith('p')).map(l => l.slice(1)).filter(Boolean)
  } catch {
    return []   // lsof exits 1 when nothing matches
  }
}

// ── Web server launcher ───────────────────────────────────────────────────────

/**
 * Spawn the DSH web server for a given data root + port.
 * Returns the child process. Must be called before waiting for web readiness.
 * @param home - the data root the web server should read (`DSH_HOME`/`AEK_HOME`).
 * @param port - the web port to bind.
 * @param options - when `detached` is true the child is uncoupled from the
 *   parent so it survives the caller exiting (used by the runtime arbiter).
 * @returns the spawned child process.
 */
/**
 * Console URL to show for a bound port.
 *
 * Ports are mapped back through the slot table; a remapped/unknown port falls
 * back to the loopback literal so the message is never wrong.
 * @param port - the port the web server bound.
 * @returns a browser-openable URL string.
 */
export function webUrlForPort(port) {
  const slot = Object.values(SLOTS).find(entry => entry.webPort === Number(port))
  return slot === undefined ? `http://127.0.0.1:${port}` : webUrl(slot.slot, Number(port))
}

export function spawnWebServerWith(home, port, options = {}) {
  const env = {
    ...process.env,
    DSH_HOME: home,
    AEK_HOME: home,
    AEK_ROOT: containerForHome(home),
    AEK_WEB_PORT: String(port),
    AEK_MODE: 'dev',
  }
  delete env.NODE_OPTIONS

  // Advertise the slot's alias host, not the loopback literal: Chromium keys
  // site zoom by host (port ignored), so handing out `127.0.0.1:<port>` is what
  // made AEK and the shell web UI share one zoom level.
  const advertised = webUrlForPort(port)
  const webCmd = `DSH_HOME=${home} ${tsxBin()} ${dshBin()} web --no-open --port ${port} --trusted-host ${new URL(advertised).hostname}`
  console.error(`[start] web  → ${advertised} (home ${home})`)
  const web = spawn('bash', ['-c', webCmd], {
    cwd: PROJECT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: Boolean(options.detached),
  })
  if (options.detached) web.unref?.()
  web.stdout.on('data', d => process.stdout.write(d))
  web.stderr.on('data', d => process.stderr.write(d))
  return web
}

/** Spawn the default (current) DSH web server. */
export function spawnWebServer() {
  return spawnWebServerWith(DSH_HOME, WEB_PORT)
}

/**
 * Spawn the DSH web server for a slot. Equivalent to {@link spawnWebServer} for
 * `slot === 'aek'`; for `next` it points at `~/.aek-next` on port 1687.
 * @param slot - 'aek' | 'next'.
 * @param options - forwarded to {@link spawnWebServerWith} (e.g. `{ detached: true }`).
 * @returns the spawned child process.
 */
export function spawnWebServerForSlot(slot, options = {}) {
  const s = SLOTS[slot]
  if (!s) throw new Error(`Unknown slot: ${slot}`)
  return spawnWebServerWith(slotHome(slot), s.webPort, options)
}

/**
 * Which processes currently hold a slot's ports, split into OUR processes and
 * FOREIGN ones.
 *
 * This is the single decision point for "may I kill this?" — see
 * {@link killSlot}. The split matters because a plain port kill would take out
 * an unrelated application that happens to hold one of our ports (a real case:
 * a third-party utility held 1680 before the ports moved to 1685–1688).
 *
 * Ownership is decided by the command line, never by "it holds my port":
 *   - the web server is spawned as `DSH_HOME=<root> … web --port <webPort>`;
 *   - the shell is spawned as `<bundle>/…/AEK <main.js>
 *     --remote-debugging-port=<cdpPort>`;
 *   - a process holding the port with neither marker is a squatter → foreign.
 * @param slot - 'aek' | 'next'.
 * @returns {{ ours: Array<{pid:number, port:number, kind:string, cmd:string}>,
 *             foreign: Array<{pid:number, port:number, kind:string, cmd:string}> }}
 */
export function slotProcesses(slot) {
  const s = SLOTS[slot]
  const ours = []
  const foreign = []
  if (!s) return { ours, foreign }
  const home = slotHome(slot)
  for (const [kind, port] of [['web', s.webPort], ['cdp', s.cdpPort]]) {
    let pids = []
    try {
      // LISTEN only — `lsof -ti :port` also lists CONNECTED peers (the shell's
      // sockets), which must never be treated as the service itself.
      pids = listenPids(port)
    } catch { continue }
    for (const pid of pids) {
      let cmd
      try {
        cmd = execFileSync('/bin/ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' })
      } catch { continue }   // vanished mid-scan
      const entry = { pid: Number(pid), port, kind, cmd }
      const owned =
        cmd.includes(`${home}/`) || cmd.trimEnd().endsWith(home) ||
        cmd.includes(`--port ${s.webPort}`) ||
        cmd.includes(`--remote-debugging-port=${s.cdpPort}`)
      ;(owned ? ours : foreign).push(entry)
    }
  }
  return { ours, foreign }
}

/**
 * Resolve the pids a slot is allowed to terminate.
 *
 * Sources are unioned so a stale lock cannot make us blind:
 *   1. the slot's pid lock (`webPid` / `shellPid`) — but each pid is
 *      re-verified against the command line, because pids get recycled;
 *   2. the processes actually holding the slot's ports, if they carry a slot
 *      marker (see {@link slotProcesses}).
 * @param slot - 'aek' | 'next'.
 * @returns {number[]} unique pids belonging to the slot.
 */
export function slotOwnedPids(slot) {
  const s = SLOTS[slot]
  if (!s) return []
  const home = slotHome(slot)
  const pids = new Set()
  for (const p of slotProcesses(slot).ours) pids.add(p.pid)
  const lock = readSlotLock(slot)
  for (const pid of [lock?.webPid, lock?.shellPid]) {
    if (!pid || !isPidAlive(pid)) continue
    let cmd
    try {
      cmd = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
    } catch { continue }
    // A recycled pid belongs to something else now — never kill it.
    if (cmd.includes(`${home}/`) || cmd.trimEnd().endsWith(home) ||
        cmd.includes(`--port ${s.webPort}`) ||
        cmd.includes(`--remote-debugging-port=${s.cdpPort}`)) pids.add(Number(pid))
  }
  return [...pids]
}

/**
 * Terminate ONLY the processes that belong to a slot (see {@link slotOwnedPids}).
 *
 * Never blanket-kills a port. If a foreign program holds one of the slot's
 * ports, it is reported back as a conflict and left alone — killing another
 * application's process is the user's call, not ours.
 *
 * Uses SIGTERM (graceful) and a bounded wait; a process that survives is
 * reported as `stuck` instead of being escalated to SIGKILL.
 * @param slot - 'aek' | 'next'.
 * @param options - `{ timeoutMs }` how long to wait for the pids to exit (3s);
 *   `{ keepShell: true }` (C6) leaves a RUNNING shell's pids out of the kill
 *   set so a web-only restart cannot take the user's window down with it.
 * @returns {Promise<{ok:boolean, slot:string, killed:number[], stuck:number[],
 *                    foreign:Array<{pid:number, port:number, kind:string}>}>}
 */
export async function killSlot(slot, options = {}) {
  const s = SLOTS[slot]
  const empty = { ok: true, slot, killed: [], stuck: [], foreign: [] }
  if (!s) return empty
  const timeoutMs = options.timeoutMs ?? 3000
  let pids = slotOwnedPids(slot)
  if (options.keepShell) {
    const keep = new Set(slotShellPids(slot))
    pids = pids.filter(pid => !keep.has(pid))
  }
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
  if (pids.length > 0) console.error(`[stop] ${slot}: SIGTERM ${pids.join(' ')}`)

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && pids.some(isPidAlive)) {
    await new Promise(r => setTimeout(r, 100))
  }
  const stuck = pids.filter(isPidAlive)
  const foreign = slotProcesses(slot).foreign.map(({ pid, port, kind }) => ({ pid, port, kind }))
  if (stuck.length > 0) console.error(`[stop] ${slot}: still alive after SIGTERM → ${stuck.join(' ')}`)
  if (foreign.length > 0) {
    console.error(`[stop] ${slot}: FOREIGN process holds a slot port, left alone → ` +
      foreign.map(f => `:${f.port} pid ${f.pid}`).join(', '))
  }
  return { ok: stuck.length === 0, slot, killed: pids.filter(p => !stuck.includes(p)), stuck, foreign }
}

// ── Slot liveness ────────────────────────────────────────────────────────────

/**
 * Is the slot's OWN web server running?
 *
 * A plain port probe is not enough: any foreign program holding the port
 * would be reported as "the slot is running" (a third-party app once held
 * port 1680 on one of our machines), which then makes the arbiter refuse to
 * and makes the switcher believe it is already up. Two checks:
 *   1. the process holding the port must point at this slot's data root;
 *   2. the server must answer with AEK's own marker — otherwise a squatter
 *      that won the port would answer on our behalf.
 * @param slot - 'aek' | 'next'.
 * @returns {boolean} true when the slot's own web server answers.
 */
export function slotWebUp(slot, options = {}) {
  const s = SLOTS[slot]
  if (!s) return false
  const home = slotHome(slot)
  let ours = false
  try {
    // LISTEN only: `lsof -ti :port` also returns peers that merely CONNECT to
    // the port (the shell's ESTABLISHED sockets), so the pid list changed on
    // every call and a foreign client could satisfy the check.
    const pids = listenPids(s.webPort)
    for (const pid of pids) {
      let cmd
      try {
        cmd = execFileSync('/bin/ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' })
      } catch { continue }   // pid vanished mid-scan; skip it, don't fail the probe
      // `home` must match on a path boundary: `/a/.aek` must not match the
      // command line of the sibling `/a/.aek-next` process.
      if (cmd.includes(`${home}/`) || cmd.trimEnd().endsWith(home) ||
          cmd.includes(`--port ${s.webPort}`)) ours = true
    }
  } catch { /* no listener */ }
  if (!ours) return false
  // SELF-DEADLOCK GUARD. When the web host's own admin route calls the arbiter
  // (`GET /api/aek/runtime` → synchronous spawn), the arbiter probes the port
  // that the calling process is *right now* blocking on. The TCP listener and
  // pid are still valid, but no response can ever arrive — so the HTTP check
  // would hang the whole host. Callers spawned from inside a host set this.
  //
  // C6: the guard now applies to the CALLER's own slot only. The arbiter may
  // still probe the OTHER slot over real HTTP (`options.allowHttp`), which is
  // exactly the case that used to misjudge "both running" — inside the host,
  // the cross-slot liveness was decided by listener ownership alone.
  if (process.env.AEK_PROBE_NO_HTTP === '1' && !options.allowHttp) return true
  // The body check is what separates "our server" from "a squatter answering
  // on our port", so it must not be flaky: a single curl gets killed at the
  // deadline on a loaded machine, which used to make the probe oscillate
  // between running/stopped. Retry before declaring the slot down.
  //
  // NOTE: do NOT probe `/api/aek/console/health` here — that route itself
  // spawns the arbiter synchronously, so probing it from the arbiter is a
  // guaranteed self-deadlock. The SPA index is the cheapest route that never
  // touches the arbiter.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = spawnSync('curl', ['-s', '-m', '3', `http://127.0.0.1:${s.webPort}/`], { encoding: 'utf8' })
      if (result.status === 0 && typeof result.stdout === 'string' &&
          (result.stdout.includes('aek') || result.stdout.includes('dsh'))) return true
    } catch { /* retry */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150)
  }
  return false
}

/**
 * Is the slot's OWN Electron shell running? (C6)
 *
 * The mode judgment ("both / only-aek / only-next / none") used to key on the
 * WEB server alone, so a slot whose shell was still open but whose backend had
 * been stopped read as "stopped", and a backend that was up without a shell
 * read as "running" — the user saw the truth in the Dock, the UI showed the
 * opposite. A slot is alive when EITHER half is alive.
 *
 * Shell liveness comes from two independent sources, each re-verified against
 * the command line so a recycled pid can never count:
 *   1. a listener on the slot's CDP port whose command line carries a slot
 *      marker (`--remote-debugging-port=<cdp>`, the slot's bundle path, or
 *      the slot's data root) — covers launcher/dev starts;
 *   2. the shell's own pid in the slot lock — covers packaged starts and
 *      anything that forgot to pass the CDP flag.
 * @param slot - 'aek' | 'next'.
 * @returns {boolean} true when the slot's shell is alive.
 */
export function slotShellUp(slot) {
  return slotShellPids(slot).length > 0
}

/**
 * Process table snapshot (`ps -Ao pid=,command=`), cached for a beat.
 *
 * The per-slot shell probe runs once per slot and the arbiter asks for both, so
 * without this cache a single status call walked the table twice; 800ms is far
 * below the 2s health TTL and keeps a burst of windows cheap.
 * @returns the raw table text, or `''` when `ps` could not be read.
 */
let psTableCache = { at: 0, text: '' }
function psTable() {
  const now = Date.now()
  if (psTableCache.text !== '' && now - psTableCache.at < 800) return psTableCache.text
  try {
    const text = execFileSync('/bin/ps', ['-Ao', 'pid=,command='], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
    psTableCache = { at: now, text }
    return text
  } catch {
    return ''
  }
}

/**
 * The pids that belong to the slot's Electron shell (see {@link slotShellUp}).
 * @param slot - 'aek' | 'next'.
 * @returns {number[]} shell pids, `[]` when none is alive.
 */
export function slotShellPids(slot) {
  const s = SLOTS[slot]
  if (!s) return []
  const names = [...new Set([s.productName, s.devAppName])]
  // Both layouts must match, because BOTH are legal shells:
  //   packaged → ~/Applications/AEK Next.app/Contents/MacOS/AEK Next
  //   dev      → <data root>/dev/AEK.app/Contents/MacOS/AEK
  // The old marker `/<productName>/Contents/MacOS/` matched NEITHER (an app
  // bundle always has the `.app` suffix on the directory), so a window opened
  // from the Dock read as "桌面窗口 未运行" while it was plainly on screen.
  const bundleMarkers = names.flatMap(name => [
    `/${name}.app/Contents/MacOS/`,
    `/${name}.bundle/Contents/MacOS/`,
  ])
  const markers = [`--remote-debugging-port=${s.cdpPort}`, ...bundleMarkers]
  const matches = (cmd) => markers.some(marker => cmd.includes(marker))
  const pids = new Set()

  // 1. Full process-table scan (cached for 800ms).
  //
  // This is the ONLY rule that catches the packaged app opened from
  // Spotlight / the Dock: such a process carries neither
  // `--remote-debugging-port` (a debug port is a launcher convenience) nor a
  // slot lock (written by the launcher, not by the .app bundle), so a probe
  // that starts from the CDP port reports "桌面窗口 未运行" for a window that is
  // plainly on screen.
  //
  // `…/Contents/Frameworks/<name> Helper.app/Contents/MacOS/<name> Helper` does
  // not contain `/<name>.app/Contents/MacOS/`, so renderer/GPU helpers never
  // register as the app itself.
  for (const line of psTable().split('\n')) {
    const trimmed = line.trim()
    const space = trimmed.indexOf(' ')
    if (space < 0) continue
    const pid = Number(trimmed.slice(0, space))
    if (!Number.isInteger(pid)) continue
    const cmd = trimmed.slice(space + 1)
    if (bundleMarkers.some(marker => cmd.includes(marker))) pids.add(pid)
  }

  // 2. Slot lock: covers a shell whose command line we could not read.
  const lock = readSlotLock(slot)
  if (lock?.shellPid && isPidAlive(lock.shellPid)) {
    let cmd = ''
    try {
      cmd = execFileSync('/bin/ps', ['-p', lock.shellPid, '-o', 'command='], { encoding: 'utf8' })
    } catch { /* pid vanished mid-scan */ }
    if (matches(cmd)) pids.add(Number(lock.shellPid))
  }

  // 3. CDP-port listener, ONLY when the table scan found nothing: `lsof` costs
  //    ~200ms, and every poll would pay it even though step 1 already knows the
  //    answer. Kept as a fallback for a shell whose argv we cannot parse.
  if (pids.size === 0) {
    let listeners = []
    try { listeners = listenPids(s.cdpPort) } catch { /* no listener */ }
    for (const pid of listeners) {
      let cmd
      try {
        cmd = execFileSync('/bin/ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' })
      } catch { continue }
      if (matches(cmd)) pids.add(Number(pid))
    }
  }
  return [...pids]
}

/**
 * Which build is behind the slot's running window — 'dev' or 'prod'?
 *
 * The console cannot tell the user the truth about "运行中" without this: a dev
 * shell spawned from the repo and the packaged app look identical in a
 * screenshot, yet only one of them survives a logout and only the packaged one
 * is what Spotlight opens.
 * @param slot - 'aek' | 'next'.
 * @returns {'dev' | 'prod' | null} null when no shell is running.
 */
export function slotShellKind(slot) {
  const pids = slotShellPids(slot)
  if (pids.length === 0) return null
  const devRoot = join(slotHome(slot), 'dev', '')   // trailing sep: keep /devX out
  for (const pid of pids) {
    let cmd = ''
    try {
      cmd = execFileSync('/bin/ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' })
    } catch { continue }
    if (cmd.includes(devRoot)) return 'dev'
  }
  return 'prod'
}


// ── Web readiness poll ────────────────────────────────────────────────────────

/**
 * Poll until the web server responds (max ~2s). Returns true if ready.
 * @param {number} [timeoutMs] - how long to wait.
 * @param {number} [port] - the port to probe (defaults to the current mode's).
 * @returns {Promise<boolean>} true when the server answered.
 */
export async function waitForWebReady(timeoutMs = 2000, port = WEB_PORT) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}`)
      if (res.ok) return true
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 100))
  }
  return false
}

// ── Dev branding ──────────────────────────────────────────────────────────────

/**
 * Brand Electron.app → ~/Applications/<slot dev name>.app.
 *
 * Each slot gets its OWN bundle, because a bundle identity decides everything
 * macOS keys off: `CFBundleIdentifier` (Spotlight / Dock / `userData` /
 * Chromium's singleton lock). Two slots sharing one bundle id would collide
 * and could not run side by side.
 *
 * The Info.plist is patched AFTER copying and BEFORE signing, because editing
 * a signed bundle invalidates the signature — macOS then refuses to open the
 * app with "App is damaged and can't be opened". So the last step is always a
 * fresh signature with the Cheezmil Dev certificate (never adhoc).
 *
 * T7 ordering: everything (copy, branding, signing) happens on a STAGED copy
 * inside the slot's data root. ~/Applications keeps the previous dev bundle
 * until the staged one passes signature verification AND the arm64 smoke
 * test; only then is it swapped in, with the previous one kept as the single
 * rollback base (`rollbackDirForSlot`). Does NOT mutate the pnpm store.
 * @param slot - 'aek' | 'next'.
 * @returns {boolean} true on success, false on failure.
 */
export function brandDevBundle(slot = 'aek') {
  const cfg = slotConfig(slot)
  const appName = cfg.devAppName
  const target = devAppDirForSlot(slot)

  // Hard guard: a dev shell must never overwrite the packaged app. If these two
  // paths ever collide again, abort instead of silently shipping a bare
  // Electron bundle into ~/Applications.
  if (target === prodAppDirForSlot(slot)) {
    console.error(`[brand] refusing to brand ${target} — it is the packaged app location`)
    return false
  }

  // Ensure source Electron.app exists
  if (!existsSync(srcElectronApp)) {
    console.error('[brand] Electron.app missing, reinstalling …')
    const installScript = join(APP_ROOT, 'node_modules', 'electron', 'install.js')
    if (existsSync(installScript)) {
      execSync(`node "${installScript}"`, { cwd: APP_ROOT, stdio: 'pipe' })
    }
    if (!existsSync(srcElectronApp)) {
      console.error('[brand] Electron.app still missing after reinstall')
      return false
    }
    console.error('[brand] Electron.app restored')
  }

  // Stage a fresh copy in the slot's data root; the installed bundle stays
  // untouched until the checks below pass.
  const rollback = rollbackDirForSlot(slot)
  mkdirSync(rollback, { recursive: true })
  const staged = join(rollback, `${appName}.app.staged`)
  rmSync(staged, { recursive: true, force: true })

  console.error(`[brand] staging → ${staged} …`)
  try {
    execSync(`cp -R "${srcElectronApp}" "${staged}"`, { stdio: 'pipe' })
  } catch (err) {
    console.error(`[brand] staging copy failed: ${err.message}`)
    rmSync(staged, { recursive: true, force: true })
    return false
  }

  const plistPath = join(staged, 'Contents', 'Info.plist')

  // Rename inner binary (Electron → AEK / AEK Next, C1: no "DEV" label)
  const macosDir = join(staged, 'Contents', 'MacOS')
  const oldBin   = join(macosDir, 'Electron')
  const newBin   = join(macosDir, appName)
  if (existsSync(oldBin)) renameSync(oldBin, newBin)

  // Copy custom icon
  const resourcesDir = join(staged, 'Contents', 'Resources')
  if (existsSync(customIcon)) {
    copyFileSync(customIcon, join(resourcesDir, 'icon.icns'))
    console.error('[brand] copied custom icon')
  }

  // Patch Info.plist — identity keys first, so the signature below seals them.
  if (existsSync(plistPath)) {
    let plist = shell(`cat "${plistPath}"`)
    plist = plist
      .replaceAll('CFBundleName</key>\n\t<string>Electron</string>', `CFBundleName</key>\n\t<string>${appName}</string>`)
      .replaceAll('CFBundleDisplayName</key>\n\t<string>Electron</string>', `CFBundleDisplayName</key>\n\t<string>${appName}</string>`)
      .replaceAll('CFBundleExecutable</key>\n\t<string>Electron</string>', `CFBundleExecutable</key>\n\t<string>${appName}</string>`)
      .replaceAll('CFBundleIconFile</key>\n\t<string>electron</string>', 'CFBundleIconFile</key>\n\t<string>icon</string>')
      .replaceAll('CFBundleIconFile</key>\n\t<string>electron.icns</string>', 'CFBundleIconFile</key>\n\t<string>icon.icns</string>')
    // The bundle id is what makes this a distinct app. Electron's own value is
    // `com.github.Electron`; give it the slot's real identity instead.
    plist = plist.replace(
      /(<key>CFBundleIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/u,
      `$1${cfg.bundleId}$2`,
    )
    // R20: Electron's stock Info.plist has no Accessibility usage description,
    // so the dev bundle needs the same declaration as electron-builder's
    // `mac.extendInfo`. Without it macOS may refuse to list the app in
    // System Settings → Privacy & Security → Accessibility.
    if (!plist.includes('NSAccessibilityUsageDescription')) {
      plist = plist.replace(
        /(\s*<\/dict>\s*<\/plist>)\s*$/u,
        '\n\t<key>NSAccessibilityUsageDescription</key>\n\t<string>AEK needs Accessibility access so you can explicitly enable desktop automation and verify developer-tool shortcuts.</string>$1',
      )
    }
    writeFileSync(plistPath, plist)
    console.error(`[brand] patched Info.plist → ${appName} (${cfg.bundleId})`)
  }

  // Sign LAST: the plist edit above invalidated Electron's original signature.
  if (!signApp(staged)) {
    rmSync(staged, { recursive: true, force: true })
    return false
  }

  // Verify (Cheezmil signature) + arm64 smoke test, then swap into place with
  // the previous dev bundle kept as the single rollback base.
  return placeVerifiedBundle(slot, target, staged)
}

// ── Prod packaging ────────────────────────────────────────────────────────────

/** Build TypeScript sources. */
export function buildTs() {
  console.error('[start] building TypeScript…')
  const tsc = join(APP_ROOT, 'node_modules', '.bin', 'tsc')
  execSync(`"${tsc}" -p "${tsconfigPath}"`, { cwd: APP_ROOT, stdio: 'inherit' })
}

/**
 * Run electron-builder to produce `dist/<slot>/mac-arm64/<product>.app`.
 * The slot is passed through the environment so the builder config picks it up
 * (appId, productName, output dir, injected metadata).
 *
 * The build is retried: electron-builder downloads a few things over the
 * network and the mirrors intermittently answer with an HTTP 504, which would
 * otherwise fail a perfectly good build.
 *
 * @param slot - 'aek' | 'next'.
 * @returns {boolean} true when the packaging succeeded.
 */
export function packageApp(slot = 'aek') {
  // Compile-time rules: every AEK package declares A1/A2, no A2 in a publish
  // roster, and macOS uses a self-signed dev identity (never adhoc).
  assertBuildRules()
  const cfg = slotConfig(slot)
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.error(`[start] packaging [${slot}] with electron-builder (attempt ${attempt}/${maxAttempts})…`)
    try {
      execSync(`node "${builderCli()}" build --mac --config "${builderConfig}" --arm64`, {
        cwd: APP_ROOT,
        stdio: 'inherit',
        env: { ...process.env, AEK_SLOT: slot },
      })
      console.error(`[start] packaged → ${join(APP_ROOT, 'dist', slot, 'mac-arm64', `${cfg.productName}.app`)}`)
      writeBuildFingerprint(slot)
      return true
    } catch (err) {
      console.error(`[start] packaging attempt ${attempt} failed: ${err.message}`)
      if (attempt < maxAttempts) console.error('[start] retrying…')
    }
  }
  return false
}

/**
 * Sign a bundle with the Cheezmil Dev certificate (never adhoc).
 *
 * `--deep` is used so the nested code (Electron Framework.framework and the
 * helper apps) is signed too. Electron ships its framework adhoc-signed and
 * WITHOUT a resource seal, so a plain outer-bundle signature leaves the
 * bundle unverifiable ("code has no resources but signature indicates they
 * must be present") and macOS refuses to open it. Signing nested code as well
 * creates the missing seals.
 *
 * A self-signed development certificate has no timestamp authority, so no
 * `--timestamp` flag is used — adding one makes codesign fail.
 *
 * @param appPath - the .app bundle to sign.
 * @returns {boolean} true when the bundle signed and verified.
 */
export function signApp(appPath) {
  // The identity is a SELF-SIGNED DEVELOPMENT identity discovered from the
  // local keychain (or pinned via AEK_SIGN_IDENTITY). Never a hardcoded name
  // — every developer has their own certificate — and never adhoc:
  // assertBuildIdentity() fails the build with a friendly setup guide.
  const identity = assertBuildIdentity().identity
  console.error(`[start] signing with ${identity} (self-signed development identity, never adhoc)…`)
  const ent = join(APP_ROOT, 'entitlements.plist')

  try {
    execFileSync('codesign', [
      '--force', '--deep', '--sign', identity, '--options', 'runtime',
      '--entitlements', ent, appPath,
    ], { stdio: 'inherit' })
  } catch (err) {
    console.error(`[start] signing failed: ${err.message}`)
    return false
  }

  // Verify: an unverifiable bundle is exactly what produces the
  // "App is damaged and can't be opened" dialog.
  try {
    execSync(`codesign --verify --deep --strict --verbose=1 "${appPath}"`, { stdio: 'pipe' })
    console.error('[start] signature verified')
  } catch (err) {
    console.error(`[start] signature verification FAILED: ${err.message}`)
    return false
  }
  return true
}

// ── T7: verify-then-swap install ─────────────────────────────────────────────
// The install ordering: stage the new bundle inside the slot's DATA ROOT
// (hidden from Spotlight/Finder), prove it is Cheezmil-signed AND executable
// (arm64 smoke test), and only then swap it into ~/Applications. The previous
// bundle is moved out of the way first and kept as the SINGLE rollback base;
// a failed swap puts it back. A failure at any step therefore never leaves
// the user with neither the old nor the new app.

/**
 * Where the "previous bundle" rollback bases live: the slot's data root
 * (`~/.aek/rollback/`, `~/.aek-next/rollback/`) — NOT next to the installed
 * app, because ~/Applications must hold exactly one `<name>.app` per slot
 * (no duplicated AEK.app entries in Spotlight/Finder).
 * @param {string} slot - 'aek' | 'next'.
 * @returns {string} the slot's rollback directory.
 */
export function rollbackDirForSlot(slot) {
  return join(slotHome(slot), 'rollback')
}

/**
 * Read `CFBundleExecutable` out of a bundle's Info.plist.
 * @param {string} appPath - the .app bundle.
 * @returns {string|null} the main executable's name, or null when unreadable.
 */
export function bundleExecutable(appPath) {
  const plist = join(appPath, 'Contents', 'Info.plist')
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plist], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim() || null
  } catch {
    return null
  }
}

/**
 * Hard gate before a bundle may replace the installed one: it must carry a
 * VALID custom development signature (deep-strict verified, never adhoc). An adhoc or
 * unverifiable bundle is exactly what makes macOS refuse to open the app
 * ("App is damaged, you should move it to the Trash").
 * @param {string} appPath - the .app bundle.
 * @returns {boolean} true when the bundle is Cheezmil-signed and verifies.
 */
export function verifySignedBundle(appPath) {
  try {
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'pipe' })
  } catch (err) {
    console.error(`[install] signature verification FAILED: ${String(err.message).split('\n')[0]}`)
    return false
  }
  let out
  try {
    out = execSync(`codesign -dv --verbose=2 "${appPath}" 2>&1`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return true // deep-strict already passed; the identity report is unreadable
  }
  if (/^Signature=adhoc/m.test(out)) {
    console.error('[install] bundle is ADHOC-signed — refusing (project requires the Cheezmil certificate)')
    return false
  }
  // Require a NAMED identity. An unnamed/adhoc signature is what macOS
  // rejects with "App is damaged, you should move it to the Trash". The exact
  // name is developer-specific (a self-signed dev certificate), so it is not
  // hardcoded here — the build-time gate already decided which one is valid.
  const authority = out.match(/^Authority=(.*)$/m)?.[1]?.trim() ?? ''
  if (authority.length === 0) {
    console.error('[install] signature has no named authority — refusing (an unnamed identity is adhoc-like)')
    return false
  }
  console.error(`[install] signature OK (${authority})`)
  return true
}

/**
 * Prove a bundle can actually EXECUTE before it may replace the installed
 * app: run its main binary in plain-node mode and demand an `arm64` answer.
 * This catches a wrong-arch or corrupted bundle long before a user
 * double-clicks it. ELECTRON_RUN_AS_NODE is stripped from the inherited env
 * first (see the shell bug where an inherited value made the app run as node
 * and no window ever appeared); HOME/PATH are kept so dyld resolves.
 * @param {string} appPath - the .app bundle.
 * @returns {boolean} true when the binary answers as a live arm64 process.
 */
export function smokeTestBundle(appPath) {
  const exe = bundleExecutable(appPath)
  if (!exe) {
    console.error(`[install] smoke test: cannot read CFBundleExecutable from ${appPath}`)
    return false
  }
  const bin = join(appPath, 'Contents', 'MacOS', exe)
  if (!existsSync(bin)) {
    console.error(`[install] smoke test: main binary missing (${bin})`)
    return false
  }
  const res = spawnSync(bin, ['-e', 'process.stdout.write(process.arch)'], {
    env: { ...electronEnv(), ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 20_000,
  })
  if (res.status !== 0) {
    console.error(`[install] smoke test FAILED (exit ${res.status}): ${String(res.stderr ?? '').trim()}`)
    return false
  }
  const arch = res.stdout.trim()
  if (arch !== 'arm64') {
    console.error(`[install] smoke test: binary answers '${arch}' — expected arm64`)
    return false
  }
  console.error('[install] smoke test passed (arm64)')
  return true
}

/**
 * Atomic swap: move the installed bundle (if any) into the slot's rollback
 * dir as the SINGLE rollback base (an older base is replaced), then rename
 * the verified staged bundle into its place. On a failed rename the previous
 * bundle is put back.
 *
 * The staged bundle lives on the same volume, so the final `mv` is a
 * rename(2) — atomic. The legacy unbounded `*.app.bak-<ts>` clutter the old
 * installApp left in ~/Applications is removed on the way.
 * @param {string} slot - 'aek' | 'next'.
 * @param {string} target - the installed .app path to replace.
 * @param {string} staged - the verified staged .app path.
 * @returns {boolean} true when the new bundle is in place.
 */
export function performSwap(slot, target, staged) {
  const rollback = rollbackDirForSlot(slot)
  mkdirSync(rollback, { recursive: true })
  // The dev bundle lives in `<data root>/dev/`, which may not exist yet on a
  // fresh data root — `mv` does not create parents and the swap would fail.
  mkdirSync(dirname(target), { recursive: true })
  const base = basename(target)
  const oldPath = join(rollback, `${base}.old`)
  const pendingPath = join(rollback, `${base}.old-pending`)

  // A leftover pending from a crashed previous run means that swap died with
  // the installed bundle moved aside but not replaced. Put it back — unless
  // the target reappeared, in which case a newer run completed the swap and
  // the pending is stale garbage.
  if (existsSync(pendingPath)) {
    if (existsSync(target)) {
      rmSync(pendingPath, { recursive: true, force: true })
    } else {
      try {
        execSync(`mv "${pendingPath}" "${target}"`, { stdio: 'inherit' })
        console.error(`[install] recovered previous ${base} from ${pendingPath} → ${target}`)
      } catch (err) {
        console.error(`[install] cannot recover ${pendingPath} (${String(err.message).split('\n')[0]}) — manual restore: mv "${pendingPath}" "${target}"`)
        rmSync(staged, { recursive: true, force: true })
        return false
      }
    }
  }

  // Step 1: move the installed bundle into the rollback dir under a PENDING
  // name; the older base is discarded only once that move has succeeded.
  // A failure here leaves the installed app untouched.
  let hasPrevious = false
  if (existsSync(target)) {
    rmSync(pendingPath, { recursive: true, force: true })
    try {
      execSync(`mv "${target}" "${pendingPath}"`, { stdio: 'inherit' })
      hasPrevious = true
    } catch (err) {
      console.error(`[install] could not move ${target} aside: ${String(err.message).split('\n')[0]}`)
      console.error('[install] installed app untouched; nothing replaced')
      rmSync(staged, { recursive: true, force: true })
      return false
    }
    // One rollback base per slot: discard the older one, promote the pending.
    rmSync(oldPath, { recursive: true, force: true })
    try {
      execSync(`mv "${pendingPath}" "${oldPath}"`, { stdio: 'inherit' })
    } catch (err) {
      // Storing the base failed — put the previous bundle back where it was.
      console.error(`[install] could not store the previous bundle: ${String(err.message).split('\n')[0]}`)
      try {
        execSync(`mv "${pendingPath}" "${target}"`, { stdio: 'inherit' })
        console.error(`[install] previous ${base} put back in place; nothing replaced`)
      } catch {
        console.error(`[install] previous ${base} kept at ${pendingPath} — manual restore: mv "${pendingPath}" "${target}"`)
      }
      rmSync(staged, { recursive: true, force: true })
      return false
    }
    console.error(`[install] previous bundle kept → ${oldPath}`)
  }

  // Legacy clutter from the old installApp (unbounded *.bak-<ts> in ~/Applications).
  // Best-effort: a read-only install dir must not abort an otherwise valid swap.
  try {
    for (const entry of readdirSync(INSTALL_DIR)) {
      if (entry.startsWith(`${base}.bak-`)) {
        rmSync(join(INSTALL_DIR, entry), { recursive: true, force: true })
        console.error(`[install] removed legacy ${entry} from ${INSTALL_DIR}`)
      }
    }
  } catch { /* cleanup only */ }

  // C1 migration: retired dev-bundle names (e.g. "AEK DEV") keep this slot's
  // bundle id, so leaving them in ~/Applications would be exactly the
  // duplicate the Dock/Finder must not show. Remove them (never the target).
  const legacyNames = slotConfig(slot).legacyDevAppNames ?? []
  try {
    for (const legacy of legacyNames) {
      const legacyBase = `${legacy}.app`
      if (legacyBase === base) continue
      const legacyPath = join(INSTALL_DIR, legacyBase)
      if (existsSync(legacyPath)) {
        rmSync(legacyPath, { recursive: true, force: true })
        console.error(`[install] removed retired dev name ${legacyBase} from ${INSTALL_DIR}`)
      }
    }
  } catch { /* cleanup only */ }

  // Step 2: rename the verified staged bundle into place (same volume →
  // atomic). Failure rolls the previous bundle back from its rollback base.
  try {
    execSync(`mv "${staged}" "${target}"`, { stdio: 'inherit' })
  } catch (err) {
    console.error(`[install] swap failed: ${String(err.message).split('\n')[0]}`)
    rmSync(staged, { recursive: true, force: true })
    if (hasPrevious) {
      try {
        execSync(`mv "${oldPath}" "${target}"`, { stdio: 'inherit' })
        console.error(`[install] ROLLED BACK — previous ${base} restored`)
      } catch (restoreErr) {
        console.error(`[install] ROLLBACK FAILED (${String(restoreErr.message).split('\n')[0]}) — manual restore: mv "${oldPath}" "${target}"`)
      }
    } else {
      console.error('[install] nothing previous to restore — no bundle in place now')
    }
    return false
  }
  console.error(`[install] ${base} in place → ${target}${hasPrevious ? `  (previous kept → ${oldPath})` : ''}`)
  return true
}

/**
 * The shared "verified → placed" tail of every bundle install: Cheezmil
 * signature check, arm64 smoke test, then the atomic swap.
 * @param {string} slot - 'aek' | 'next'.
 * @param {string} target - the installed .app path to replace.
 * @param {string} staged - the staged .app path (inside the rollback dir).
 * @returns {boolean} true when the bundle is installed.
 */
export function placeVerifiedBundle(slot, target, staged) {
  if (!verifySignedBundle(staged) || !smokeTestBundle(staged)) {
    rmSync(staged, { recursive: true, force: true })
    return false
  }
  return performSwap(slot, target, staged)
}

/**
 * Install a packaged PROD app into ~/Applications.
 *
 * T7 ordering: the new bundle is staged in the slot's data root, then verified
 * (Cheezmil signature + arm64 smoke test) BEFORE the old one is moved out of
 * the way; the previous bundle is kept as the single rollback base in
 * `rollbackDirForSlot(slot)`.
 *
 * @param {string} [slot] - 'aek' | 'next'.
 * @param {string} [source] - bundle to install; defaults to this slot's
 *   packaged dist artifact. Pass the stashed `.old` path to roll back — that
 *   is what `desktop.mjs rollback` does.
 * @returns {boolean} true on success.
 */
export function installApp(slot = 'aek', source) {
  const cfg = slotConfig(slot)
  const target = prodAppDirForSlot(slot)
  const from = source ?? join(APP_ROOT, 'dist', slot, 'mac-arm64', `${cfg.productName}.app`)
  if (!existsSync(from)) {
    console.error(`[install] nothing to install: ${from} does not exist`)
    return false
  }

  // Warn (do not block) when this slot's instance is still running: the swap
  // is a rename and stays safe, but the running process keeps serving the old
  // binary. start-release.mjs and desktop.mjs kill the slot first.
  const lock = readSlotLock(slot)
  const runningPid = lock?.shellPid ?? lock?.webPid
  if (runningPid && isPidAlive(runningPid)) {
    console.error(`[install] WARNING: ${slot} instance still running (pid ${runningPid}) — restart it to pick up the new bundle`)
  }

  const rollback = rollbackDirForSlot(slot)
  mkdirSync(rollback, { recursive: true })
  const staged = join(rollback, `${cfg.productName}.app.staged`)
  rmSync(staged, { recursive: true, force: true })
  try {
    execSync(`cp -R "${from}" "${staged}"`, { stdio: 'inherit' })
  } catch (err) {
    console.error(`[install] staging copy failed: ${String(err.message).split('\n')[0]}`)
    rmSync(staged, { recursive: true, force: true })
    return false
  }

  return placeVerifiedBundle(slot, target, staged)
}

/**
 * Install a bundle into a slot's DEV bundle location (used by
 * `desktop.mjs rollback --dev` to restore a stashed dev bundle). Same
 * verify-then-swap guarantees as `installApp`.
 * @param {string} [slot] - 'aek' | 'next'.
 * @param {string} [from] - the bundle to install; defaults to the stashed
 *   previous dev bundle in the slot's rollback dir.
 * @returns {boolean} true on success.
 */
export function installDevBundle(slot = 'aek', from) {
  const cfg = slotConfig(slot)
  const target = devAppDirForSlot(slot)
  const rollback = rollbackDirForSlot(slot)
  const src = from ?? join(rollback, `${cfg.devAppName}.app.old`)
  if (!existsSync(src)) {
    console.error(`[install] no stashed dev bundle for ${slot} (${src} does not exist)`)
    return false
  }
  mkdirSync(rollback, { recursive: true })
  const staged = join(rollback, `${cfg.devAppName}.app.staged`)
  rmSync(staged, { recursive: true, force: true })
  try {
    execSync(`cp -R "${src}" "${staged}"`, { stdio: 'inherit' })
  } catch (err) {
    console.error(`[install] staging copy failed: ${String(err.message).split('\n')[0]}`)
    rmSync(staged, { recursive: true, force: true })
    return false
  }
  return placeVerifiedBundle(slot, target, staged)
}

// ── Build fingerprint (T3) ───────────────────────────────────────────────────
// "The dist folder exists" is NOT proof that the app is up to date: the source
// may have changed since the last package. The fingerprint hashes everything
// that goes into the bundle, so a stale build is detected instead of silently
// launched.

/**
 * @param {string} dir - directory to walk.
 * @param {string[]} [out] - accumulator.
 * @returns {string[]} sorted relative paths of the files that matter.
 */
function fingerprintFiles(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) fingerprintFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/**
 * Hash of everything that determines the packaged app: the main-process
 * sources, their compiled output and the builder configuration.
 * @returns {string} a hex digest.
 */
export function buildFingerprint() {
  const hash = createHash('sha256')
  const files = [
    ...fingerprintFiles(join(APP_ROOT, 'src')),
    ...fingerprintFiles(join(APP_ROOT, 'lib')),
    join(APP_ROOT, 'electron-builder.config.mjs'),
    join(APP_ROOT, 'package.json'),
    join(APP_ROOT, 'entitlements.plist'),
  ].sort()
  for (const file of files) {
    try {
      const stat = statSync(file)
      hash.update(`${file}:${stat.size}:${stat.mtimeMs}\n`)
    } catch { /* missing file — the path still contributes nothing */ }
  }
  return hash.digest('hex').slice(0, 16)
}

/**
 * @param {string} slot - 'aek' | 'next'.
 * @returns {string} the path of the slot's fingerprint marker.
 */
export function fingerprintPath(slot) {
  return join(APP_ROOT, 'dist', slot, '.build-fingerprint')
}

/**
 * The packaged (dist) bundle for a slot.
 * @param {string} slot - 'aek' | 'next'.
 * @returns {string} path of `dist/<slot>/mac-arm64/<product>.app`.
 */
export function distAppPath(slot = 'aek') {
  return join(APP_ROOT, 'dist', slot, 'mac-arm64', `${slotConfig(slot).productName}.app`)
}

/**
 * Is the packaged app for this slot up to date?
 *
 * "Up to date" needs a WITNESS bundle that really exists: either the freshly
 * packaged one under `dist/`, or — after `pruneDistApp` removed that copy —
 * the one already installed in ~/Applications. Without the second witness,
 * dropping the dist copy (see `pruneDistApp`) would make every launch rebuild
 * an identical app.
 *
 * @param {string} slot - 'aek' | 'next'.
 * @returns {boolean} true when the build matches the current sources.
 */
export function isBuildFresh(slot = 'aek') {
  const witnesses = [distAppPath(slot), prodAppDirForSlot(slot)]
  if (!witnesses.some(p => existsSync(p))) return false
  try {
    return readFileSync(fingerprintPath(slot), 'utf8').trim() === buildFingerprint()
  } catch {
    return false
  }
}

/**
 * Delete the packaged bundle under `dist/` once it has been installed.
 *
 * Why: a plain `<product>.app` anywhere on the volume is indexed by Spotlight,
 * so a left-behind dist copy shows up as a SECOND "AEK" / "AEK Next" next to
 * the installed one. `.metadata_never_index` does NOT help — measured
 * 2026-11-09: a probe `.app` created inside a flagged folder was still
 * indexed, mds only honours the flag on a full volume scan. Moving the copy to
 * the slot's data root does not help either (Spotlight indexes dot-folders).
 * So the only reliable fix is: the dist bundle is a transient artifact and is
 * removed right after a verified install.
 *
 * @param {string} slot - 'aek' | 'next'.
 * @returns {boolean} true when a bundle was removed.
 */
export function pruneDistApp(slot = 'aek') {
  const app = distAppPath(slot)
  if (!existsSync(app)) return false
  rmSync(app, { recursive: true, force: true })
  return true
}

/**
 * Record the current fingerprint for a slot.
 * @param {string} slot - 'aek' | 'next'.
 */
export function writeBuildFingerprint(slot = 'aek') {
  const marker = fingerprintPath(slot)
  mkdirSync(dirname(marker), { recursive: true })
  writeFileSync(marker, buildFingerprint() + '\n')
}

// ── Signal handling ───────────────────────────────────────────────────────────

/** Attach SIGINT/SIGTERM handlers that kill the web server child. */
export function attachCleanup(web) {
  const cleanup = () => { web.kill(); process.exit(0) }
  process.on('SIGINT',  cleanup)
  process.on('SIGTERM', cleanup)
}

/**
 * Launch the Electron shell for a slot, pointing it at that slot's data root
 * and ports. Each slot has its OWN branded dev bundle (`~/Applications/AEK.app`
 * / `~/Applications/AEK Next.app` — C1: no "DEV" suffix) with its own bundle id
 * (per slot), so macOS treats them as two apps; the env points each at its own
 * data root and ports.
 * The child is spawned detached so it survives the caller (the runtime arbiter)
 * exiting. Idempotent: it only brands when the bundle is missing.
 * @param slot - 'aek' | 'next'.
 * @param options - `{ headless: true }` runs the shell without a window.
 * @returns the spawned shell child, or `null` on branding failure.
 */
export function launchShellForSlot(slot, options = {}) {
  const s = SLOTS[slot]
  if (!s) return null
  const home = slotHome(slot)
  const bundle = devAppDirForSlot(slot)
  if (!existsSync(bundle)) {
    if (!brandDevBundle(slot)) return null
  }
  const env = electronEnv({
    DSH_HOME: home,
    AEK_HOME: home,
    AEK_SLOT: slot,
    AEK_WEB_PORT: String(s.webPort),
    AEK_CDP_PORT: String(s.cdpPort),
    AEK_MODE: 'dev',
    ...(options.headless ? { AEK_HEADLESS: '1' } : {}),
  })
  const bin = electronBin(bundle, s.devAppName)
  console.error(`[start] shell[${slot}] → ${bundle} (web ${s.webPort}, home ${home})`)
  const shellProc = spawn(bin, [mainJs, `--remote-debugging-port=${s.cdpPort}`], {
    cwd: PROJECT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  })
  shellProc.unref?.()
  shellProc.stdout?.on('data', d => process.stdout.write(d))
  shellProc.stderr?.on('data', d => process.stderr.write(d))
  return shellProc
}
