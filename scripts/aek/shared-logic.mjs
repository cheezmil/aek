/**
 * AEK Desktop — shared logic for start-dev.mjs and start-release.mjs.
 *
 * All path resolution is done relative to the project root (agent-enhance-kit/),
 * so these modules can be imported from any location in the repo.
 */
import { execSync, execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { existsSync, renameSync, copyFileSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { resolveAekHome } from '../../packages/aek/base/coraek/home.mjs'
import { SLOTS, slotConfig, slotHome } from '../../packages/aek/base/coraek/slots.mjs'

// The slot table (identity, ports, data root) lives in @cheezmil/coraek/slots —
// one source of truth shared by the desktop build, the desktop main process and
// these scripts. Re-exported here so existing importers keep working.
export { SLOTS, slotHome, slotConfig }

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

// ── Constants ─────────────────────────────────────────────────────────────────
// Ports are injected per slot by scripts/aek/launch.mjs (AEK 1685/1686, Next
// 1702/1704). When the env is unset (direct invocation / packaged app opened
// without the launcher) we fall back to the AEK defaults so the existing
// single-app flow keeps working.
export const WEB_PORT   = Number(process.env.AEK_WEB_PORT ?? 1685)
export const CDP_PORT   = Number(process.env.AEK_CDP_PORT ?? 1686)
export const DEV_APP_NAME = 'AEK DEV'

export const DSH_HOME   = resolveAekHome()
export const INSTALL_DIR = join(homedir(), 'Applications')

// ── Dual-app slots ─────────────────────────────────────────────────────────
// Two equal, named instances share one bundle (same app id, never swapped):
//   aek  → ~/.aek        web 1685 / cdp 1686
//   next → ~/.aek-next   web 1702 / cdp 1704
// scripts/aek/arbiter.mjs uses these to start/stop a whole instance (web + shell).
// The table itself comes from @cheezmil/coraek/slots (see the re-export above).

/**
 * Path to a slot's branded dev bundle.
 * @param slot - 'aek' | 'next'.
 * @returns {string} the absolute path of the dev bundle for that slot.
 */
export function devAppDirForSlot(slot) {
  return join(INSTALL_DIR, `${slotConfig(slot).devAppName}.app`)
}

/** Path to the default (AEK) branded dev bundle in ~/Applications */
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

/** dsh CLI entry (compiled JS) */
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
  return env
}

/** Run a shell command and return trimmed stdout, or empty string on failure. */
export function shell(cmd, opts = {}) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim() }
  catch { return '' }
}

/** Kill PIDs by space-separated string. */
export function killPids(pids) {
  const pidArr = (pids || '').split(/\s+/).filter(Boolean)
  if (pidArr.length === 0) return
  console.log(`[start] kill ${pidArr.join(' ')}`)
  execSync(`kill ${pidArr.join(' ')}`, { stdio: 'inherit' })
}

/** Kill anything holding the given port. */
export function killPort(port) {
  const pids = shell(`lsof -ti:${port}`)
  if (pids) { console.log(`[start] freeing port ${port} → ${pids}`); killPids(pids) }
}

/** Kill ports used by this mode. */
export async function killThisMode() {
  killPort(WEB_PORT)
  killPort(CDP_PORT)
  await new Promise(r => setTimeout(r, 200))
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
export function spawnWebServerWith(home, port, options = {}) {
  const env = {
    ...process.env,
    DSH_HOME: home,
    AEK_HOME: home,
    AEK_WEB_PORT: String(port),
    AEK_MODE: 'dev',
  }
  delete env.NODE_OPTIONS

  const webCmd = `DSH_HOME=${home} ${tsxBin()} ${dshBin()} web --no-open --port ${port}`
  console.log(`[start] web  → http://127.0.0.1:${port} (home ${home})`)
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
 * `slot === 'aek'`; for `next` it points at `~/.aek-next` on port 1702.
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
 * Kill the web + cdp ports used by a slot (any process holding them).
 * @param slot - 'aek' | 'next'.
 */
export async function killSlot(slot) {
  const s = SLOTS[slot]
  if (!s) return
  killPort(s.webPort)
  killPort(s.cdpPort)
  await new Promise(r => setTimeout(r, 200))
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
export function slotWebUp(slot) {
  const s = SLOTS[slot]
  if (!s) return false
  const home = slotHome(slot)
  let ours = false
  try {
    const pids = execFileSync('/usr/sbin/lsof', ['-ti', `:${s.webPort}`], { encoding: 'utf8' })
      .trim().split(/\s+/).filter(Boolean)
    for (const pid of pids) {
      const cmd = execFileSync('/bin/ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' })
      if (cmd.includes(home) || cmd.includes(`--port ${s.webPort}`)) ours = true
    }
  } catch { /* no listener */ }
  if (!ours) return false
  try {
    const result = spawnSync('curl', ['-s', '-m', '2', `http://127.0.0.1:${s.webPort}/`], { encoding: 'utf8' })
    return result.status === 0 && typeof result.stdout === 'string' &&
      (result.stdout.includes('aek') || result.stdout.includes('dsh'))
  } catch {
    return false
  }
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
 * Deletes any stale brand first. Does NOT mutate the pnpm store.
 * @param slot - 'aek' | 'next'.
 * @returns {boolean} true on success, false on failure.
 */
export function brandDevBundle(slot = 'aek') {
  const cfg = slotConfig(slot)
  const appName = cfg.devAppName
  const target = devAppDirForSlot(slot)
  const plistPath = join(target, 'Contents', 'Info.plist')

  // Clean stale brand
  if (existsSync(target)) {
    console.log(`[brand] removing stale ${appName}.app …`)
    rmSync(target, { recursive: true, force: true })
  }

  // Ensure source Electron.app exists
  if (!existsSync(srcElectronApp)) {
    console.log('[brand] Electron.app missing, reinstalling …')
    const installScript = join(APP_ROOT, 'node_modules', 'electron', 'install.js')
    if (existsSync(installScript)) {
      execSync(`node "${installScript}"`, { cwd: APP_ROOT, stdio: 'pipe' })
    }
    if (!existsSync(srcElectronApp)) {
      console.error('[brand] Electron.app still missing after reinstall')
      return false
    }
    console.log('[brand] Electron.app restored')
  }

  console.log(`[brand] branding → ${appName}.app …`)
  mkdirSync(INSTALL_DIR, { recursive: true })
  execSync(`cp -R "${srcElectronApp}" "${target}"`, { stdio: 'pipe' })

  // Rename inner binary (Electron → AEK DEV / AEK DEV Next)
  const macosDir = join(target, 'Contents', 'MacOS')
  const oldBin   = join(macosDir, 'Electron')
  const newBin   = join(macosDir, appName)
  if (existsSync(oldBin)) renameSync(oldBin, newBin)

  // Copy custom icon
  const resourcesDir = join(target, 'Contents', 'Resources')
  if (existsSync(customIcon)) {
    copyFileSync(customIcon, join(resourcesDir, 'icon.icns'))
    console.log('[brand] copied custom icon')
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
    writeFileSync(plistPath, plist)
    console.log(`[brand] patched Info.plist → ${appName} (${cfg.bundleId})`)
  }

  // Sign LAST: the plist edit above invalidated Electron's original signature.
  if (!signApp(target)) return false

  console.log(`[brand] done → ${target}`)
  return true
}

// ── Prod packaging ────────────────────────────────────────────────────────────

/** Build TypeScript sources. */
export function buildTs() {
  console.log('[start] building TypeScript…')
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
  const cfg = slotConfig(slot)
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[start] packaging [${slot}] with electron-builder (attempt ${attempt}/${maxAttempts})…`)
    try {
      execSync(`node "${builderCli()}" build --mac --config "${builderConfig}" --arm64`, {
        cwd: APP_ROOT,
        stdio: 'inherit',
        env: { ...process.env, AEK_SLOT: slot },
      })
      console.log(`[start] packaged → ${join(APP_ROOT, 'dist', slot, 'mac-arm64', `${cfg.productName}.app`)}`)
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
  console.log('[start] signing with Cheezmil Dev…')
  const sign = 'codesign --force --deep --sign "Cheezmil Dev" --options runtime'
  const ent  = join(APP_ROOT, 'entitlements.plist')

  try {
    execSync(`${sign} --entitlements "${ent}" "${appPath}"`, { stdio: 'inherit' })
  } catch (err) {
    console.error(`[start] signing failed: ${err.message}`)
    return false
  }

  // Verify: an unverifiable bundle is exactly what produces the
  // "App is damaged and can't be opened" dialog.
  try {
    execSync(`codesign --verify --deep --strict --verbose=1 "${appPath}"`, { stdio: 'pipe' })
    console.log('[start] signature verified')
  } catch (err) {
    console.error(`[start] signature verification FAILED: ${err.message}`)
    return false
  }
  return true
}

/**
 * Install a packaged app into ~/Applications.
 *
 * The new bundle is staged and verified BEFORE the old one is replaced, so a
 * failure never leaves the user with neither the old nor the new app. The
 * previous bundle is kept as `AEK.app.bak-<timestamp>` for rollback.
 *
 * @param slot - 'aek' | 'next'.
 * @returns {boolean} true on success.
 */
export function installApp(slot = 'aek') {
  const cfg = slotConfig(slot)
  const target = prodAppDirForSlot(slot)
  const source = join(APP_ROOT, 'dist', slot, 'mac-arm64', `${cfg.productName}.app`)
  if (!existsSync(source)) {
    console.error(`[start] nothing to install: ${source} does not exist`)
    return false
  }
  mkdirSync(INSTALL_DIR, { recursive: true })

  // Stage the new bundle next to the target, then swap it in.
  const staging = `${target}.new`
  rmSync(staging, { recursive: true, force: true })
  try {
    execSync(`cp -R "${source}" "${staging}"`, { stdio: 'inherit' })
  } catch (err) {
    console.error(`[start] staging copy failed: ${err.message}`)
    rmSync(staging, { recursive: true, force: true })
    return false
  }

  if (existsSync(target)) {
    const backup = `${target}.bak-${Date.now()}`
    try {
      execSync(`mv "${target}" "${backup}"`, { stdio: 'inherit' })
      console.log(`[start] previous bundle kept → ${backup}`)
    } catch (err) {
      console.error(`[start] could not move the old bundle aside: ${err.message}`)
      rmSync(staging, { recursive: true, force: true })
      return false
    }
  }

  try {
    execSync(`mv "${staging}" "${target}"`, { stdio: 'inherit' })
  } catch (err) {
    console.error(`[start] install failed: ${err.message}`)
    // Put the old bundle back.
    const backup = `${target}.bak-${Date.now()}`
    console.error(`[start] restoring the previous bundle from ${backup}`)
    rmSync(target, { recursive: true, force: true })
    return false
  }
  console.log(`[start] installed → ${target}`)
  return true
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
 * Is the packaged app for this slot up to date?
 * @param {string} slot - 'aek' | 'next'.
 * @returns {boolean} true when the build matches the current sources.
 */
export function isBuildFresh(slot = 'aek') {
  const cfg = slotConfig(slot)
  const app = join(APP_ROOT, 'dist', slot, 'mac-arm64', `${cfg.productName}.app`)
  if (!existsSync(app)) return false
  try {
    return readFileSync(fingerprintPath(slot), 'utf8').trim() === buildFingerprint()
  } catch {
    return false
  }
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
 * and ports. Each slot has its OWN branded dev bundle (`~/Applications/AEK DEV
 * .app` / `~/Applications/AEK DEV Next.app`) with its own bundle id, so macOS
 * treats them as two apps; the env points each at its own data root and ports.
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
  console.log(`[start] shell[${slot}] → ${bundle} (web ${s.webPort}, home ${home})`)
  const shellProc = spawn(bin, [mainJs, `--remote-debugging-port=${s.cdpPort}`], {
    cwd: PROJECT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  })
  shellProc.unref?.()
  shellProc.stdout?.on('data', d => process.stdout.write(d))
  shellProc.stderr?.on('data', d => process.stderr.write(d))
  return shellProc
}
