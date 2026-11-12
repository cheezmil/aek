#!/usr/bin/env node
/**
 * stable-migrate — one-shot migration to the two-tree layout.
 *
 * WHY THIS EXISTS
 * Both slots currently run their code from the ONE live source tree: the
 * `aek` (current) slot's web backend is launched from this tree via tsx, and
 * the global CLI symlinks point into this tree. Editing code therefore can
 * break `current` at the next restart. The fix is a code channel split:
 *
 *   <clone parent>/aek       stable tree   git worktree, pinned to a verified
 *   <clone parent>/aek-next  dev tree      main worktree, may break freely
 *
 * The layout is DERIVED, never hardcoded: the stable root is this repo (found
 * by walking up to `pnpm-workspace.yaml`), and the dev target is its SIBLING
 * directory named `aek-next` (override: `--dev-dir <path>` or `AEK_DEV_TREE`).
 * Every developer clones wherever they like; nothing here spells out a home
 * directory or a project path.
 *
 * AFTER THE MIGRATION, all pre-existing pointers (LaunchAgent plists,
 * `~/.local/bin/aek*` symlinks, the desktop install path) keep pointing at the
 * stable root — they are automatically correct, because the stable root IS the
 * path they already used. Only dev-side references need re-pointing (printed
 * at the end; this tool never edits user-local files).
 *
 * THE RUN (only with --yes, in this order, dev-cycle's proven order first):
 *   1  service.mjs uninstall all --yes   (KeepAlive would resurrect the web)
 *   2  slots.mjs --stop-all --yes        (both slots quiet)
 *   3  rename stable root -> dev target  (same sibling volume: instant)
 *   4  git -C <dev> worktree add --detach <stable root> <tag>
 *   4b re-anchor lefthook: the move leaves a stale worktree-scoped
 *      core.hooksPath (absolute <gitdir>/dsh-hooks) in both trees; the
 *      postinstall refuses to overwrite it, so clear both and re-anchor
 *   5  stable: pnpm install --frozen-lockfile, then fresh-tree bootstrap
 *      (generate-typert + the AEK-owned package builds + lib/types backfill
 *      for packages whose tsdown entries their root tsc program never emits)
 *      + pnpm run build:artifacts
 *   6  smoke: candidate web on port 1689, probe /, kill immediately
 *   7  stable: slots.mjs --only aek --yes + service.mjs install aek --yes
 *      (the agent is installed FROM the stable tree, so its plist points at
 *       the stable tree's serve-slot.mjs — and then we wait for 1685 to come up)
 *
 * ROLLBACK (--rollback --yes) reverses 3-7: worktree remove, rename back,
 * re-install the agent from the restored tree. The pre-migration state is
 * restored exactly, including the agent's original target.
 *
 * SAFETY
 *   - No arguments = read-only plan. `--json` = machine-readable plan.
 *   - ONLY `--yes` changes anything; ONLY `--rollback --yes` undoes it.
 *   - A dirty working tree refuses to run with the default tag: the stable
 *     worktree must pin a VERIFIED commit. Either commit first, or pass
 *     `--tag <ref>` to pin an explicit ancestor.
 *   - The dev target must not exist (or be empty). Nothing is ever written
 *     into an existing directory.
 *   - `git worktree add` is a local structural operation (no commit, no
 *     push): it deliberately does not go through cqg. Commits still do.
 *   - The smoke gate (step 6) runs the candidate code BEFORE the agent is
 *     re-installed; a broken tag aborts with the system left stopped, and
 *     `--rollback --yes` brings everything back.
 *
 * Usage:
 *   node scripts/aek/stable-migrate.mjs                     # plan, read-only
 *   node scripts/aek/stable-migrate.mjs --json              # plan, machine-readable
 *   node scripts/aek/stable-migrate.mjs --yes               # run the migration
 *   node scripts/aek/stable-migrate.mjs --yes --tag <ref>   # pin an explicit tag
 *   node scripts/aek/stable-migrate.mjs --dev-dir <path>    # non-sibling dev tree
 *   node scripts/aek/stable-migrate.mjs --skip-smoke --yes  # skip the smoke gate
 *   node scripts/aek/stable-migrate.mjs --rollback --yes    # undo a migration
 *
 * @module scripts/aek/stable-migrate
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listenPids, SLOTS } from './shared-logic.mjs'
import { slotHome } from '../../packages/aek/base/coraek/slots.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const NODE = process.execPath
const SMOKE_PORT = 1689 // inside the project's cpuh range 1680-1689; 1685-1688 are slot pairs

/** @returns {string} repo root: walk up from this script to pnpm-workspace.yaml. */
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

// ── Argument parsing ─────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? null : (argv[i + 1] ?? null)
}
const YES = flag('yes')
const JSON_OUT = flag('json')
const ROLLBACK = flag('rollback')
const SKIP_SMOKE = flag('skip-smoke')
const TAG_ARG = value('tag')
const DEV_DIR_ARG = value('dev-dir')

/** @returns {string} */
function fail(message) {
  console.error(`[stable-migrate] ${message}`)
  process.exit(1)
}

// ── Derived layout (never hardcoded) ─────────────────────────────────────────

const STABLE_ROOT = findRepoRoot(HERE)
const DEV_TARGET = resolve(DEV_DIR_ARG ?? process.env.AEK_DEV_TREE ?? join(dirname(STABLE_ROOT), 'aek-next'))

if (basename(STABLE_ROOT) === 'aek-next' && existsSync(join(dirname(STABLE_ROOT), 'aek', '.git'))) {
  fail(`this tree is already the DEV tree (${STABLE_ROOT}); the migration seems done — ` +
    'run the release loop instead, or check `git worktree list` in the stable tree.')
}

// ── Git helpers ──────────────────────────────────────────────────────────────

/** @param {string[]} args @param {string} [cwd] @returns {string} */
function git(args, cwd = STABLE_ROOT) {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim()
}

/** @returns {{ clean: boolean, dirtyLines: number }} */
function treeStatus() {
  const out = git(['status', '--porcelain'])
  return { clean: out === '', dirtyLines: out ? out.split('\n').length : 0 }
}

/**
 * Resolve the pin (SOFT: the plan must stay readable even when the pin is not
 * yet usable). Default = HEAD; on a dirty tree that default is rejected at
 * execution time — the stable worktree must carry a VERIFIED commit, so a
 * dirty tree must name an explicit ref via `--tag`.
 * @returns {{ ref: string, sha: string, explicit: boolean }}
 */
function resolvePin() {
  const ref = TAG_ARG ?? 'HEAD'
  let sha = ''
  try {
    sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  } catch { /* unreadable ref */ }
  return { ref, sha, explicit: Boolean(TAG_ARG) }
}

/** @returns {void} throws via fail() when the pin is not usable for a run. */
function assertPinUsable(pin, status) {
  if (!pin.sha) fail(`tag/ref ${pin.ref} 解析不到 commit（--tag 传一个已验收的 ref）`)
  if (!pin.explicit && !status.clean) {
    fail(`工作区不干净（${String(status.dirtyLines)} 条改动）：stable 树不能钉一个未验收的状态。` +
      '先 `cqg acp --all` 提交，或 `--tag <ref>` 显式钉一个已验收的祖先。')
  }
}

// ── Slot / port evidence ─────────────────────────────────────────────────────

/** @returns {string[]} human-readable busy lines for both slots. */
function runningSlots() {
  const busy = []
  for (const slot of Object.keys(SLOTS)) {
    for (const port of [SLOTS[slot].webPort, SLOTS[slot].cdpPort]) {
      for (const pid of listenPids(port)) busy.push(`${slot}: pid ${pid} 占用端口 ${String(port)}`)
    }
    const pidFile = join(slotHome(slot), '.aek-runtime.pid')
    if (existsSync(pidFile)) {
      const pid = readFileSync(pidFile, 'utf8').trim()
      try {
        process.kill(Number(pid), 0)
        busy.push(`${slot}: pid ${pid}（.aek-runtime.pid 仍存活）`)
      } catch { /* stale pid file */ }
    }
  }
  return busy
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

/** @param {string} root @returns {Promise<boolean>} start, probe, kill. */
async function smokeWeb(root) {
  const bin = join(root, 'packages', 'aek', 'base', 'coraek', 'bin', 'aek.mjs')
  const home = slotHome('aek')
  const child = spawn(NODE, [bin, 'web', '--port', String(SMOKE_PORT), '--no-open'], {
    cwd: root,
    env: { ...process.env, AEK_HOME: home, DSH_HOME: home },
    stdio: 'ignore',
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
        const good = res.statusCode === 200
        if (good) {
          clearInterval(timer)
          resolveProbe(true)
        }
      })
      req.on('error', () => { /* keep polling */ })
      req.end()
    }, 2_000)
  })
  child.kill('SIGTERM')
  await new Promise((r) => child.once('exit', () => r(undefined)))
  return ok
}

/** @param {string} root @param {string} script @param {string[]} args @returns {boolean} */
function runStep(root, script, args) {
  console.log(`[stable-migrate] → node scripts/aek/${script} ${args.join(' ')}`)
  const result = spawnSync(NODE, [join(root, 'scripts', 'aek', script), ...args], {
    cwd: root, stdio: 'inherit', timeout: 600_000,
  })
  return result.status === 0
}

/** @param {string} root @param {string[]} args @returns {boolean} */
function pnpmRun(root, args) {
  console.log(`[stable-migrate] → pnpm ${args.join(' ')} (in ${basename(root)})`)
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', timeout: 600_000 })
  return result.status === 0
}

// ── Plan (read-only) ─────────────────────────────────────────────────────────

const pin = ROLLBACK ? null : resolvePin()

/** @returns {{ ok: boolean, detail: string }[]} */
function checks() {
  const list = []
  if (ROLLBACK) {
    list.push({
      ok: existsSync(join(DEV_TARGET, '.git')) || existsSync(join(DEV_TARGET, '.git', 'worktrees')),
      detail: `dev 树 ${DEV_TARGET}（rollback 需要它在）`,
    })
    return list
  }
  const targetEmpty = !existsSync(DEV_TARGET) || readdirSync(DEV_TARGET).length === 0
  list.push({ ok: !existsSync(DEV_TARGET) || targetEmpty, detail: `dev 目标不存在或为空：${DEV_TARGET}` })
  list.push({ ok: existsSync(join(STABLE_ROOT, '.git')), detail: `仓库根（.git 存在）：${STABLE_ROOT}` })
  const status = treeStatus()
  list.push({
    ok: TAG_ARG ? true : status.clean,
    detail: TAG_ARG
      ? `显式 --tag ${TAG_ARG}（工作区 ${status.clean ? '干净' : `不干净 ${String(status.dirtyLines)} 条，将随树移到 dev 侧`}）`
      : (status.clean ? `工作区干净，钉 HEAD（${String(pin?.sha ?? '不可解析').slice(0, 8)}）` : `工作区不干净（${String(status.dirtyLines)} 条）→ 需提交或显式 --tag`),
  })
  list.push({ ok: Boolean(pin?.sha), detail: `钉 tag = ${pin?.ref} → ${String(pin?.sha ?? '不可解析').slice(0, 12)}` })
  const busy = runningSlots()
  list.push({ ok: busy.length === 0, detail: busy.length === 0 ? '两槽端口与 pid 文件均空闲' : busy.join('；') + '（--yes 会先卸 agent + stop-all）' })
  const pnpm = spawnSync('pnpm', ['--version'], { stdio: 'pipe' })
  list.push({ ok: pnpm.status === 0, detail: pnpm.status === 0 ? `pnpm ${String(pnpm.stdout).trim()}` : 'pnpm 不在 PATH' })
  let buildScript = false
  try { buildScript = Boolean(JSON.parse(readFileSync(join(STABLE_ROOT, 'package.json'), 'utf8')).scripts?.['build:artifacts']) } catch { /* no root pkg */ }
  list.push({ ok: buildScript, detail: buildScript ? '根 package.json 有 build:artifacts' : '根 package.json 无 build:artifacts（步骤 6 将跳过构建）' })
  const smokeBusy = listenPids(SMOKE_PORT).length > 0
  list.push({ ok: !smokeBusy || SKIP_SMOKE, detail: smokeBusy ? `冒烟端口 ${SMOKE_PORT} 被占用（--skip-smoke 可跳过，门禁被削弱）` : `冒烟端口 ${SMOKE_PORT} 空闲` })
  return list
}

function manualRepoints() {
  return [
    `1. 本机备份工具 aekbak 的 SRC 行：改为 dev 树 ${DEV_TARGET}（用户级脚本，本工具不代改）`,
    `2. quick-git center-config 里的项目路径（若指旧路径）：改指 ${DEV_TARGET}`,
    `3. 开发习惯 / agent 约定：「项目目录」从此 = ${DEV_TARGET}；current 侧一切（LaunchAgent、~/.local/bin/aek*、desktop 安装路径）保持不变、自动正确`,
    `4. next 槽的 LaunchAgent（若开发期要装）：必须从 dev 树 ${DEV_TARGET} 执行 service.mjs install，plist 才会指到 dev 树`,
  ]
}

if (JSON_OUT && !ROLLBACK) {
  console.log(JSON.stringify({
    mode: YES ? 'EXECUTE' : 'PLAN',
    stableRoot: STABLE_ROOT,
    devTarget: DEV_TARGET,
    pin: { ref: pin?.ref, sha: pin?.sha, explicit: pin?.explicit },
    checks: checks(),
    smokePort: SMOKE_PORT,
    smokeSkipped: SKIP_SMOKE,
    manualRepoints: manualRepoints(),
  }, null, 2))
  process.exit(0)
}

// ── Rollback ─────────────────────────────────────────────────────────────────

if (ROLLBACK) {
  if (!YES) {
    console.log('[stable-migrate] rollback PLAN（未加 --yes，什么都没改）：')
    console.log('  1  service.mjs uninstall aek --yes（若 agent 还在）')
    console.log(`  2  git -C ${DEV_TARGET} worktree remove --force ${STABLE_ROOT} + worktree prune`)
    console.log(`  3  rename ${DEV_TARGET} -> ${STABLE_ROOT}`)
    console.log('  4  从还原后的树：slots.mjs --only aek --yes + service.mjs install aek --yes')
    console.log('  执行：node scripts/aek/stable-migrate.mjs --rollback --yes')
    process.exit(0)
  }
  const agentRoot = existsSync(join(STABLE_ROOT, 'scripts', 'aek', 'service.mjs')) ? STABLE_ROOT : DEV_TARGET
  if (existsSync(join(agentRoot, 'scripts', 'aek', 'service.mjs'))) {
    runStep(agentRoot, 'service.mjs', ['uninstall', 'aek', '--yes'])
  }
  try {
    git(['worktree', 'remove', '--force', STABLE_ROOT], DEV_TARGET)
    git(['worktree', 'prune'], DEV_TARGET)
  } catch (error) {
    console.log(`[stable-migrate] worktree remove 跳过（可能已不存在）：${String(error.message).split('\n')[0]}`)
  }
  if (existsSync(STABLE_ROOT)) fail(`rollback 受阻：${STABLE_ROOT} 仍存在，worktree 元数据见上，人工处理后重试`)
  renameSync(DEV_TARGET, STABLE_ROOT)
  console.log(`[stable-migrate] 已还原：${DEV_TARGET} -> ${STABLE_ROOT}`)
  runStep(STABLE_ROOT, 'slots.mjs', ['--only', 'aek', '--yes'])
  runStep(STABLE_ROOT, 'service.mjs', ['install', 'aek', '--yes'])
  console.log('[stable-migrate] rollback 完成：single-tree 原状恢复，agent 已装回。')
  process.exit(0)
}

// ── Human plan ───────────────────────────────────────────────────────────────

console.log(`[stable-migrate] mode     = ${YES ? 'EXECUTE' : 'PLAN（只读，什么都没改）'}`)
console.log(`[stable-migrate] stable 树 = ${STABLE_ROOT}（迁移后 = 钉 tag 的 worktree）`)
console.log(`[stable-migrate] dev 树   = ${DEV_TARGET}（迁移后 = main worktree）`)
console.log(`[stable-migrate] 钉 tag   = ${pin.ref} → ${String(pin.sha || '不可解析').slice(0, 12)}${pin.explicit ? '（显式 --tag）' : '（干净 HEAD 缺省）'}`)
console.log('')
for (const check of checks()) {
  console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.detail}`)
}
console.log('')
if (YES) {
  console.log('[stable-migrate] 将执行（顺序不可换）：')
  console.log('  1  停两槽：service.mjs uninstall all → slots.mjs --stop-all（dev-cycle 顺序，先卸 KeepAlive）')
  console.log(`  2  mv ${basename(STABLE_ROOT)} → ${DEV_TARGET}（同卷 rename，秒级）`)
  console.log(`  3  git worktree add --detach ${STABLE_ROOT} ${pin.ref}`)
  console.log('  4  重锚 lefthook（清两树过期的 worktree core.hooksPath）')
  console.log(`  5  stable 树 pnpm install --frozen-lockfile` + (checks().some(c => c.detail.startsWith('根 package.json 有')) ? ' + 冷树引导（generate-typert + AEK 包 build + lib/types 补发）+ pnpm run build:artifacts' : ''))
  console.log(`  6  冒烟：候选 web ${SMOKE_PORT} 探针 ${SKIP_SMOKE ? '（已 --skip-smoke，注意门禁被削弱）' : ''}`)
  console.log('  7  起 current（stable 树 slots.mjs --only aek + service.mjs install aek）并等 1685')
} else {
  console.log('[stable-migrate] 真正执行：node scripts/aek/stable-migrate.mjs --yes')
  console.log('[stable-migrate] 回滚：node scripts/aek/stable-migrate.mjs --rollback --yes')
}
console.log('')
console.log('[stable-migrate] 迁移后人工 repoint（本工具不代改）：')
for (const line of manualRepoints()) console.log(`  ${line}`)

if (!YES) process.exit(0)

// ── Execute ──────────────────────────────────────────────────────────────────

assertPinUsable(pin, treeStatus())

console.log('\n[stable-migrate] —— 开始执行 ——')
if (!runStep(STABLE_ROOT, 'service.mjs', ['uninstall', 'all', '--yes'])) fail('卸载 LaunchAgent 失败；原 plist 已备份在 <container>/backups/，手动恢复后重试')
if (!runStep(STABLE_ROOT, 'slots.mjs', ['--stop-all', '--yes'])) fail('stop-all 失败；两槽未完全停止，中止（不动任何文件）')

if (existsSync(DEV_TARGET) && readdirSync(DEV_TARGET).length > 0) fail(`dev 目标 ${DEV_TARGET} 非空，拒绝执行（不会写进已存在的目录）`)
renameSync(STABLE_ROOT, DEV_TARGET)
console.log(`[stable-migrate] 树已移动：${STABLE_ROOT} → ${DEV_TARGET}`)

git(['worktree', 'add', '--detach', STABLE_ROOT, pin.ref], DEV_TARGET)
console.log(`[stable-migrate] stable worktree 已建于 ${STABLE_ROOT}（钉 ${pin.ref}）`)

// Lefthook re-anchor. install-lefthook.mjs records a worktree-scoped
// core.hooksPath as an ABSOLUTE <gitdir>/dsh-hooks path. The move leaves
// both trees holding the stale value (the new worktree's config inherits
// it), and the postinstall refuses to overwrite a worktree-scoped custom
// path — that is what fails a plain pnpm install on the stable tree. Clear
// both, re-anchor the dev tree directly, and let the stable tree's
// postinstall anchor its own worktree-local dir.
for (const root of [DEV_TARGET, STABLE_ROOT]) {
  try {
    execFileSync('git', ['config', '--worktree', '--unset', 'core.hooksPath'], {
      cwd: root, stdio: 'ignore',
    })
  } catch { /* key not set = nothing to clear */ }
}
const reanchor = spawnSync(NODE, [join(DEV_TARGET, 'scripts', 'install-lefthook.mjs')], {
  cwd: DEV_TARGET, stdio: 'inherit', timeout: 120_000,
})
if (reanchor.status !== 0) console.warn('[stable-migrate] 警告：dev 树 lefthook 重锚失败（下次 pnpm install 会再试）')

if (!pnpmRun(STABLE_ROOT, ['install', '--frozen-lockfile'])) fail('stable 树 pnpm install 失败；回滚：node scripts/aek/stable-migrate.mjs --rollback --yes')

// Fresh-tree bootstrap. build:artifacts assumes a warm tree; on a clean
// checkout two things are missing and deadlock the tsc gate:
//   (a) typert artifacts (lib/typert.*.js/.d.ts) — the api packages'
//       "./remote" exports resolve to them, but they are normally only
//       produced by the Host tsdown pass that runs later in the pipeline;
//   (b) AEK-owned packages with their own `build` script (plain tsc or
//       tsdown, e.g. prevent-agent-directly-seeing-key) — the root pipeline
//       does not build them.
// Both steps are idempotent on an already-built tree.
if (!pnpmRun(STABLE_ROOT, ['exec', 'tsx', 'scripts/generate-typert.ts'])) fail('stable 树 typert 产物生成失败；回滚：node scripts/aek/stable-migrate.mjs --rollback --yes')
if (!pnpmRun(STABLE_ROOT, ['-r', '--filter', './packages/aek/**', 'run', 'build'])) fail('stable 树 AEK 包构建失败（需 pnpm-workspace.yaml 的 ignoreWorkspaceCycles）；回滚：node scripts/aek/stable-migrate.mjs --rollback --yes')

// lib/types backfill. Some tsdown host entries are `lib/types/*.js` emitted by
// a PACKAGE-LEVEL host tsconfig that no root tsc program references (observed:
// packages/client/shortcuts — its client sub-config excludes src/index.ts and
// nothing references its host sub-config). A warm tree hides the gap; a cold
// tree deadlocks the tsdown host gate. Discovery: for every package whose
// tsdown config declares lib/types entry files, build the package-level host
// tsconfig for each entry that is still missing. Idempotent on warm trees.
{
  const cfgFiles = spawnSync('sh', [
    '-c', 'grep -rl --include=tsdown.config.ts "lib/types/" packages apps 2>/dev/null || true',
  ], { cwd: STABLE_ROOT, encoding: 'utf8' })
  const pkgDirs = [...new Set(
    (cfgFiles.stdout || '').trim().split('\n').filter(Boolean)
      .map((f) => f.slice(0, f.length - '/tsdown.config.ts'.length)),
  )]
  const missingByPkg = []
  for (const dir of pkgDirs) {
    const cfgText = readFileSync(join(STABLE_ROOT, dir, 'tsdown.config.ts'), 'utf8')
    const missing = [...new Set(cfgText.match(/lib\/types\/[\w./-]+\.js/g) ?? [])]
      .filter((entry) => !existsSync(join(STABLE_ROOT, dir, entry)))
    if (missing.length === 0) continue
    if (!existsSync(join(STABLE_ROOT, dir, 'tsconfig.host.json'))) {
      fail(`${dir} 的 tsdown 入口缺 ${missing.join(', ')} 且无包级 tsconfig.host.json 可补发；需人工修复`)
    }
    missingByPkg.push(dir)
  }
  if (missingByPkg.length > 0 &&
    !pnpmRun(STABLE_ROOT, ['exec', 'tsc', '-b', ...missingByPkg.map((d) => join(d, 'tsconfig.host.json'))])) {
    fail('lib/types 补发（包级 host tsc）失败；回滚：node scripts/aek/stable-migrate.mjs --rollback --yes')
  }
}

let buildScript = true
try { buildScript = Boolean(JSON.parse(readFileSync(join(STABLE_ROOT, 'package.json'), 'utf8')).scripts?.['build:artifacts']) } catch { /* no root pkg */ }
if (buildScript && !pnpmRun(STABLE_ROOT, ['run', 'build:artifacts'])) fail('stable 树构建失败；回滚：node scripts/aek/stable-migrate.mjs --rollback --yes')

if (SKIP_SMOKE) {
  console.log('[stable-migrate] 冒烟被 --skip-smoke 跳过（门禁已削弱，请知悉）')
} else if (listenPids(SMOKE_PORT).length > 0) {
  fail(`冒烟端口 ${SMOKE_PORT} 被占用，无法验证候选代码；先腾空端口再重跑（或 --skip-smoke 自担风险）`)
} else if (!(await smokeWeb(STABLE_ROOT))) {
  fail('冒烟失败：候选 web 在 90s 内没有回 200。current 现已停止——回滚：node scripts/aek/stable-migrate.mjs --rollback --yes')
}
console.log('[stable-migrate] 冒烟通过：候选代码可启动')

if (!runStep(STABLE_ROOT, 'slots.mjs', ['--only', 'aek', '--yes'])) fail('起 current 失败；回滚：node scripts/aek/stable-migrate.mjs --rollback --yes')
// Non-fatal by design (same posture as dev-cycle): the app is already up;
// losing the agent only means no login autostart until re-registered.
const installed = spawnSync(NODE, [join(STABLE_ROOT, 'scripts', 'aek', 'service.mjs'), 'install', 'aek', '--yes'], {
  cwd: STABLE_ROOT, stdio: 'inherit', timeout: 120_000,
})
if (installed.status !== 0) {
  console.warn('[stable-migrate] 警告：current 的 LaunchAgent 注册失败（current 已在跑，可稍后手动 install）')
}
const up = await waitForPort(SLOTS.aek.webPort, 180_000)
console.log(up ? `[stable-migrate] current web ${SLOTS.aek.webPort} 已起` : `[stable-migrate] 警告：180s 内 ${SLOTS.aek.webPort} 未起来，serve-slot 会按 3s 间隔继续重试`)
console.log(`[stable-migrate] 迁移完成。stable = ${STABLE_ROOT} @ ${String(pin.sha).slice(0, 12)}；dev = ${DEV_TARGET}`)
console.log('[stable-migrate] 人工 repoint 清单：')
for (const line of manualRepoints()) console.log(`  ${line}`)
console.log('[stable-migrate] 验收：node scripts/aek/dev-cycle.mjs verify')
process.exit(0)
