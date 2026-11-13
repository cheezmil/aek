#!/usr/bin/env node
/**
 * dev-cycle — the DEVELOPMENT LOOP, encoded as an executable rule.
 *
 * The rule (AGENTS.md §6, confirmed 2026-11-11):
 *
 *   develop & verify in `next` → shut `next` down → promote the new
 *   configuration into `current` → leave ONLY the `current` instance running.
 *
 * WHY A SCRIPT AND NOT JUST A DOCUMENTED CONVENTION
 *   `promote.mjs` refuses to run while either slot holds a port. But the web
 *   backends are LaunchAgents with KeepAlive=true: `slots.mjs --stop-all`
 *   stops them and launchd immediately brings them back, so the four manual
 *   steps deadlock. The missing step is uninstalling the LaunchAgents FIRST,
 *   then re-installing ONLY `current` afterwards. This script owns that order.
 *
 * SAFETY
 *   - No arguments = read-only `plan`. `verify` is read-only. `guide` prints.
 *   - ONLY `run --yes` changes anything.
 *   - Before touching user-level LaunchAgent plists it copies them into
 *     `<container>/backups/<ts>-pre-dev-cycle/` (restore instructions are
 *     printed if a later step fails).
 *   - A failed LaunchAgent re-registration is a WARNING, not a fatal error:
 *     `current` is already running from slots.mjs and stays usable.
 *
 * Usage:
 *   node scripts/aek/dev-cycle.mjs                  # plan (read-only)
 *   node scripts/aek/dev-cycle.mjs plan --json
 *   node scripts/aek/dev-cycle.mjs run --yes        # the four-step close-out
 *   node scripts/aek/dev-cycle.mjs verify           # read-only rule check
 *   node scripts/aek/dev-cycle.mjs verify --dev     # allow intentional dual-run
 *   node scripts/aek/dev-cycle.mjs guide
 *
 * @module scripts/aek/dev-cycle
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aekBackupsPath } from '../../packages/aek/base/coraek/home.mjs'
import { SLOTS, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { listenPids } from './slot-ops.mjs'
import { verifyBuildRules } from './verify-build-rules.mjs'
import { dualTreeLayout } from './shared-logic.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = (() => {
  let dir = HERE
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
})()
const SCRIPT = name => join(HERE, name)
const NODE = process.execPath

/** LaunchAgent label / plist for a slot (mirrors service.mjs). */
function agentLabel(slot) {
  return `com.cheezmil.aek.web.${slot}`
}
function plistFor(slot) {
  return join(homedir(), 'Library', 'LaunchAgents', `${agentLabel(slot)}.plist`)
}

/**
 * Is the LaunchAgent loaded? Non-macOS returns false (no launchd).
 * @param {string} slot - slot name.
 * @returns {boolean} loaded state.
 */
function agentLoaded(slot) {
  if (process.platform !== 'darwin') return false
  try {
    execFileSync('launchctl', ['print', `gui/${String(process.getuid())}/${agentLabel(slot)}`], {
      stdio: 'ignore', timeout: 5_000,
    })
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} slot - slot name.
 * @returns {{ web: boolean, cdp: boolean, agent: boolean, plist: boolean }} state.
 */
function slotState(slot) {
  return {
    web: listenPids(SLOTS[slot].webPort).length > 0,
    cdp: listenPids(SLOTS[slot].cdpPort).length > 0,
    agent: agentLoaded(slot),
    plist: existsSync(plistFor(slot)),
  }
}

/**
 * @returns {Record<string, ReturnType<typeof slotState>>} both slot states.
 */
function currentState() {
  return Object.fromEntries(Object.keys(SLOTS).map(slot => [slot, slotState(slot)]))
}

/**
 * Read the promotion plan without applying it.
 * @returns {{ selected: string[], conflicts: number, wouldWrite: number } | null} plan.
 */
function promotePlan() {
  const result = spawnSync(NODE, [SCRIPT('promote.mjs'), '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120_000,
  })
  if (result.status !== 0 || !result.stdout) return null
  try {
    const parsed = JSON.parse(result.stdout)
    return {
      selected: parsed.selected ?? [],
      conflicts: parsed.conflicts ?? 0,
      wouldWrite: parsed.wouldWrite ?? 0,
    }
  } catch {
    return null
  }
}

/** @returns {number} exit code. */
function guide() {
  console.log(`AEK 双槽开发循环（硬规则）

  开发 / 验收  一律先在 next 槽进行：
    node scripts/aek/launch.mjs --slot next dev-web
    node scripts/aek/dev-cycle.mjs plan          # 只读，看收尾会做什么
  收尾（验收通过后）：
    node scripts/aek/dev-cycle.mjs run --yes
  收尾的四步，顺序不可换：
    - 备份并卸载两个槽的 LaunchAgent（KeepAlive 会把刚停掉的后端拉回来）
    - slots.mjs --stop-all --yes            停掉全部实例，promote 才能写
    - promote.mjs --yes                      next 的新配置同步进 current
    - slots.mjs --only aek --yes            只起 current，再装回 current 的 LaunchAgent
  最终状态：只留 current 一个实例。禁止长期双实例。
    node scripts/aek/dev-cycle.mjs verify      # 只读检查是否合规

  为什么不是「先关 next 再同步」：promote 要求两个槽的端口都空闲，
  而 current 的后端也是 LaunchAgent，stop-all 之后会被 launchd 拉回。
  所以 must uninstall agents BEFORE stopping, then re-install only current.

  回滚：promote 会把每次写入前的旧文件存到 <container>/backups/<ts>-pre-promote/，
  用 node scripts/aek/promote.mjs --rollback <dir> --yes 撤销。`)
  return 0
}

/**
 * @param {boolean} json - machine-readable.
 * @returns {number} exit code.
 */
function plan(json) {
  const state = currentState()
  const promotion = promotePlan()
  const gates = verifyBuildRules().gates
  if (json) {
    console.log(JSON.stringify({ state, promotion, gates }, null, 2))
    return 0
  }
  console.log('dev-cycle plan (READ ONLY — nothing was changed)\n')
  for (const slot of Object.keys(SLOTS)) {
    const s = state[slot]
    console.log(`  [${slot}] ${slotHome(slot)}`)
    console.log(`        web ${s.web ? 'UP' : 'down'}  cdp ${s.cdp ? 'UP' : 'down'}  LaunchAgent ${s.agent ? 'loaded' : 'not loaded'}  plist ${s.plist ? 'present' : 'absent'}`)
  }
  console.log('\n  收尾会依次执行：')
  const steps = [
    '1  备份 LaunchAgent plist → <container>/backups/<ts>-pre-dev-cycle/',
    '2  service.mjs uninstall all --yes     (先卸 agent，否则 KeepAlive 拉回)',
    '3  slots.mjs --stop-all --yes          (两槽端口空闲，promote 才允许写)',
    '4  promote.mjs --yes                   (next → current，带备份/可回滚)',
    '5  slots.mjs --only aek --yes          (只起 current)',
    '6  service.mjs install aek --yes       (只把 current 装回自启动)',
    '7  dev-cycle verify                    (确认最终只有一个实例)',
  ]
  for (const step of steps) console.log(`      ${step}`)
  if (promotion !== null) {
    console.log(`\n  promote 计划：${promotion.selected.join(', ')}`)
    console.log(`      待写 ${promotion.wouldWrite} 项，冲突 ${promotion.conflicts} 项（冲突默认不覆盖）`)
  }
  console.log(`\n  构建规则：${gates.map(g => `${g.name}=${g.ok ? 'PASS' : 'FAIL'}`).join('  ')}`)
  const dual = state.aek.web && state.next.web
  console.log(`\n  当前状态：${dual ? '两槽同时在跑（开发期正常，收尾后不允许）' : '未双开'}`)
  console.log('\n  真正执行：node scripts/aek/dev-cycle.mjs run --yes')
  return 0
}

/**
 * Read-only rule check. `--dev` tolerates an intentional dual run.
 * @param {boolean} devMode - allow both slots running.
 * @param {boolean} json - machine-readable.
 * @returns {number} exit code.
 */
function verify(devMode, json) {
  const state = currentState()
  /** @type {{ rule: string, ok: boolean, detail: string }[]} */
  const checks = []
  const dual = state.aek.web && state.next.web
  checks.push({
    rule: 'only-current-running',
    ok: devMode ? true : !dual,
    detail: dual
      ? (devMode ? '双开是开发期显式允许（--dev）' : 'aek 与 next 的 web 后端同时在运行；收尾后只允许 current')
      : '没有双实例',
  })
  checks.push({
    rule: 'next-agent-removed',
    ok: devMode ? true : (!state.next.agent && !state.next.plist),
    detail: devMode
      ? '开发期 next 需要自启动（--dev 豁免）'
      : (state.next.agent || state.next.plist
        ? 'next 的 LaunchAgent 仍注册 / plist 仍在，KeepAlive 会把它拉回来'
        : 'next 的自启动已卸载'),
  })
  checks.push({
    rule: 'current-running',
    ok: state.aek.web,
    detail: state.aek.web ? 'current 正在运行' : 'current 的 web 后端没在跑',
  })
  for (const gate of verifyBuildRules().gates) {
    checks.push({ rule: `build-rule:${gate.name}`, ok: gate.ok, detail: gate.problems.join(' / ') || 'passed' })
  }
  {
    const surface = spawnSync(NODE, [join(HERE, 'verify-command-namespace.mjs')], {
      cwd: ROOT, encoding: 'utf8', timeout: 120_000,
    })
    const detail = (surface.stdout ?? '').trim().split('\n')[0] ?? ''
    checks.push({
      rule: 'command-surface',
      ok: surface.status === 0,
      detail: surface.status === 0 ? detail : `${detail}\n${(surface.stdout ?? '').trim().split('\n').slice(1).join('\n')}`,
    })
  }
  {
    // A round: the localStorage red line is machine-enforced in the loop —
    // no AEK setting may live in the browser's Web Storage (or in any
    // Electron-ecosystem store); settings persist on the host.
    const storage = spawnSync(NODE, [join(HERE, 'verify-aek-storage.mjs'), '--quiet'], {
      cwd: ROOT, encoding: 'utf8', timeout: 60_000,
    })
    checks.push({
      rule: 'aek-storage-redline',
      ok: storage.status === 0,
      detail: storage.status === 0
        ? 'AEK 自有代码零 Web Storage 使用（设置走 host preferences，不碰 Electron 生态）'
        : ((storage.stderr ?? '') + (storage.stdout ?? '')).trim().split('\n').join(' '),
    })
  }
  {
    // X round: unfinished i18n must not pass the loop either (the same gate
    // the aek-home prebundle / console-round runs).
    const i18n = spawnSync(NODE, [join(HERE, 'verify-i18n.mjs'), '--quiet'], {
      cwd: ROOT, encoding: 'utf8', timeout: 60_000,
    })
    checks.push({
      rule: 'i18n-complete',
      ok: i18n.status === 0,
      detail: i18n.status === 0
        ? '所有 i18n key 在 zh/en 双字典齐全'
        : ((i18n.stderr ?? '') + (i18n.stdout ?? '')).trim().split('\n').join(' '),
    })
  }

  // ── Dual-tree rules (S round): current must be crash-proof against dev edits.
  // The stable tree is the detached linked worktree; when it is not resolvable
  // (pre-migration single-tree layout) the rules skip with a note.
  {
    const layout = dualTreeLayout(ROOT)
    const stableDir = process.env.AEK_STABLE_TREE ?? layout.stable
    if (stableDir && existsSync(join(stableDir, 'pnpm-workspace.yaml'))) {
      const tracked = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
        cwd: stableDir, encoding: 'utf8',
      }).trim()
      checks.push({
        rule: 'stable-tracked-clean',
        ok: tracked === '',
        detail: tracked === ''
          ? 'stable 树 tracked 干净（未跟踪的构建产物不算）'
          : `stable 树 tracked 漂移 ${String(tracked.split('\n').length)} 条——冻结树被手改了`,
      })
      let pin = ''
      try {
        pin = execFileSync('git', ['describe', '--tags', '--exact-match', 'HEAD'], {
          cwd: stableDir, encoding: 'utf8',
        }).trim()
      } catch { /* HEAD is not exactly on a tag */ }
      checks.push({
        rule: 'stable-pinned-to-tag',
        ok: Boolean(pin),
        detail: pin ? `stable HEAD = tag ${pin}` : 'stable HEAD 不在 tag 上（S 轮要求钉已验收 tag）',
      })
      // current must execute from the stable tree: the slot's LaunchAgent
      // plist (static) and/or the live web pid's cwd (dynamic).
      const evidences = []
      if (process.platform === 'darwin' && existsSync(plistFor('aek'))) {
        const out = execFileSync('plutil', ['-p', plistFor('aek')], { encoding: 'utf8' })
        const mjsArgs = out.match(/"([^"]+\.mjs)"/g) ?? []
        // Boundary-aware: the stable dir is a path PREFIX of the dev dir
        // (`…/aek` vs `…/aek-next`), so a bare startsWith accepts dev-tree
        // paths as "stable" — the exact miss this check must not make.
        const isStable = (p) => p === stableDir || p.startsWith(stableDir + '/')
        evidences.push({
          label: 'aek LaunchAgent plist',
          ok: mjsArgs.length > 0 && mjsArgs.every((a) => isStable(a.replace(/^"/, ''))),
        })
      }
      const pidFile = join(slotHome('aek'), '.aek-runtime.pid')
      if (existsSync(pidFile)) {
        const pid = Number(readFileSync(pidFile, 'utf8').trim())
        let alive = false
        try { process.kill(pid, 0); alive = true } catch { /* stale */ }
        if (alive) {
          let cwd = null
          if (process.platform === 'darwin') {
            try {
              const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' })
              cwd = out.split('\n').map((l) => l.slice(1)).find((l) => l.length > 0) ?? null
            } catch { /* lsof unavailable */ }
          }
          if (cwd) evidences.push({ label: `current web pid ${String(pid)} cwd`, ok: cwd === stableDir || cwd.startsWith(stableDir + '/') })
        }
      }
      checks.push({
        rule: 'current-exe-in-stable',
        ok: evidences.length > 0 && evidences.every((e) => e.ok),
        detail: evidences.length === 0
          ? '无证据（aek plist 与 pid 文件都不在）——current 可能由人工方式启动'
          : evidences.map((e) => `${e.label}: ${e.ok ? '指向 stable 树' : '指向开发树！current 会在 dev 编辑下变脆'}`).join('；'),
      })
      // dev mode: if the next slot's agent is registered it must point at
      // THIS tree (the dev tree), never at the stable one.
      if (devMode && state.next.plist && process.platform === 'darwin') {
        const out = execFileSync('plutil', ['-p', plistFor('next')], { encoding: 'utf8' })
        const mjsArgs = out.match(/"([^"]+\.mjs)"/g) ?? []
        const ok = mjsArgs.length > 0 && mjsArgs.every((a) => a.replace(/^"/, '').startsWith(ROOT))
        checks.push({
          rule: 'next-plist-points-dev',
          ok,
          detail: ok ? 'next LaunchAgent 指向开发树' : 'next LaunchAgent 指向的不是开发树（开发改动会经自启动落进 current 侧）',
        })
      }
    } else {
      checks.push({
        rule: 'dual-tree-layout',
        ok: true,
        detail: '单树布局（S1 迁移未执行或 >1 个 detached worktree，双树规则不生效；AEK_STABLE_TREE 可显式指定）',
      })
    }
  }
  const ok = checks.every(check => check.ok)
  if (json) {
    console.log(JSON.stringify({ ok, devMode, state, checks }, null, 2))
    return ok ? 0 : 1
  }
  for (const check of checks) console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.rule.padEnd(28)} ${check.detail}`)
  console.log(ok ? '\ndev-cycle verify: OK' : '\ndev-cycle verify: 规则未满足（见上）')
  return ok ? 0 : 1
}

/**
 * Run one child script, aborting the cycle on failure.
 * @param {string} script - file name under scripts/aek.
 * @param {string[]} args - arguments.
 * @returns {boolean} success.
 */
function runStep(script, args) {
  console.log(`\n[dev-cycle] → node scripts/aek/${script} ${args.join(' ')}`)
  const result = spawnSync(NODE, [SCRIPT(script), ...args], {
    cwd: ROOT, stdio: 'inherit', timeout: 600_000,
  })
  if (result.status !== 0) {
    console.error(`[dev-cycle] 步骤失败：${script} (exit ${String(result.status)})`)
    return false
  }
  return true
}

/**
 * Back up both LaunchAgent plists before uninstalling them.
 * @returns {string} backup directory.
 */
function backupAgents() {
  const dir = aekBackupsPath(`${new Date().toISOString().replace(/[:.]/gu, '-')}-pre-dev-cycle`)
  mkdirSync(dir, { recursive: true })
  for (const slot of Object.keys(SLOTS)) {
    const plist = plistFor(slot)
    if (existsSync(plist)) copyFileSync(plist, join(dir, basename(plist)))
  }
  console.log(`[dev-cycle] LaunchAgent 备份 → ${dir}`)
  return dir
}

/**
 * The four-step close-out. Requires --yes.
 * @returns {number} exit code.
 */
function runCycle() {
  console.log('[dev-cycle] 收尾开始：next 验收结果 → current，最终只留 current')
  const gates = verifyBuildRules()
  if (!gates.ok) {
    console.error('[dev-cycle] 构建规则未通过，拒绝收尾：')
    for (const gate of gates.gates.filter(g => !g.ok)) console.error(`  - ${gate.name}: ${gate.problems.join(' / ')}`)
    return 1
  }

  const backup = backupAgents()
  // Order matters: launchd must stop owning the backends BEFORE stop-all,
  // otherwise KeepAlive restarts them and promote's port check never clears.
  if (!runStep('service.mjs', ['uninstall', 'all', '--yes'])) {
    console.error(`[dev-cycle] 已中止。LaunchAgent 原文件在 ${backup}；需要时手动恢复。`)
    return 1
  }
  if (!runStep('slots.mjs', ['--stop-all', '--yes'])) return 1
  if (!runStep('promote.mjs', ['--yes'])) {
    console.error(`[dev-cycle] 同步失败。promote 的备份在 <container>/backups/；`)
    console.error('            node scripts/aek/promote.mjs --rollback <dir> --yes 可撤销。')
    return 1
  }
  if (!runStep('slots.mjs', ['--only', 'aek', '--yes'])) return 1

  // Non-fatal by design: the app is already running, losing only login autostart.
  // The current slot's LaunchAgent must point at the STABLE tree's serve-slot:
  // service.mjs renders ITS OWN tree's .mjs path into the plist, so installing
  // from the dev tree would make current boot dev code (the exact regression
  // this file's catch-up verify must prevent). Install from the stable tree's
  // script when resolvable; fall back to the dev tree with a loud note.
  const layout = dualTreeLayout(ROOT)
  const stableDir = process.env.AEK_STABLE_TREE ?? layout.stable
  const stableService = stableDir && existsSync(join(stableDir, 'scripts', 'aek', 'service.mjs'))
    ? join(stableDir, 'scripts', 'aek', 'service.mjs')
    : null
  if (stableService === null) {
    console.warn('[dev-cycle] 注意：stable 树不可解析——current 的 agent 从 dev 树安装（current 将运行 dev 代码，直到下次发布）。')
  }
  const installScript = stableService ?? SCRIPT('service.mjs')
  const install = spawnSync(NODE, [installScript, 'install', 'aek', '--yes'], {
    cwd: stableService ?? ROOT, stdio: 'inherit', timeout: 120_000,
  })
  if (install.status !== 0) {
    console.warn(`[dev-cycle] 警告：current 的 LaunchAgent 注册失败（current 仍在运行，可稍后手动 install）。`)
    console.warn(`            原 plist 备份：${backup}`)
  }
  console.log('\n[dev-cycle] 收尾完成，开始只读验收：')
  return verify(false, false)
}

/** CLI dispatch. */
function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const devMode = args.includes('--dev')
  const confirmed = args.includes('--yes')
  const command = args.find(arg => !arg.startsWith('--')) ?? 'plan'

  if (command === 'guide' || command === 'help' || args.includes('--help') || args.includes('-h')) {
    process.exit(guide())
  }
  if (command === 'verify') process.exit(verify(devMode, json))
  if (command === 'plan') process.exit(plan(json))
  if (command === 'run') {
    if (!confirmed) {
      console.log('DRY RUN — 未加 --yes，什么都不会改。先跑 plan 看清楚，确认后：')
      console.log('  node scripts/aek/dev-cycle.mjs run --yes')
      process.exit(0)
    }
    process.exit(runCycle())
  }
  console.error(`unknown subcommand: ${command}`)
  guide()
  process.exit(2)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
