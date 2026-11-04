/**
 * AEK Desktop — shared logic for start-dev.mjs and start-release.mjs.
 *
 * All path resolution is done relative to the project root (agent-enhance-kit/),
 * so these modules can be imported from any location in the repo.
 */
import { execSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { existsSync, renameSync, copyFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
export const WEB_PORT   = 1680
export const CDP_PORT   = 1682
export const DEV_APP_NAME = 'AEK DEV'

export const DSH_HOME   = join(process.env.HOME ?? '/tmp', '.aek')
export const INSTALL_DIR = join(process.env.HOME ?? '', 'Applications')

/** Path to the branded dev bundle in ~/Applications */
export const devAppDir = join(INSTALL_DIR, `${DEV_APP_NAME}.app`)

/** Path to the prod bundle in ~/Applications */
export const prodAppDir = join(INSTALL_DIR, 'AEK.app')

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

/** electron binary path inside a bundled app */
export function electronBin(appPath) {
  return join(appPath, 'Contents', 'MacOS', DEV_APP_NAME)
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
 * Spawn the DSH web server. Returns the child process.
 * Must be called before waiting for web readiness.
 */
export function spawnWebServer() {
  const env = { ...process.env, DSH_HOME, AEK_MODE: 'dev' }
  delete env.NODE_OPTIONS

  const webCmd = `DSH_HOME=${DSH_HOME} ${tsxBin()} ${dshBin()} web --no-open --port ${WEB_PORT}`
  console.log(`[start] web  → http://127.0.0.1:${WEB_PORT}`)
  const web = spawn('bash', ['-c', webCmd], {
    cwd: PROJECT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  web.stdout.on('data', d => process.stdout.write(d))
  web.stderr.on('data', d => process.stderr.write(d))
  return web
}

// ── Web readiness poll ────────────────────────────────────────────────────────

/**
 * Poll until the web server responds (max ~2s). Returns true if ready.
 */
export async function waitForWebReady(timeoutMs = 2000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${WEB_PORT}`)
      if (res.ok) return true
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 100))
  }
  return false
}

// ── Dev branding ──────────────────────────────────────────────────────────────

/**
 * Brand Electron.app → ~/Applications/AEK DEV.app.
 * Deletes any stale brand first. Does NOT mutate the pnpm store.
 * Returns true on success, false on failure.
 */
export function brandDevBundle() {
  const plistPath = join(devAppDir, 'Contents', 'Info.plist')

  // Clean stale brand
  if (existsSync(devAppDir)) {
    console.log(`[brand] removing stale ${DEV_APP_NAME}.app …`)
    rmSync(devAppDir, { recursive: true, force: true })
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

  console.log(`[brand] branding → ${DEV_APP_NAME}.app …`)
  mkdirSync(INSTALL_DIR, { recursive: true })
  execSync(`cp -R "${srcElectronApp}" "${devAppDir}"`, { stdio: 'pipe' })

  // Rename inner binary (Electron → AEK DEV)
  const macosDir = join(devAppDir, 'Contents', 'MacOS')
  const oldBin   = join(macosDir, 'Electron')
  const newBin   = join(macosDir, DEV_APP_NAME)
  if (existsSync(oldBin)) renameSync(oldBin, newBin)

  // Copy custom icon
  const resourcesDir = join(devAppDir, 'Contents', 'Resources')
  if (existsSync(customIcon)) {
    copyFileSync(customIcon, join(resourcesDir, 'icon.icns'))
    console.log('[brand] copied custom icon')
  }

  // Patch Info.plist
  if (existsSync(plistPath)) {
    let plist = shell(`cat "${plistPath}"`)
    plist = plist
      .replaceAll('CFBundleName</key>\n\t<string>Electron</string>', `CFBundleName</key>\n\t<string>${DEV_APP_NAME}</string>`)
      .replaceAll('CFBundleDisplayName</key>\n\t<string>Electron</string>', `CFBundleDisplayName</key>\n\t<string>${DEV_APP_NAME}</string>`)
      .replaceAll('CFBundleExecutable</key>\n\t<string>Electron</string>', `CFBundleExecutable</key>\n\t<string>${DEV_APP_NAME}</string>`)
      .replaceAll('CFBundleIconFile</key>\n\t<string>electron</string>', 'CFBundleIconFile</key>\n\t<string>icon</string>')
      .replaceAll('CFBundleIconFile</key>\n\t<string>electron.icns</string>', 'CFBundleIconFile</key>\n\t<string>icon.icns</string>')
    writeFileSync(plistPath, plist)
    console.log(`[brand] patched Info.plist → ${DEV_APP_NAME}`)
  }

  console.log(`[brand] done → ${devAppDir}`)
  return true
}

// ── Prod packaging ────────────────────────────────────────────────────────────

/** Build TypeScript sources. */
export function buildTs() {
  console.log('[start] building TypeScript…')
  const tsc = join(APP_ROOT, 'node_modules', '.bin', 'tsc')
  execSync(`"${tsc}" -p "${tsconfigPath}"`, { cwd: APP_ROOT, stdio: 'inherit' })
}

/** Run electron-builder to produce dist/mac-arm64/AEK.app. */
export function packageApp() {
  console.log('[start] packaging with electron-builder…')
  execSync(`node "${builderCli()}" build --mac --config "${builderConfig}" --arm64`, {
    cwd: APP_ROOT, stdio: 'inherit',
  })
}

/** Sign the produced app with Cheezmil Dev certificate. */
export function signApp(appPath) {
  console.log('[start] signing with Cheezmil Dev…')
  const sign  = 'codesign --sign "Cheezmil Dev" --force --timestamp --options runtime'
  const ent   = join(APP_ROOT, 'entitlements.plist')
  execSync(`${sign} --entitlements "${ent}" "${appPath}"`, { stdio: 'inherit' })
  // Sign inner electron binary
  const innerBin = join(appPath, 'Contents', 'Resources', 'app.asar.unpacked',
    'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  if (existsSync(innerBin)) execSync(`${sign} "${innerBin}"`, { stdio: 'inherit' })
}

/** Copy packed app to ~/Applications/AEK.app. */
export function installApp() {
  const target = prodAppDir
  const source = join(APP_ROOT, 'dist', 'mac-arm64', 'AEK.app')
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  mkdirSync(INSTALL_DIR, { recursive: true })
  execSync(`cp -R "${source}" "${target}"`, { stdio: 'inherit' })
  console.log(`[start] installed → ${target}`)
}

// ── Signal handling ───────────────────────────────────────────────────────────

/** Attach SIGINT/SIGTERM handlers that kill the web server child. */
export function attachCleanup(web) {
  const cleanup = () => { web.kill(); process.exit(0) }
  process.on('SIGINT',  cleanup)
  process.on('SIGTERM', cleanup)
}
