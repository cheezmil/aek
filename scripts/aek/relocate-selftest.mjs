#!/usr/bin/env node
/**
 * Isolated self-test for `relocate.mjs`.
 *
 * Every case runs against a throwaway container (`AEK_ROOT=<mkdtemp>`) and a
 * throwaway `$HOME` (`--home`), so the developer's real `~/.aek` is never read
 * or written. `--no-running-check` is test-only: the developer's own two apps
 * hold 1685/1687 and the port guard cannot tell them apart from a fake slot.
 *
 * What it proves:
 *   1. the plan is read-only and says how many links are at risk
 *   2. a target that already exists is refused before anything moves
 *   3. the directory really moves and the manifest really points at it
 *   4. every comment and every other line of the manifest survives the edit
 *   5. consumer links are re-pointed and resolve to the NEW location
 *   6. a snapshot is written that `--rollback` can consume
 *   7. rollback restores the directory, the manifest bytes and the links
 *   8. the moving slot can be `next` as well as `aek`
 *   9. a manifest with no `slots:` block gets one instead of failing
 *  10. JSON output is parseable and never includes the whole manifest text
 *
 * Usage:
 *   node scripts/aek/relocate-selftest.mjs
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RELOCATE = fileURLToPath(new URL('./relocate.mjs', import.meta.url))
const LINK_REPORT = fileURLToPath(new URL('./link-report.mjs', import.meta.url))
const REPAIR = fileURLToPath(new URL('./repair-skill-links.mjs', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'aek-relocate-'))

/** @type {{ ok: boolean, label: string }[]} */
const results = []
/** @param {string} label @param {boolean} ok */
function check(label, ok) {
  results.push({ ok, label })
}

/** @param {string} dir */
function mkdirp(dir) {
  mkdirSync(dir, { recursive: true })
}

/** @param {string} file @param {string} [body] */
function file(file, body = 'x\n') {
  mkdirp(dirname(file))
  writeFileSync(file, body, 'utf8')
}

/** @param {string} p @returns {string | null} */
function realpathSafe(p) {
  try {
    return realpathSync(p)
  } catch {
    return null
  }
}

/** @param {string} p @returns {boolean} */
function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

const MANIFEST = `# AEK 路径清单 —— 手改这一行就能搬家
version: 1

# 相对路径的基准目录
root: .

slots:
  aek: current    # 主槽
  next: next

backups: backups

dirs:
  skill-manager: skill-manager
  logs: logs
`

/**
 * A container with one slot, one skill in its hub, and one consumer link.
 * @param {string} base - directory to build in.
 * @param {{ manifest?: string | null, slotDir?: string, slotKey?: 'aek' | 'next' }} [options]
 */
function fixture(base, options = {}) {
  const container = join(base, 'aek')
  const home = join(base, 'home')
  const slotDir = options.slotDir ?? 'current'
  const slotKey = options.slotKey ?? 'aek'
  const slot = join(container, slotDir)
  const hub = join(slot, 'skill-manager', 'skills')

  file(join(hub, 'demo', 'SKILL.md'), '# demo\n')
  mkdirp(join(slot, 'logs'))
  // A file that belongs to the slot — it must travel WITH the directory.
  file(join(slot, 'plugins.json'), '{}\n')
  mkdirp(join(container, 'backups'))

  const manifest = options.manifest === undefined ? MANIFEST : options.manifest
  if (manifest !== null) writeFileSync(join(container, 'aek.yaml'), manifest, 'utf8')

  // The other slot exists too: `paths.mjs check` warns (not fails) when it is
  // missing, but a realistic container has both.
  mkdirp(join(container, 'next', 'skill-manager', 'skills'))

  const linkPath = join(home, '.claude', 'skills', 'demo')
  mkdirp(dirname(linkPath))
  symlinkSync(relative(dirname(linkPath), join(hub, 'demo')), linkPath)

  return { container, home, slot, hub, linkPath, slotKey, slotDir }
}

/**
 * Run any of the sibling scripts against a fixture.
 * @param {string} script @param {string[]} args @param {{ container: string, home: string }} env
 * @returns {{ code: number, out: string }}
 */
function runScript(script, args, env) {
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, AEK_ROOT: env.container, HOME: env.home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (error) {
    const raw = /** @type {any} */ (error)
    return { code: raw.status ?? 1, out: `${raw.stdout ?? ''}${raw.stderr ?? ''}` }
  }
}

/**
 * @param {string[]} args @param {{ container: string, home: string }} env
 * @returns {{ code: number, out: string }}
 */
function run(args, env) {
  return runScript(RELOCATE, args, env)
}

try {
  // ── 1. plan is read-only ───────────────────────────────────────────────────
  const a = fixture(join(root, 'case-a'))
  const envA = { container: a.container, home: a.home }
  const plan = run(['--slot', 'aek', '--to', 'v2/current'], envA)
  check('plan: exit 0', plan.code === 0)
  check('plan: 报告了旧位置与新位置', plan.out.includes('current') && plan.out.includes('v2/current'))
  check('plan: 说明有多少链接会重指', /1 条槽外链接/.test(plan.out))
  check('plan: 一个文件都没动', existsSync(join(a.slot, 'plugins.json')) && !existsSync(join(a.container, 'v2')))

  const planJson = run(['--slot', 'aek', '--to', 'v2/current', '--json'], envA)
  let parsed = null
  try {
    parsed = JSON.parse(planJson.out)
  } catch { /* asserted below */ }
  check('plan --json: 可解析', parsed !== null && parsed.mode === 'plan')
  check('plan --json: mode/fromAbs/toAbs 齐全', Boolean(parsed?.fromAbs && parsed?.toAbs))
  check('plan --json: 不含整份清单正文', parsed !== null && parsed.manifestText === undefined)
  check('plan --json: linksAtRisk = 1', parsed?.linksAtRisk === 1)

  // ── 2. refusing a taken target ─────────────────────────────────────────────
  const b = fixture(join(root, 'case-b'))
  mkdirp(join(b.container, 'v2', 'current'))
  const taken = run(['--slot', 'aek', '--to', 'v2/current', '--yes', '--no-running-check'], b)
  check('冲突: 拒绝执行', taken.code === 1)
  check('冲突: 说出了原因', /目标已存在/.test(taken.out))
  check('冲突: 原槽仍在原处', existsSync(join(b.slot, 'plugins.json')))

  // ── 3-6. the real move ─────────────────────────────────────────────────────
  const moved = run(['--slot', 'aek', '--to', 'v2/current', '--yes', '--no-running-check'], envA)
  check('move: exit 0', moved.code === 0)
  check('move: 目录真的搬了', existsSync(join(a.container, 'v2', 'current', 'plugins.json')))
  check('move: 旧位置已不存在', !existsSync(a.slot))

  const manifestAfter = readFileSync(join(a.container, 'aek.yaml'), 'utf8')
  check('manifest: slots.aek 指向 v2/current', /^ {2}aek: v2\/current/m.test(manifestAfter))
  check('manifest: 行尾注释保留', /# 主槽/.test(manifestAfter))
  check('manifest: 文件头注释保留', /手改这一行就能搬家/.test(manifestAfter))
  check('manifest: root / backups / dirs 原样', /^root: \.$/m.test(manifestAfter) && /^backups: backups$/m.test(manifestAfter) && /^ {2}logs: logs$/m.test(manifestAfter))
  check('manifest: next 那一行未被改动', /^ {2}next: next$/m.test(manifestAfter))

  const newHub = join(a.container, 'v2', 'current', 'skill-manager', 'skills', 'demo')
  check('links: 链接还能解析', realpathSafe(a.linkPath) !== null)
  check('links: 指向新位置', realpathSafe(a.linkPath) === realpathSafe(newHub))
  check('links: raw 仍是相对路径', !readlinkSync(a.linkPath).startsWith('/'))
  check('links: raw 里写的是新布局', readlinkSync(a.linkPath).includes('v2/current'))

  const backupsDir = join(a.container, 'backups')
  const snapshots = readdirSync(backupsDir).filter(n => /^\d{8}-/.test(n))
  check('备份: 写出了快照', snapshots.length === 1)
  const record = JSON.parse(readFileSync(join(backupsDir, snapshots[0], 'manifest.json'), 'utf8'))
  check('备份: kind = relocate', record.kind === 'relocate')
  check('备份: 记了 from/to', record.fromAbs === a.slot && record.toAbs === join(a.container, 'v2', 'current'))
  check('备份: 清单原文也在', existsSync(join(backupsDir, snapshots[0], 'aek.yaml')))

  // ── 7. rollback ────────────────────────────────────────────────────────────
  const snap = join(backupsDir, snapshots[0])
  const rolled = run(['--rollback', snap, '--yes', '--no-running-check'], envA)
  check('rollback: exit 0', rolled.code === 0)
  check('rollback: 目录回到原处', existsSync(join(a.slot, 'plugins.json')))
  check('rollback: 新位置已空', !existsSync(join(a.container, 'v2', 'current')))
  check('rollback: 清单字节还原', readFileSync(join(a.container, 'aek.yaml'), 'utf8') === MANIFEST)
  check('rollback: 链接又指回原 hub', realpathSafe(a.linkPath) === realpathSafe(join(a.hub, 'demo')))
  check('rollback: 记录仍保留', existsSync(join(snap, 'manifest.json')))

  // ── 8. the other slot ──────────────────────────────────────────────────────
  const c = fixture(join(root, 'case-c'), { slotDir: 'next', slotKey: 'next' })
  const movedNext = run(['--slot', 'next', '--to', 'v2/next', '--yes', '--no-running-check'], c)
  check('next: exit 0', movedNext.code === 0)
  check('next: 目录搬了', existsSync(join(c.container, 'v2', 'next', 'plugins.json')))
  const manifestC = readFileSync(join(c.container, 'aek.yaml'), 'utf8')
  check('next: slots.next 更新', /^ {2}next: v2\/next$/m.test(manifestC))
  check('next: slots.aek 未动', /^ {2}aek: current    # 主槽$/m.test(manifestC))
  check('next: 链接指向 v2/next', (realpathSafe(c.linkPath) ?? '').includes(join('v2', 'next')))

  // ── 9. a manifest without a slots block ────────────────────────────────────
  const d = fixture(join(root, 'case-d'), { manifest: 'version: 1\nroot: .\n' })
  const movedD = run(['--slot', 'aek', '--to', 'v2/current', '--yes', '--no-running-check'], d)
  check('无 slots 段: exit 0', movedD.code === 0)
  const manifestD = readFileSync(join(d.container, 'aek.yaml'), 'utf8')
  check('无 slots 段: 追加了 slots.aek', /^slots:\n {2}aek: v2\/current$/m.test(manifestD))
  check('无 slots 段: 原有内容仍在', manifestD.startsWith('version: 1\nroot: .\n'))
  check('无 slots 段: 链接跟上了', (realpathSafe(d.linkPath) ?? '').includes(join('v2', 'current')))

  // ── 10. nested target is refused ───────────────────────────────────────────
  const e = fixture(join(root, 'case-e'))
  const nested = run(['--slot', 'aek', '--to', 'current/inner'], e)
  check('嵌套目标: 拒绝', nested.code === 1)
  check('嵌套目标: 说明原因', /互相嵌套/.test(nested.out))

  // ── 11. rollback refuses a taken old position ──────────────────────────────
  const f = fixture(join(root, 'case-f'))
  const envF = { container: f.container, home: f.home }
  run(['--slot', 'aek', '--to', 'v2/current', '--yes', '--no-running-check'], envF)
  const snapF = join(f.container, 'backups', readdirSync(join(f.container, 'backups')).filter(n => /^\d{8}-/.test(n))[0])
  mkdirp(f.slot)
  file(join(f.slot, 'squatter.txt'))
  const blocked = run(['--rollback', snapF, '--yes', '--no-running-check'], envF)
  check('rollback 冲突: 拒绝', blocked.code === 1)
  check('rollback 冲突: 说明原位置被占', /原位置已被占用/.test(blocked.out))
  check('rollback 冲突: 没把东西搬回来', !existsSync(join(f.container, 'current', 'plugins.json')))
  check('rollback 冲突: 链接未被改动', isLink(f.linkPath))

  // ── 12. the hand-edited manifest is DETECTED (routine ②) ───────────────────
  // Someone edits `aek.yaml` and moves the folder by hand, skipping the repair.
  // Nothing breaks loudly — the links just point at a path that no longer
  // exists. This is what makes that state visible instead of silent.
  const g = fixture(join(root, 'case-g'))
  const envG = { container: g.container, home: g.home }
  const handWritten = MANIFEST.replace('  aek: current    # 主槽', '  aek: v2/current    # 手改的')
  mkdirp(join(g.container, 'v2'))
  renameSync(g.slot, join(g.container, 'v2', 'current'))
  writeFileSync(join(g.container, 'aek.yaml'), handWritten, 'utf8')

  check('手改: 链接现在悬空', realpathSafe(g.linkPath) === null)
  const detected = runScript(LINK_REPORT, ['--stale-only'], envG)
  check('手改: --stale-only 报出问题', detected.code === 1)
  check('手改: 指出了是槽外链接', /条槽外链接指向/.test(detected.out))
  check('手改: 给了修法', /repair-skill-links/.test(detected.out))
  check('手改: 说明可能刚改过清单', /relocate\.mjs|aek\.yaml/.test(detected.out))

  const repaired = runScript(REPAIR, ['--yes'], envG)
  check('手改: 修链接后 exit 0', repaired.code === 0)
  check('手改: 链接恢复', (realpathSafe(g.linkPath) ?? '').includes(join('v2', 'current')))
  const clean = runScript(LINK_REPORT, ['--stale-only'], envG)
  check('手改: 修完不再报', clean.code === 0 && /正常/.test(clean.out))
} catch (error) {
  check(`未捕获异常：${error instanceof Error ? error.message : String(error)}`, false)
} finally {
  rmSync(root, { recursive: true, force: true })
}

const failed = results.filter(r => !r.ok)
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label}`)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length > 0) process.exitCode = 1
