#!/usr/bin/env node
/**
 * One-shot, READ-ONLY health check for every AEK plugin.
 *
 * Answers "are all plugins working?" in one command instead of hand-running
 * aeksm / aekpm / aekws / aek plus curl and log greps. It never writes,
 * installs, starts or kills anything — every finding is reported, and a
 * nonzero exit code summarizes the failures.
 *
 * Checks (group → what is verified):
 *
 *   packages   every coraek-plugins package + the two base packages:
 *              declared version, build output (lib/) where `main` points into
 *              it, and the bin entry the CLI would run.
 *   clis       the PATH-installed binaries (aek, aeksm, aekpm, aekws):
 *              resolvable, executable, and their version compared with the
 *              source tree this script lives in (a stale global install is
 *              flagged). aekim (A1, no PATH binary — kept local-only) is
 *              run from the workspace checkout directly.
 *   profiles   every checked slot's web profile: the `link:` targets of its
 *              package.json dependencies must exist, and every materialized
 *              node_modules/@cheezmil/* symlink must resolve.
 *   web        each slot's web port: HTTP liveness, the /api/aek/* host
 *              bridge surface, and the plugin-console catalogue (which
 *              manager CLIs the running host offers).
 *   skillmgr   the aek-skill-manager deep dive: `aeksm doctor` (hub health,
 *              warnings), `aeksm status` (distribution integrity) and
 *              `aeksm echo` (CLI sanity).
 *   electron   which AEK app instances are running (dev vs prod, per slot):
 *              more than one live instance of one slot violates the
 *              one-instance rule and is reported.
 *   logs       recent ERROR lines in the newest web-host / desktop log of
 *              each slot (reported, not fixed).
 *
 * Usage:
 *   node scripts/aek/check-plugins.mjs            # human report, all slots
 *   node scripts/aek/check-plugins.mjs --json     # machine readable
 *   node scripts/aek/check-plugins.mjs --slot next
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS, slotConfig, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { aiReleasePath, readAiRelease } from '../../packages/aek/base/coraek/ai-release.mjs'

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const slotArg = argv.indexOf('--slot')
const ONLY_SLOT = slotArg !== -1 ? argv[slotArg + 1] : null
if (ONLY_SLOT !== null) {
  // BF-4 lane round: built-in slots AND registered lanes.
  let ok = false
  try {
    slotConfig(ONLY_SLOT)
    ok = true
  } catch {
    ok = false
  }
  if (!ok) {
    console.error(`unknown slot: ${ONLY_SLOT} (expected ${Object.keys(SLOTS).join(' | ')} or a registered lane)`)
    process.exit(2)
  }
}
const SLOTS_TO_CHECK = ONLY_SLOT ? [ONLY_SLOT] : Object.keys(SLOTS)
const LOG_TAIL = 500

// ── project root (no hardcoded paths: walk up to pnpm-workspace.yaml) ────────
function findProjectRoot() {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return dir
}
const PROJECT_ROOT = findProjectRoot()
const PLUGIN_DIR = join(PROJECT_ROOT, 'packages', 'aek', 'coraek-plugins')
const BASE_DIR = join(PROJECT_ROOT, 'packages', 'aek', 'base')

// ── small helpers ─────────────────────────────────────────────────────────────
const results = [] // { group, ok, id, detail }
function record(group, ok, id, detail = '') {
  results.push({ group, ok, id, detail })
}
function readPkg(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}
function runBin(bin, args, { timeoutMs = 30000 } = {}) {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout: timeoutMs })
    return { ok: r.status === 0, status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() }
  } catch (err) {
    return { ok: false, status: null, stdout: '', stderr: String(err) }
  }
}
function findOnPath(bin) {
  for (const dir of (process.env.PATH ?? '').split(':')) {
    const p = join(dir, bin)
    try {
      if (existsSync(p)) return p
    } catch {
      continue
    }
  }
  return null
}

// ── 1. plugin packages ────────────────────────────────────────────────────────
function checkPackages() {
  const pkgs = []
  for (const name of readdirSync(PLUGIN_DIR)) {
    if (statSync(join(PLUGIN_DIR, name)).isDirectory()) pkgs.push(join(PLUGIN_DIR, name))
  }
  pkgs.push(join(BASE_DIR, 'coraek'), join(BASE_DIR, 'coraek-profile'))
  for (const dir of pkgs) {
    const name = basename(dir)
    const pkg = readPkg(dir)
    if (!pkg) {
      record('packages', false, name, 'package.json unreadable')
      continue
    }
    const aek = pkg.aek ?? {}
    const details = [`v${pkg.version ?? '?'}`, `type=${aek.type ?? '?'}`]
    let ok = true
    if (pkg.main && pkg.main.startsWith('lib/') && !existsSync(join(dir, pkg.main))) {
      ok = false
      details.push(`MISSING ${pkg.main} (run the package build)`)
    }
    if (aek.cli?.bin && !existsSync(join(dir, aek.cli.bin))) {
      ok = false
      details.push(`MISSING ${aek.cli.bin}`)
    }
    record('packages', ok, name, details.join(' '))
  }
}

// ── 2. CLIs on PATH ───────────────────────────────────────────────────────────
function checkClis() {
  const cliTable = [
    { bin: 'aek', source: join(BASE_DIR, 'coraek'), versionArgs: ['-V'] },
    { bin: 'aeksm', source: join(PLUGIN_DIR, 'aek-skill-manager'), versionArgs: ['--version'] },
    { bin: 'aekpm', source: join(PLUGIN_DIR, 'aek-prompt-manager'), versionArgs: ['--version'] },
    { bin: 'aekws', source: join(PLUGIN_DIR, 'aek-websearch'), versionArgs: ['--version'] },
  ]
  for (const { bin, source, versionArgs } of cliTable) {
    const pathHit = findOnPath(bin)
    if (!pathHit) {
      record('clis', false, bin, 'not on PATH')
      continue
    }
    const r = runBin(bin, versionArgs, { timeoutMs: 20000 })
    if (!r.ok) {
      record('clis', false, bin, `run failed (status ${r.status}): ${r.stderr.slice(0, 160)}`)
      continue
    }
    // `aek -V` prints `@cheezmil/coraek/1.2.1 darwin-arm64 node-…`; the plain
    // ones print the bare version. Compare against the source tree version.
    const srcPkg = readPkg(source)
    const srcVer = srcPkg?.version
    const m = r.stdout.match(/(\d+\.\d+\.\d+)/)
    const ver = m?.[1]
    if (ver && srcVer && ver !== srcVer) {
      record('clis', true, bin, `${ver} installed, source tree at ${srcVer} (stale global install?)`)
    } else if (ver && srcVer && ver === srcVer) {
      record('clis', true, bin, `${ver} (matches source tree)`)
    } else {
      record('clis', true, bin, (r.stdout.split('\n')[0] || 'ok').slice(0, 80))
    }
  }
  // icon-manager ships no PATH binary (A1, kept local-only); invoke its bin directly.
  const iconPkg = readPkg(join(PLUGIN_DIR, 'aek-icon-manager'))
  if (iconPkg?.aek?.cli?.bin) {
    const script = join(PLUGIN_DIR, 'aek-icon-manager', iconPkg.aek.cli.bin)
    if (existsSync(script)) {
      const r = runBin(process.execPath, [script, 'list'], { timeoutMs: 20000 })
      const count = r.ok ? r.stdout.split('\n').filter(Boolean).length : 0
      record('clis', r.ok, 'aekim', r.ok ? `${count} framework icons listed` : r.stderr.slice(0, 120))
    } else {
      record('clis', false, 'aekim', `bin script missing: ${iconPkg.aek.cli.bin}`)
    }
  }
}

// ── 3. profile link integrity ────────────────────────────────────────────────
function checkProfiles() {
  for (const slot of SLOTS_TO_CHECK) {
    const home = slotHome(slot)
    const profileDir = join(home, 'profiles', 'web')
    if (!existsSync(profileDir)) {
      record('profiles', false, `${slot}/web`, `profile dir missing: ${profileDir}`)
      continue
    }
    const issues = []
    const pkg = readPkg(profileDir)
    // a) declared link dependencies must exist on disk
    for (const [dep, spec] of Object.entries(pkg?.dependencies ?? {})) {
      if (typeof spec === 'string' && spec.startsWith('link:')) {
        const target = join(profileDir, spec.slice('link:'.length))
        if (!existsSync(target)) issues.push(`${dep} link target missing: ${target}`)
      }
    }
    // b) every materialized @cheezmil symlink must resolve
    const nmCheez = join(profileDir, 'node_modules', '@cheezmil')
    if (existsSync(nmCheez)) {
      for (const entry of readdirSync(nmCheez)) {
        const full = join(nmCheez, entry)
        let raw = null
        try {
          raw = readlinkSync(full) // null-safe: non-symlinks are skipped by the caller below
        } catch {
          continue
        }
        if (raw === null || raw === undefined) continue
        const resolved = join(dirname(full), raw)
        if (!existsSync(resolved)) issues.push(`node_modules symlink broken: @cheezmil/${entry} → ${raw}`)
      }
    }
    record('profiles', issues.length === 0, `${slot}/web`, issues.length ? issues.join('; ') : 'all link targets resolve')
  }
}

// ── 4. web instances ─────────────────────────────────────────────────────────
async function checkWeb() {
  for (const slot of SLOTS_TO_CHECK) {
    const cfg = SLOTS[slot]
    const base = `http://127.0.0.1:${cfg.webPort}`
    let root
    try {
      root = await fetch(`${base}/`, { signal: AbortSignal.timeout(4000) })
    } catch {
      record('web', false, `${slot} (${cfg.webPort})`, 'web host not responding')
      continue
    }
    if (!root.ok) {
      record('web', false, `${slot} (${cfg.webPort})`, `HTTP ${root.status} on /`)
      continue
    }
    const apis = ['api/aek/icons/sets', 'api/aek/runtimes', 'api/aek/websearch', 'api/aek/plugin-console']
    const bad = []
    let consoleInfo = ''
    for (const api of apis) {
      try {
        const r = await fetch(`${base}/${api}`, { signal: AbortSignal.timeout(5000) })
        if (!r.ok) bad.push(`${api} → ${r.status}`)
        if (api === 'api/aek/plugin-console') {
          const j = await r.json().catch(() => null)
          if (j?.plugins?.length) {
            consoleInfo = j.plugins.map((p) => `${p.id}@${p.version}${p.available ? '' : ' (unavailable)'}`).join(', ')
          }
        }
      } catch {
        bad.push(`${api} → unreachable`)
      }
    }
    record(
      'web',
      bad.length === 0,
      `${slot} (${cfg.webPort})`,
      [bad.length ? bad.join('; ') : 'all /api/aek bridges OK', consoleInfo].filter(Boolean).join(' · '),
    )
  }
}

// ── 5. skill manager deep dive ───────────────────────────────────────────────
function checkSkillManager() {
  const echo = runBin('aeksm', ['echo', 'check-plugins sanity'], { timeoutMs: 15000 })
  record('skillmgr', echo.ok && echo.stdout === 'check-plugins sanity', 'aeksm echo', echo.ok ? 'cli sanity ok' : echo.stderr.slice(0, 120))
  const doctor = runBin('aeksm', ['doctor'], { timeoutMs: 30000 })
  if (!doctor.ok) {
    record('skillmgr', false, 'aeksm doctor', doctor.stderr.slice(0, 200) || `status ${doctor.status}`)
    return
  }
  let doc
  try {
    doc = JSON.parse(doctor.stdout)
  } catch {
    record('skillmgr', false, 'aeksm doctor', 'output not JSON')
    return
  }
  const dist = doc.distribution ?? {}
  const summary = [
    `hub ${doc.skillHome}`,
    `${doc.skillCount ?? 0} skills`,
    `${dist.managedEntries ?? 0} distributed / ${dist.agentCoverage ?? 0} agents`,
    `outdated=${dist.outdated ?? 0} foreign=${dist.foreign ?? 0}`,
    `brokenLinks=${(doc.brokenLinks ?? []).length}`,
  ]
  // Hard state = doctor exit 0 + no broken links + no source-less imports.
  // The three doctor warnings are advisory (stale catalog, scattered
  // distributions, security findings) — the manager itself still works — so
  // they are surfaced in detail without failing the check.
  const ok = (doc.brokenLinks ?? []).length === 0 && (doc.importedWithoutSource ?? []).length === 0
  const sec = doc.security ?? {}
  const details = [
    summary.join(' · '),
    sec.high ? `security: ${sec.high} high-severity finding(s) in [${(sec.skillsWithHigh ?? []).join(', ')}]` : '',
    ...(doc.warnings ?? []).map((w) => `WARN: ${w}`),
  ].filter(Boolean)
  record('skillmgr', ok, 'aeksm doctor', details.join(' | '))
  const status = runBin('aeksm', ['status'], { timeoutMs: 30000 })
  record('skillmgr', status.ok, 'aeksm status', status.ok ? status.stdout.split('\n').join(' | ').slice(0, 160) : status.stderr.slice(0, 120))
}

// ── 6. electron instances ────────────────────────────────────────────────────
function checkElectron() {
  const r = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  if (r.status !== 0) {
    record('electron', false, 'ps', r.stderr.slice(0, 120))
    return
  }
  const lines = (r.stdout ?? '').split('\n').filter(Boolean)
  // The bundle dir inside the command path is the unambiguous identity: argv[0]
  // of a dev shell is `<slotHome>/dev/<name>.app/Contents/MacOS/<name>`, of a
  // prod shell it is `~/Applications/<name>.app/...`. Matching the .app
  // directory (never argv[0]) keeps "AEK.app" and "AEK Next.app" apart even
  // when both live under ~/Applications.
  const bundlePrefixes = []
  for (const s of Object.keys(SLOTS)) {
    bundlePrefixes.push({ slot: s, kind: 'dev', prefix: join(slotHome(s), 'dev', `${SLOTS[s].devAppName}.app/`) })
    bundlePrefixes.push({ slot: s, kind: 'prod', prefix: join(homedir(), 'Applications', `${SLOTS[s].productName}.app/`) })
  }
  const seen = new Map() // slot -> [{ pid, kind }]
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/)
    if (!m) continue
    const [pid, cmd] = [m[1], m[2]]
    // Helper children (GPU / network / renderer / the shell's own "… Helper"
    // framework processes) all live under `<bundle>.app/Contents/Frameworks/`
    // — argv[0] names containing a space would defeat basename heuristics,
    // so the bundle-relative path is the only reliable tell. Only the MAIN
    // process (`Contents/MacOS/<name>`) counts toward the one-instance rule.
    if (cmd.includes('.app/Contents/Frameworks/')) continue
    const hit = bundlePrefixes.find((b) => cmd.startsWith(b.prefix))
    if (!hit) continue
    if (!seen.has(hit.slot)) seen.set(hit.slot, [])
    seen.get(hit.slot).push({ pid, kind: hit.kind })
  }
  for (const slot of SLOTS_TO_CHECK) {
    const live = seen.get(slot) ?? []
    const byKind = {}
    for (const x of live) byKind[x.kind] = (byKind[x.kind] ?? 0) + 1
    // two shells of the SAME kind in one slot, or dev + prod sharing one
    // bundle id inside the slot, is the duplicate the one-instance rule forbids.
    const violates = Object.values(byKind).some((n) => n > 1)
    const detail = live.length ? live.map((x) => `${x.kind}(pid ${x.pid})`).join(' ') : 'no instance running'
    record('electron', !violates, `slot ${slot}`, detail + (violates ? '  ← DUPLICATE INSTANCE in one slot!' : ''))
  }
}

// ── 7. recent log errors ─────────────────────────────────────────────────────
function tailFile(path, n) {
  try {
    const data = readFileSync(path, 'utf8')
    return data.split('\n').slice(-n).filter(Boolean)
  } catch {
    return []
  }
}
function checkLogs() {
  for (const slot of SLOTS_TO_CHECK) {
    const home = slotHome(slot)
    const logsDir = join(home, 'logs')
    if (!existsSync(logsDir)) {
      record('logs', false, slot, `no logs dir: ${logsDir}`)
      continue
    }
    let newest = null
    let newestMtime = 0
    for (const f of readdirSync(logsDir)) {
      if (!/^(web-host\.log|desktop\.log)$/.test(f)) continue
      const t = statSync(join(logsDir, f)).mtimeMs
      if (t > newestMtime) {
        newestMtime = t
        newest = f
      }
    }
    if (!newest) {
      record('logs', false, slot, 'no web-host.log / desktop.log found')
      continue
    }
    const lines = tailFile(join(logsDir, newest), LOG_TAIL)
    const errs = lines.filter((l) => /\bERROR\b/.test(l))
    record(
      'logs',
      errs.length === 0,
      `${slot} (${newest})`,
      errs.length ? `${errs.length} ERROR line(s) in last ${LOG_TAIL}: ${errs[0].slice(0, 140)}${errs.length > 1 ? ' …' : ''}` : 'no recent ERROR lines',
    )
  }
}

// ── 8. ai-release switches (S9: switch state is a machine fact — always
//    report it; the OFF state is a valid configuration, so these rows show
//    the state but never fail the run) ──────────────────────────────────────
function checkAiRelease() {
  for (const slot of SLOTS_TO_CHECK) {
    const home = slotHome(slot)
    const file = aiReleasePath(home)
    if (!existsSync(home)) {
      record('airelease', false, slot, `no home: ${home}`)
      continue
    }
    const sw = readAiRelease(home)
    record(
      'airelease',
      true,
      slot,
      `allowed=${String(sw.allowed)} autoCloseNext=${String(sw.autoCloseNext)} (${existsSync(file) ? file : 'no file → per-key defaults'})`,
    )
  }
}

// ── run ───────────────────────────────────────────────────────────────────────
checkPackages()
checkClis()
await checkWeb()
checkProfiles()
checkSkillManager()
checkElectron()
checkLogs()
checkAiRelease()

// ── report ────────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({ projectRoot: PROJECT_ROOT, at: new Date().toISOString(), checks: results }, null, 2))
} else {
  for (const group of ['packages', 'clis', 'profiles', 'web', 'skillmgr', 'electron', 'logs', 'airelease']) {
    const rows = results.filter((r) => r.group === group)
    if (!rows.length) continue
    console.log(`\n[${group}]`)
    for (const r of rows) {
      console.log(`  ${r.ok ? '✓' : '✗'} ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
    }
  }
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, ${failed.length} failed` : ''}`)
}
process.exit(results.some((r) => !r.ok) ? 1 : 0)
