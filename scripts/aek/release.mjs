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
 *      probe / until 200 (90s), kill immediately. Fail = current untouched.
 *   5  swap: service.mjs uninstall all --yes → slots.mjs --stop-all --yes
 *      → slots.mjs --only aek --yes → service.mjs install aek --yes
 *      (the agent is installed FROM the stable tree, so its plist points at
 *       the stable tree's serve-slot.mjs) → wait for 1685
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
import { listenPids, SLOTS, slotHome, dualTreeLayout } from './shared-logic.mjs'

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
  const ok = await new Promise((resolveProbe) => {
    const start = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - start > 90_000) {
        clearInterval(timer)
        resolveProbe(false)
        return
      }
      const req = httpGet(`http://127.0.0.1:${String(SMOKE_PORT)}/`, (res) => {
        res.resume()
        if (res.statusCode === 200) {
          clearInterval(timer)
          resolveProbe(true)
        }
      })
      req.on('error', () => { /* keep polling */ })
      req.end()
    }, 2_000)
  })
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
async function waitForPort(port, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (listenPids(port).length > 0) return true
    await new Promise((r) => setTimeout(r, 3_000))
  }
  return listenPids(port).length > 0
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
  lines.push('  4  换 current：service.mjs uninstall all → slots.mjs --stop-all → slots.mjs --only aek → service.mjs install aek → 等 1685')
  lines.push(`  5  记录 state（previousTag = 旧 ${state.currentTag ?? '（无）'}）；回滚：node scripts/aek/release.mjs --rollback --yes`)
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
if (!runStep(STABLE_DIR, 'slots.mjs', ['--only', 'aek', '--yes'])) fail('起 current 失败——回滚：node scripts/aek/release.mjs --rollback --yes')
// Non-fatal by design (same posture as stable-migrate): the web is already
// up; losing the agent only means no login autostart until re-registered.
const installed = spawnSync(NODE, [join(STABLE_DIR, 'scripts', 'aek', 'service.mjs'), 'install', 'aek', '--yes'], {
  cwd: STABLE_DIR, stdio: 'inherit', timeout: 120_000,
})
if (installed.status !== 0) console.warn('[release] 警告：LaunchAgent 重装失败（web 已在跑；开机自启需手动 service.mjs install aek --yes）')
if (!(await waitForPort(CURRENT_WEB_PORT, 90_000))) fail(`current web（${CURRENT_WEB_PORT}）90s 内未起来——回滚：node scripts/aek/release.mjs --rollback --yes`)
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
