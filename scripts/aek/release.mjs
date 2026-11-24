#!/usr/bin/env node
/**
 * release.mjs — the S-round release loop (git-native, zero pointer files).
 *
 * Shape (user-ruling, S round): the DEV tree (main worktree) is where work
 * happens; the STABLE tree (a linked git worktree, never hand-edited) runs
 * the `current` slot. Releasing = cut a tag on the dev tree, check that tag
 * out in the stable tree, rebuild it from the frozen checkout, gate the
 * candidate web behind a smoke probe, and ONLY THEN swap current. Rollback
 * = check an old tag out + rebuild + swap. The current slot is never left
 * crashable by dev edits; a failed release touches current not one byte.
 *
 * Layout derivation (zero hardcoding): run the script from either tree.
 *   - this tree is the MAIN worktree  → it is the dev tree; the stable tree
 *     is the sole linked worktree of the shared repo (or --stable-dir)
 *   - this tree is a linked worktree   → it is the stable tree; the dev tree
 *     is the main worktree (or --dev-dir / $AEK_DEV_TREE)
 *   Overrides: --dev-dir / $AEK_DEV_TREE, --stable-dir / $AEK_STABLE_TREE.
 *
 * Machine-local state (NOT in the repo): <slot data root>/release-state.json
 * records currentTag / previousTag so `--rollback` without a ref restores
 * the pre-release pin.
 *
 * THE RUN (only with --yes, in this order — the dev-cycle order is kept):
 *   1  dev: tag dev-HEAD (auto name aek-<shortsha>, or --tag <ref>)
 *   2  stable: tracked-clean check → git checkout <tag> (detached)
 *   3  stable bootstrap (the verified cold-tree recipe):
 *        pnpm install --frozen-lockfile   (+ one lefthook re-anchor retry)
 *        tsx scripts/generate-typert.ts   (typert artifacts, pre-tsc)
 *        pnpm -r --filter './packages/aek/**' --filter './apps/aek-web' run build      (tsc/tsdown libs + aek-web vite dist)
 *        pnpm -r --filter './packages/aek/**' run build:cli  (coraek oclif commands)
 *        pnpm -r --filter './packages/aek/**' run bundle     (no AEK package carries it anymore)
 *        lib/types backfill (package-level host tsconfigs, discovered)
 *        pnpm run build:artifacts
 *   4  smoke gate: candidate web from the stable tree on port 1689,
 *      probe / until 200, then every resource the page references (plugin
 *      combos + app assets) until all 200 (90s cap); kill immediately.
 *      Fail = current untouched.
 *   5  swap: service.mjs uninstall all --yes → slots.mjs --stop-all --yes
 *      → slots.mjs --only aek --yes --health-timeout 90000 → service.mjs install aek --yes
 *      (the agent is installed FROM the stable tree, so its plist points at
 *       the stable tree's serve-slot.mjs) → wait for 1685, and the listener
 *      must belong to the agent's child chain (`serve-slot.mjs` in the
 *      ancestors) — a foreign dev-era holder does NOT pass the gate (II
 *      round: the 2026-11-17 false-positive left current wedged 43 min)
 *   6  record state (previousTag = old currentTag) and print the rollback ref
 *
 * ROLLBACK (--rollback [tag] --yes): steps 2-6 with the target ref; when the
 * ref is omitted the state file's previousTag is used.
 *
 * SAFETY
 *   - no arguments = plan only (read-only, zero side effects)
 *   - `--yes` executes; `--skip-smoke` weakens the gate (printed as a warning)
 *   - the stable worktree must be tracked-clean before checkout (build
 *     artifacts are untracked and never block)
 *   - aek-* tags are local structural refs: created with plain `git tag`
 *     (same exemption as `git worktree add` in stable-migrate.mjs)
 *
 * @module scripts/aek/release
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listenPids, SLOTS, slotHome, dualTreeLayout, isBuildFresh, slotWebUp, pruneDistApp } from './shared-logic.mjs'
import { buildFlagsEnv } from './build-flags.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const NODE = process.execPath
const SMOKE_PORT = 1689 // cpuh range 1680-1689; 1685-1688 are slot pairs
const CURRENT_WEB_PORT = SLOTS.aek.webPort

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? null : (argv[i + 1] ?? null)
}
const YES = flag('yes')
const JSON_OUT = flag('json')
const SKIP_SMOKE = flag('skip-smoke')
const ROLLBACK = flag('rollback')
const ROLLBACK_REF = value('rollback') // `--rollback <tag>` (explicit target)
const TAG_ARG = value('tag')
const DEV_DIR_ARG = value('dev-dir')
const STABLE_DIR_ARG = value('stable-dir')

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`[release] ${message}`)
  process.exit(1)
}

/** @returns {string} repo root: walk up from start to pnpm-workspace.yaml. */
function findRepoRoot(start) {
  let dir = start
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}

// ── Layout (dev / stable trees, derived — never hardcoded) ─────────────────

const THIS_ROOT = findRepoRoot(HERE)
const layout = dualTreeLayout(THIS_ROOT) // main worktree = dev; detached linked worktree = stable

const DEV_DIR = resolve(DEV_DIR_ARG ?? process.env.AEK_DEV_TREE ?? layout.dev)
const STABLE_DIR = resolve(
  STABLE_DIR_ARG ?? process.env.AEK_STABLE_TREE ?? (layout.stable ?? ''),
)

if (!DEV_DIR || !existsSync(join(DEV_DIR, 'pnpm-workspace.yaml'))) fail(`无法确定 dev 树（--dev-dir / $AEK_DEV_TREE 可覆盖）：${DEV_DIR}`)
if (!STABLE_DIR || !existsSync(join(STABLE_DIR, 'pnpm-workspace.yaml'))) fail(`无法确定 stable 树：本仓 detached linked worktree 数 ≠ 1（或布局异常）；请用 --stable-dir / $AEK_STABLE_TREE 显式指定`)
if (DEV_DIR === STABLE_DIR) fail('dev 与 stable 解析到同一棵树，布局异常：请显式 --dev-dir / --stable-dir')

// ── Git helpers ──────────────────────────────────────────────────────────────

/** @param {string[]} args @param {string} cwd @returns {string} */
function git(args, cwd) {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim()
}

/** @returns {{ clean: boolean, dirtyLines: string[] }} tracked-only status. */
function trackedStatus(root) {
  const out = git(['status', '--porcelain', '--untracked-files=no'], root)
  const lines = out ? out.split('\n') : []
  return { clean: lines.length === 0, dirtyLines: lines }
}

/** @returns {string} dev tree HEAD sha. */
function devHead() {
  return git(['rev-parse', 'HEAD'], DEV_DIR)
}

// ── Release state (machine-local, per-slot data root) ───────────────────────

const STATE_FILE = join(slotHome('aek'), 'release-state.json')

/** @returns {{ currentTag?: string, previousTag?: string, history?: { tag: string, at: string }[] }} */
function readState() {
  if (!existsSync(STATE_FILE)) return {}
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

/** @param {{ currentTag?: string, previousTag?: string, history?: { tag: string, at: string }[] }} state */
function writeState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

/** @returns {string} the tag the stable tree currently pins, if any. */
function stablePin() {
  try {
    return git(['describe', '--tags', '--exact-match', 'HEAD'], STABLE_DIR)
  } catch {
    return git(['rev-parse', '--short', 'HEAD'], STABLE_DIR)
  }
}

// ── Target resolution ───────────────────────────────────────────────────────

const state = readState()
let TARGET // tag name (or sha-ish ref) the stable tree will check out
let CREATES_TAG = false

if (ROLLBACK) {
  TARGET = ROLLBACK_REF ?? state.previousTag ?? null
} else {
  const head = devHead()
  const auto = `aek-${head.slice(0, 7)}`
  if (TAG_ARG) {
    TARGET = TAG_ARG
  } else if (existsSync(join(DEV_DIR, '.git')) && git(['tag', '-l'], DEV_DIR).split('\n').includes(auto)) {
    fail(`自动 tag 名 ${auto} 已存在：提交新内容或 --tag <name> 显式命名`)
  } else {
    TARGET = auto
    CREATES_TAG = true
  }
  // resolve to verify it points somewhere
  try {
    git(['rev-parse', '--verify', '--quiet', `${TARGET}^{commit}`], DEV_DIR)
    if (git(['rev-parse', TARGET], DEV_DIR) === head) {
      console.log(`[release] 提示：目标 ${TARGET} 即 dev HEAD，stable 当前钉 ${stablePin()}（相同则本次为空发布）`)
    }
  } catch {
    if (CREATES_TAG) CREATES_TAG = true // auto name: will be created now
    else fail(`${TAG_ARG} 解析不到 commit（打 tag 前确认它指向 dev 树已知 ref）`)
  }
}

// ── Candidate steps (shared by release and rollback) ────────────────────────

/** @param {string} root @param {string[]} args @returns {boolean} */
function pnpmRun(root, args) {
  console.log(`[release] → pnpm ${args.join(' ')} (in ${basename(root)})`)
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', timeout: 600_000 })
  return result.status === 0
}

/** @param {string} root @param {string} script @param {string[]} args @returns {boolean} */
function runStep(root, script, args) {
  console.log(`[release] → node scripts/aek/${script} ${args.join(' ')}`)
  const result = spawnSync(NODE, [join(root, 'scripts', 'aek', script), ...args], {
    cwd: root, stdio: 'inherit', timeout: 600_000,
  })
  return result.status === 0
}

/**
 * The verified cold-tree recipe (S1 execution): typert bootstrap, the AEK
 * package builds (workspace cycle allowed via pnpm-workspace.yaml), the
 * lib/types backfill for package-level host tsconfigs, then build:artifacts.
 * @param {string} root @returns {void} throws via fail()
 */
function bootstrap(root) {
  // BB round: the source-map build flag. The console's toggle persists
  // `<AEK_HOME>/build-flags.json` (the 'aek' slot — the one this release
  // builds and serves). Export it so the aek-web vite build (run via the
  // pnpm task below, which inherits process.env) honors it. Absent / off
  // keeps the historical no-map build.
  process.env.AEK_WEB_SOURCEMAP = buildFlagsEnv('aek').AEK_WEB_SOURCEMAP
  console.log(`[release] source-map build flag: AEK_WEB_SOURCEMAP=${process.env.AEK_WEB_SOURCEMAP}`)
  let installed = pnpmRun(root, ['install', '--frozen-lockfile'])
  if (!installed) {
    // Lefthook re-anchor self-heal: a worktree-scoped core.hooksPath that
    // outlived a directory move makes the postinstall refuse. Clear both
    // trees, re-anchor the dev tree, retry once.
    console.warn('[release] pnpm install 失败；尝试 lefthook 重锚后重试一次')
    for (const r of [DEV_DIR, root]) {
      try { execFileSync('git', ['config', '--worktree', '--unset', 'core.hooksPath'], { cwd: r, stdio: 'ignore' }) } catch { /* not set */ }
    }
    const reanchor = spawnSync(NODE, [join(DEV_DIR, 'scripts', 'install-lefthook.mjs')], {
      cwd: DEV_DIR, stdio: 'inherit', timeout: 120_000,
    })
    if (reanchor.status !== 0) console.warn('[release] dev 树 lefthook 重锚失败（不影响构建）')
    if (!pnpmRun(root, ['install', '--frozen-lockfile'])) fail('stable 树 pnpm install 失败；current 未动')
  }
  if (!pnpmRun(root, ['exec', 'tsx', 'scripts/generate-typert.ts'])) fail('typert 产物生成失败；current 未动')
  // The AEK runtime artifact surface. pnpm -r run <script> skips packages
  // without that script, so the three task names cover the whole set:
  //   build      — tsc/tsdown lib bundles (+ aek-websearch postbuild oclif readme)
  //                and the aek-web console's vite dist (apps/aek-web)
  //   build:cli  — coraek's oclif commands (lib/commands/*.mjs, incl. `web`)
  //   bundle     — (historically aek-home; no AEK package carries it anymore)
  for (const task of ['build', 'build:cli', 'bundle']) {
    if (!pnpmRun(root, ['-r', '--filter', './packages/aek/**', '--filter', './apps/aek-web', 'run', task])) {
      fail(`AEK 包 ${task} 失败（需 pnpm-workspace.yaml 的 ignoreWorkspaceCycles）；current 未动`)
    }
  }

  // lib/types backfill (discovered, idempotent on warm trees): some tsdown
  // entries are emitted only by a package-level host tsconfig no root tsc
  // program references (observed: packages/client/shortcuts).
  const cfgFiles = spawnSync('sh', [
    '-c', 'grep -rl --include=tsdown.config.ts "lib/types/" packages apps 2>/dev/null || true',
  ], { cwd: root, encoding: 'utf8' })
  const pkgDirs = [...new Set(
    (cfgFiles.stdout || '').trim().split('\n').filter(Boolean)
      .map((f) => f.slice(0, f.length - '/tsdown.config.ts'.length)),
  )]
  const missingByPkg = []
  for (const dir of pkgDirs) {
    const cfgText = readFileSync(join(root, dir, 'tsdown.config.ts'), 'utf8')
    const missing = [...new Set(cfgText.match(/lib\/types\/[\w./-]+\.js/g) ?? [])]
      .filter((entry) => !existsSync(join(root, dir, entry)))
    if (missing.length === 0) continue
    if (!existsSync(join(root, dir, 'tsconfig.host.json'))) {
      fail(`${dir} 的 tsdown 入口缺 ${missing.join(', ')} 且无包级 tsconfig.host.json 可补发；需人工修复，current 未动`)
    }
    missingByPkg.push(dir)
  }
  if (missingByPkg.length > 0 &&
    !pnpmRun(root, ['exec', 'tsc', '-b', ...missingByPkg.map((d) => join(d, 'tsconfig.host.json'))])) {
    fail('lib/types 补发（包级 host tsc）失败；current 未动')
  }

  if (!pnpmRun(root, ['run', 'build:artifacts'])) fail('stable 树构建失败；current 未动')
}

/** @param {string} root @returns {Promise<boolean>} start candidate web, probe /, kill. */
async function smokeWeb(root) {
  const bin = join(root, 'packages', 'aek', 'base', 'coraek', 'bin', 'aek.mjs')
  const home = slotHome('aek')
  // `detached` makes the child its own process-group leader so teardown can
  // kill the WHOLE tree: the candidate web spawns a nested host that is the
  // process actually owning SMOKE_PORT — a plain SIGTERM to the direct child
  // leaks it (observed: a leaked 1689 listener blocks the next release).
  const child = spawn(NODE, [bin, 'web', '--port', String(SMOKE_PORT), '--no-open'], {
    cwd: root,
    env: { ...process.env, AEK_HOME: home, DSH_HOME: home },
    stdio: 'ignore',
    detached: true,
  })
  // Attach the exit/error listener BEFORE the child can die — a lost 'exit'
  // event leaves the teardown promise unsettled and Node exits with an
  // "unsettled top-level await" warning (a false "success" for the gate).
  const exited = new Promise((r) => {
    child.once('exit', () => r())
    child.once('error', () => r()) // spawn failure emits 'error', not 'exit'
  })
  // A root 200 is NOT enough: the SPA only boots when every resource the
  // page references is served — the dsh-client-modules bootstrap combo first
  // (if it 404s the module system is never created and the user stares at a
  // blank, "no change at all" page), then the app bundle + CSS. One 404 in
  // that set fails the gate and the current slot stays untouched.
  const fetchBody = (url) => new Promise((resolveFetch) => {
    let body = ''
    httpGet(url, (res) => {
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolveFetch({ status: res.statusCode, body }))
    }).on('error', () => resolveFetch({ status: 0, body: '' }))
  })
  const base = `http://127.0.0.1:${String(SMOKE_PORT)}`
  const ok = await (async () => {
    const start = Date.now()
    let lastBad = null
    while (Date.now() - start < 90_000) {
      const root = await fetchBody(`${base}/`)
      if (root.status === 200 && root.body !== '') {
        // Local references only: `plugins/??…` combos (+ `&amp;rev=…` as the
        // raw body escapes it) and the `assets/` bundle/CSS.
        const paths = [...new Set(
          [...root.body.matchAll(/(?:src|href)="([^"]+)"/g)]
            .map((match) => match[1])
            .filter((ref) => ref.startsWith('plugins/') || ref.startsWith('./assets/') || ref.startsWith('assets/'))
            .map((ref) => ref.replace(/^\.\/|&amp;/g, (token) => (token === './' ? '' : '&'))),
        )].sort()
        const bad = []
        for (const path of paths) {
          const resource = await fetchBody(`${base}/${path}`)
          if (resource.status !== 200) bad.push(`${path} -> HTTP ${resource.status}`)
        }
        if (bad.length === 0) return true
        if (JSON.stringify(bad) !== JSON.stringify(lastBad)) {
          console.warn(`[release] smoke: page is up but ${String(bad.length)} referenced resource(s) are not 200 yet — the candidate will not swap until every one serves:\n  ${bad.join('\n  ')}`)
          lastBad = bad
        }
      }
      await new Promise((sleep) => { setTimeout(sleep, 2_000) })
    }
    if (lastBad !== null) console.warn(`[release] smoke: still failing after 90s:\n  ${lastBad.join('\n  ')}`)
    return false
  })()
  // Kill the whole process group (detached child is a group leader), with a
  // SIGTERM → SIGKILL escalation, so the nested web host that owns
  // SMOKE_PORT cannot leak and block the next release/rollback.
  const killGroup = (sig) => {
    try { process.kill(-child.pid, sig) } catch { /* already gone */ }
  }
  killGroup('SIGTERM')
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5_000))])
  if (child.exitCode === null && child.signalCode === null) {
    killGroup('SIGKILL')
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5_000))])
  }
  return ok
}

/** @param {number} port @param {number} timeoutMs @returns {Promise<boolean>} */
function describePid(pid) {
  try {
    const cmd = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 3_000 }).trim()
    return `pid ${String(pid)} — ${cmd.slice(0, 160)}`
  } catch {
    return `pid ${String(pid)} (command unknown)`
  }
}

/**
 * II round: the ownership probe for the health gate. A listener belongs to the
 * slot's agent when its ANCESTOR CHAIN contains the slot's `serve-slot.mjs`
 * supervisor (launchd → serve-slot.mjs → launch.mjs → … → the web host).
 * Anything else — a terminal dev session, a stale holder, a dev-era tsx —
 * may be missing the launcher flags the agent passes (`--trusted-host`),
 * which degrades the backend silently.
 * @param {string} slot
 * @param {number} pid
 * @returns {boolean}
 */
function listenerOwnedBySlot(slot, pid) {
  const marker = `serve-slot.mjs --slot ${slot}`
  let current = Number(pid)
  for (let hop = 0; hop < 12 && current > 1; hop++) {
    let ppid = 1
    try {
      const out = execFileSync('ps', ['-o', 'ppid=,command=', '-p', String(current)], { encoding: 'utf8', timeout: 3_000 }).trim()
      const [head, ...rest] = out.split(' ')
      ppid = Number.parseInt(head, 10) || 1
      if (rest.join(' ').includes(marker)) return true
    } catch {
      break // the holder died between the lsof and this probe
    }
    current = ppid
  }
  return false
}

/**
 * Wait until the port answers AND the listener belongs to the slot's agent.
 * II round: the 2026-11-17 release false-positive — a stray dev-era tsx held
 * the slot port, so a plain "someone is listening" check reported success
 * while the real agent child stayed wedged behind the supervisor for 43
 * minutes (the user's "新建运行时白屏" incident). Foreign holders are reported
 * once per pid with the kill path, and the gate stays closed until the
 * listener is agent-owned; at the deadline the caller fails with a rollback.
 */
async function waitForPortOwned(slot, port, timeoutMs) {
  const start = Date.now()
  const warned = new Set()
  while (Date.now() - start < timeoutMs) {
    for (const pid of listenPids(port)) {
      if (listenerOwnedBySlot(slot, pid)) return true
      if (!warned.has(pid)) {
        warned.add(pid)
        console.warn(`[release] ⚠️ ${String(port)} is held by a process that is NOT the ${slot} agent's child: ${describePid(pid)}`)
        console.warn(`[release]    It may lack the launcher flags the agent passes — the backend would run degraded. The gate stays closed: kill ${String(pid)} (or reload the slot's LaunchAgent) to hand the port back; at the deadline this release fails with a rollback.`)
      }
      break
    }
    await new Promise((r) => setTimeout(r, 3_000))
  }
  return false
}

/**
 * BF round: wait until the slot's web answers on its port (1s poll, listener +
 * marker — shared-logic `slotWebUp`). Run AFTER the slot's supervisor agent is
 * installed, so the expected owner is the agent's KeepAlive web. The OWNERSHIP
 * commit gate (`waitForPortOwned`) still runs afterwards; this gate only says
 * "something is serving the candidate".
 * @param {string} slot @param {number} timeoutMs @returns {Promise<boolean>}
 */
async function waitSlotWebUp(slot, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (slotWebUp(slot)) return true
    await new Promise((r) => setTimeout(r, 1_000))
  }
  return false
}

// ── Plan (read-only) ────────────────────────────────────────────────────────

function plan() {
  const head = devHead()
  const pin = stablePin()
  const stableClean = trackedStatus(STABLE_DIR)
  const smokeBusy = listenPids(SMOKE_PORT).length > 0
  const lines = []
  lines.push(`[release] 动作 = ${ROLLBACK ? `回滚 → ${TARGET ?? '（无目标：state 无 previousTag 且未显式给 --rollback <tag>，执行会拒）'}` : `发布 ${CREATES_TAG ? `（新建 tag ${TARGET} @ dev HEAD ${String(head).slice(0, 8)}）` : `（现有 ref ${TARGET}）`}`}`)
  lines.push(`  dev     ${DEV_DIR}（HEAD ${String(head).slice(0, 8)}）`)
  lines.push(`  stable  ${STABLE_DIR}（现钉 ${pin}；tracked ${stableClean.clean ? '干净' : `不干净 ${String(stableClean.dirtyLines.length)} 条——冻结树漂移，执行会先拒`}）`)
  lines.push(`  state   ${STATE_FILE} → current=${state.currentTag ?? '（无）'} previous=${state.previousTag ?? '（无）'}`)
  if (ROLLBACK) {
    lines.push(`  2  stable: checkout ${TARGET}（detached）+ 冷树引导 + build:artifacts`)
  } else {
    lines.push(CREATES_TAG ? `  1  dev: git tag ${TARGET}` : '  1  dev: 使用现有 ref')
    lines.push(`  2  stable: checkout ${TARGET}（detached）+ 冷树引导 + build:artifacts`)
  }
  lines.push(`  3  冒烟门禁：候选 web ${SMOKE_PORT} 探针${SKIP_SMOKE ? '（已 --skip-smoke，注意门禁被削弱）' : smokeBusy ? `（${SMOKE_PORT} 当前被占用，执行时会先要求腾空或 --skip-smoke）` : ''}`)
  lines.push('  4  换 current：service.mjs uninstall all → slots.mjs --stop-all → service.mjs install aek（agent 起 web）→ 等 web 健康（darwin 再加 agent-child 属主门）')
  lines.push(`  5  记录 state（previousTag = 旧 ${state.currentTag ?? '（无）'}）；回滚：node scripts/aek/release.mjs --rollback --yes`)
  // Y round: read-only shell-staleness probe in the plan too (B-round
  // near-miss: release ships the web plane; the packaged shell asar is a
  // separate desktop.mjs concern and must at least be WARNED about).
  lines.push(isBuildFresh('aek')
    ? '  壳  打包壳 asar 与 electron 层输入一致（isBuildFresh ✓）'
    : '  壳  ⚠️ 打包壳 asar 可能过期（electron 层输入自上次 desktop.mjs build 后有变更，或本树从未打包）——发布后按需：node scripts/aek/desktop.mjs build aek --yes && node scripts/aek/desktop.mjs install aek --yes（纯 webui 改动可忽略）')
  return lines
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    action: ROLLBACK ? 'rollback' : 'release',
    target: TARGET,
    createsTag: CREATES_TAG,
    dev: DEV_DIR,
    stable: STABLE_DIR,
    devHead: devHead(),
    stablePin: stablePin(),
    state,
    skipSmoke: SKIP_SMOKE,
  }, null, 2))
  process.exit(0)
}

if (!YES) {
  for (const line of plan()) console.log(line)
  console.log('')
  console.log(`[release] 真正执行：node scripts/aek/release.mjs ${ROLLBACK ? `--rollback${ROLLBACK_REF ? ` ${ROLLBACK_REF}` : ''}` : ''} --yes`)
  process.exit(0)
}

// ── Execute ──────────────────────────────────────────────────────────────────

if (ROLLBACK && !TARGET) {
  fail('回滚目标缺失：state 里没有 previousTag 且未显式给 --rollback <tag>（第一次发布前回滚无意义）')
}

if (!ROLLBACK && CREATES_TAG) {
  git(['tag', TARGET], DEV_DIR)
  console.log(`[release] dev 树已打 tag ${TARGET}`)
}

try {
  git(['rev-parse', '--verify', '--quiet', `${TARGET}^{commit}`], STABLE_DIR)
} catch {
  fail(`目标 ${TARGET} 解析不到 commit（tag 是仓级 ref，两树可见）；current 未动`)
}

const stableStatus = trackedStatus(STABLE_DIR)
if (!stableStatus.clean) {
  fail(`stable 树 tracked 不干净（${String(stableStatus.dirtyLines.length)} 条：${stableStatus.dirtyLines.slice(0, 3).join(' / ')}…）——冻结树漂移了；先人工修复（checkout 旧 tag 或清理）再发布/回滚，current 未动`)
}
git(['checkout', TARGET], STABLE_DIR)
console.log(`[release] stable 树已钉 ${TARGET}`)

bootstrap(STABLE_DIR)

// Prune EVERY dist .app left in the STABLE tree (all arch halves — the x64
// half `dist/<slot>/mac/` was the one the old single-path prune missed,
// 复盘 §200 坑 131/132). The stable tree is where release builds happen, and
// its dist copies had no cleanup flow, so an 8-day-old 0.1.0 .app survived
// in a Spotlight-indexed path (user principle m02053: one app per slot).
for (const s of Object.keys(SLOTS)) {
  if (pruneDistApp(s, STABLE_DIR)) {
    console.log(`[release] stable 树 dist 里的 ${s} .app 副本已清理（全 arch）`)
  }
}

if (SKIP_SMOKE) {
  console.warn(`[release] 冒烟被 --skip-smoke 跳过（门禁已削弱，请知悉）`)
} else if (listenPids(SMOKE_PORT).length > 0) {
  fail(`冒烟端口 ${SMOKE_PORT} 被占用，无法验证候选代码；current 未动（先腾空端口或 --skip-smoke 自担风险）`)
} else if (!(await smokeWeb(STABLE_DIR))) {
  fail('冒烟失败：候选 web 90s 内没回 200。current 未动；回退：git -C stable 树 checkout 旧 tag 即可')
}
console.log('[release] 冒烟通过：候选代码可启动')

// The ONLY swap point: candidate built + smoked. Now (dev-cycle order):
if (!runStep(STABLE_DIR, 'service.mjs', ['uninstall', 'all', '--yes'])) fail('卸 LaunchAgent 失败；current 已停但 agent 未卸——手动：node scripts/aek/service.mjs uninstall all --yes（stable 树）')
if (!runStep(STABLE_DIR, 'slots.mjs', ['--stop-all', '--yes'])) fail('stop-all 失败；current 已停——手动：node scripts/aek/slots.mjs --stop-all --yes（stable 树）')
// BF round: the slot supervisor (serve-slot.mjs, KeepAlive) is the ONLY
// reliable owner of the slot port. The OLD step here started current through
// the arbiter (`slots.mjs --only aek`), whose web child died the moment the
// arbiter exited (piped stdio → EPIPE on the first console write; root-caused
// 2026-11-22, 复盘 §170), so the 90s health gate could never pass and the swap
// aborted BEFORE the agent was (re)installed — leaving the port down with no
// supervisor (复盘 §169 定案 1). New order: install the agent FIRST and let
// its own web claim the port; the wait below proves the candidate is
// serving, and `waitForPortOwned` (darwin) is the ownership commit point.
// Y round: the old code trusted the exit code alone, but service.mjs used to
// swallow bootstrap failures (agent left UNLOADED while exit 0 said OK) —
// now verify the real launchd state, auto-retry ONCE, then warn loudly.
const svcInstall = [join(STABLE_DIR, 'scripts', 'aek', 'service.mjs'), 'install', 'aek', '--yes']
const runSvcInstall = () => spawnSync(NODE, svcInstall, { cwd: STABLE_DIR, stdio: 'inherit', timeout: 120_000 })
const agentLoadedAek = () => {
  if (process.platform !== 'darwin') return null // no launchd → nothing to check
  try {
    execFileSync('launchctl', ['print', `gui/${String(process.getuid())}/com.cheezmil.aek.web.aek`], {
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000,
    })
    return true
  } catch {
    return false
  }
}
runSvcInstall()
let agentLoaded = agentLoadedAek()
if (agentLoaded === false) {
  console.warn('[release] current 的 LaunchAgent 注册后未加载（静默失败实查）——自动补装重试一次（stable 树）')
  runSvcInstall()
  agentLoaded = agentLoadedAek()
}
if (agentLoaded === false) {
  console.warn('[release] 警告：LaunchAgent 补装后仍未加载（开机自启需手动：node <stable 树>/scripts/aek/service.mjs install aek --yes 或 launchctl bootstrap gui/<uid> <plist>）——下方健康门仍会拦住未起服的 current')
}
if (agentLoaded === null) {
  // non-darwin: there is no launchd supervisor — fall back to the arbiter
  // start; since the BF round its web child logs to a file and survives the
  // arbiter exit, so the health gate below can actually pass.
  if (!runStep(STABLE_DIR, 'slots.mjs', ['--only', 'aek', '--yes', '--health-timeout', '90000'])) fail('起 current 失败（90s 内未健康）——回滚：node scripts/aek/release.mjs --rollback --yes')
}
if (!(await waitSlotWebUp('aek', 90_000))) fail('起 current 失败（web 90s 内未健康）——回滚：node scripts/aek/release.mjs --rollback --yes')
if (agentLoaded !== null && !(await waitForPortOwned('aek', CURRENT_WEB_PORT, 90_000))) fail(`current web（${CURRENT_WEB_PORT}）90s 内没有由槽 agent 的子进程持有（外部长占进程会在上方逐次告警）——先 kill 告警里的 pid（或 reload 该槽 LaunchAgent）后重跑本步骤；或回滚：node scripts/aek/release.mjs --rollback --yes`)
console.log(`[release] current 已起（${CURRENT_WEB_PORT}，${STABLE_DIR} @ ${TARGET}）`)

// record state
const prev = state.currentTag
writeState({
  currentTag: TARGET,
  previousTag: prev ?? null,
  updatedAt: new Date().toISOString(),
  history: [...(state.history ?? []), { tag: TARGET, at: new Date().toISOString() }].slice(-20),
})
console.log(`[release] state 已记录：previousTag=${prev ?? '（无）'} → 回滚：node scripts/aek/release.mjs --rollback --yes`)

// Y round tail (B-round near-miss): release ships the web plane only. If the
// electron-layer inputs changed since the last shell build, the installed
// AEK.app asar no longer matches the released code — say so. Warn only: a
// pure-webui round may ignore it (AGENTS §6: shell re-package is NOT a
// release step), but the operator now sees the gap instead of discovering it
// a round later.
if (!isBuildFresh('aek')) {
  console.warn('[release] ⚠️ 壳 asar 与本次发布可能不一致：apps/aek-desktop/v0 的 electron 层输入（src/、builder 配置、manifest、entitlements）自上次 desktop.mjs build 后有变更（或本树从未打包过壳）。')
  console.warn('         纯 webui 改动可忽略；需同步打包壳：node scripts/aek/desktop.mjs build aek --yes && node scripts/aek/desktop.mjs install aek --yes')
} else {
  console.log('[release] 壳 asar 与 electron 层输入一致（isBuildFresh ✓）')
}
