#!/usr/bin/env node
/**
 * Read-only acceptance check against the LIVE AEK console instance.
 *
 * R25 (2026-11-09): the round must end with a single, real `AEK.app` instance
 * whose dev bundles declare Accessibility, whose web console serves the new
 * host facts, and whose Electron main process is the freshly emitted one.
 * This script NEVER writes, NEVER launches, NEVER stops a process, and NEVER
 * touches the key pool or the reveal route (rule 13).
 *
 * With no instance running it reports `skipped` and exits 0 — the static
 * gates in `verify-console-round.mjs` are the ones that always must pass.
 *
 * Usage: node scripts/aek/verify-live-console.mjs [--json]
 * @module scripts/aek/verify-live-console
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS, slotConfig, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { devAppDirForSlot, prodAppDirForSlot } from './shared-logic.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const results = []

/** @param {string} name @param {boolean} ok @param {string} detail */
function check(name, ok, detail) {
  results.push({ name, ok, detail })
}

/** @param {string} path @param {string} key @returns {string|null} */
function plistValue(path, key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return null
  }
}

/** @param {string} path @returns {{authority: string|null, adhoc: boolean}} */
function signature(path) {
  // `codesign -dv` writes its report to stderr; merge both streams.
  const result = spawnSync('codesign', ['-dv', '--verbose=2', path], { encoding: 'utf8' })
  const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  return {
    authority: out.match(/^Authority=(.*)$/mu)?.[1]?.trim() ?? null,
    adhoc: /^Signature=adhoc/mu.test(out),
  }
}

/** @param {string} url @returns {Promise<{status: number, body: string}>} */
async function get(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), headers: { accept: 'application/json' } })
    return { status: response.status, body: (await response.text()).slice(0, 4096) }
  } catch {
    return { status: 0, body: '' }
  }
}

// A build-only machine has no running web console. That is not a failure:
// say so and leave the static gates (which always run) as the authority.
const probeBase = `http://127.0.0.1:${String(SLOTS.aek.webPort)}`
const probe = await get(`${probeBase}/`)
if (probe.status !== 200) {
  process.stdout.write('SKIPPED  no live AEK console on 1685 — static gates still apply\n')
  process.exit(0)
}

// 1. Both installed dev bundles: identity, Accessibility usage string, signature.
for (const slot of ['aek', 'next']) {
  const cfg = slotConfig(slot)
  const app = devAppDirForSlot(slot)
  const plist = join(app, 'Contents', 'Info.plist')
  const name = plistValue(plist, 'CFBundleName')
  const bundleId = plistValue(plist, 'CFBundleIdentifier')
  const usage = plistValue(plist, 'NSAccessibilityUsageDescription')
  const sign = signature(app)
  check(
    `${slot} dev bundle`,
    existsSync(app) && name === cfg.devAppName && bundleId === cfg.bundleId
      && usage !== null && sign.authority !== null && !sign.adhoc,
    `${name ?? 'missing'} / ${bundleId ?? '-'} / usage=${usage !== null} / ${sign.authority ?? 'unsigned'}${sign.adhoc ? ' (ADHOC)' : ''}`,
  )
}

// 2. HTTP: page + read-only status APIs (never the key pool).
const aek = SLOTS.aek
const base = `http://127.0.0.1:${String(aek.webPort)}`
const index = await get(`${base}/`)
const facts = await get(`${base}/api/aek/console/facts`)
const status = await get(`${base}/api/aek/websearch`)
const permissions = await get(`${base}/api/aek/permissions`)
const health = await get(`${base}/api/aek/console/health`)
const access = await get(`${base}/api/aek/access`)
const instances = await get(`${base}/api/aek/instances`)
const live = index.status === 200 && facts.status === 200 && status.status === 200
check('web console (1685)', live, `index=${String(index.status)} facts=${String(facts.status)} status=${String(status.status)} permissions=${String(permissions.status)}`)
if (facts.status === 200) {
  try {
    const parsed = JSON.parse(facts.body)
    check('host facts', parsed.platform === 'darwin' && Array.isArray(parsed.endpoints) && Array.isArray(parsed.plugins)
      && String(parsed.skillPath ?? '').endsWith(join('aek-system-skill', 'aek-usage')),
      `platform=${parsed.platform} arch=${parsed.arch} plugins=${String(parsed.plugins?.length)} endpoints=${String(parsed.endpoints?.length)} entries=${String(parsed.entries?.length)}`)
  } catch {
    check('host facts', false, 'facts endpoint returned non-JSON')
  }
}

// 2b. Instance manager: health fingerprint, access policy view, method guard.
let healthOk = false
if (health.status === 200) {
  try {
    const parsed = JSON.parse(health.body)
    // The fingerprint carries web + shell + build kind per slot (6 chars), so a
    // window restarting from the packaged app into a dev shell invalidates it.
    const kinds = [parsed.slots?.aek?.shellKind, parsed.slots?.next?.shellKind]
    healthOk = typeof parsed.signature === 'string' && parsed.signature.length === 6
      && typeof parsed.slots?.aek?.web === 'boolean' && typeof parsed.slots?.aek?.shell === 'boolean'
      && kinds.every(kind => kind === 'dev' || kind === 'prod' || kind === null)
  } catch { healthOk = false }
}
check('instance health fingerprint', healthOk, `health=${String(health.status)}`)

let accessOk = false
if (access.status === 200) {
  try {
    const parsed = JSON.parse(access.body)
    accessOk = typeof parsed.publicMode === 'boolean' && Array.isArray(parsed.allowlist) && typeof parsed.hasPassword === 'boolean'
  } catch { accessOk = false }
}
check('access settings view', accessOk, `access=${String(access.status)}`)

check('instance control requires POST', instances.status === 405, `GET /api/aek/instances → ${String(instances.status)}`)

// 3. Exactly ONE AEK shell process (pgrep is preferred over ps in restricted
// shells). Since 2026-11-09 the shell can be either bundle: the DEV shell under
// `<data root>/dev/` (started by `desktop.mjs dev`) or the packaged app in
// ~/Applications (started from Spotlight). Both are legal; two at once are not.
/**
 * Count running shells of one bundle path.
 * @param bundlePath - the .app / .bundle directory.
 * @param exeName - the binary name inside Contents/MacOS.
 * @returns {number} matching process count.
 */
function shellCountFor(bundlePath, exeName) {
  try {
    const out = execFileSync('pgrep', ['-f', `^${join(bundlePath, 'Contents', 'MacOS', exeName)}( |$)`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim().split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}
const devShells = shellCountFor(devAppDirForSlot('aek'), 'AEK')
const prodShells = shellCountFor(prodAppDirForSlot('aek'), 'AEK')
check(
  'single AEK instance',
  devShells + prodShells === 1,
  `shell processes=${String(devShells + prodShells)} (dev=${String(devShells)} prod=${String(prodShells)})`,
)

// 4. CDP: only the DEV shell enables remote debugging, so this is a check when
// the dev shell runs and a SKIP for the packaged app (which deliberately keeps
// no debugging port open).
if (devShells === 1) {
  const cdp = await get(`http://127.0.0.1:${String(aek.cdpPort)}/json/version`)
  check('Electron shell (CDP 1686)', cdp.status === 200, `cdp=${String(cdp.status)}`)
} else {
  process.stdout.write('SKIPPED  CDP — the packaged app does not open a debugging port\n')
}

// 5. R20: startup accessibility registration wrote its result file.
const permissionsFile = join(slotHome('aek'), 'permissions.json')
let permissionText = 'missing'
if (existsSync(permissionsFile)) {
  try {
    const parsed = JSON.parse(readFileSync(permissionsFile, 'utf8'))
    permissionText = `accessibility=${String(parsed.accessibility)} bundle=${String(parsed.bundleId)}`
  } catch {
    permissionText = 'unreadable'
  }
}
check('accessibility registration', permissionText.startsWith('accessibility='), permissionText)

const failed = results.filter(item => !item.ok)
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ cwd: HERE, results, failed: failed.length }, null, 2)}\n`)
} else {
  for (const item of results) {
    process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}\n`)
  }
  process.stdout.write(`\n${String(results.length - failed.length)}/${String(results.length)} live checks passed\n`)
}
process.exit(failed.length === 0 ? 0 : 1)
