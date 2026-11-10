#!/usr/bin/env node
/**
 * Self-test for `repair-skill-links.mjs` and `backup-retention.mjs`.
 *
 * Runs entirely inside a throwaway container plus a throwaway HOME, so it never
 * touches the real `~/.aek` or the real `~/.claude/skills`. That isolation is
 * the point: both scripts delete things (links, old snapshots) and a test that
 * could reach real data is a loaded gun.
 *
 * Cases, in the order they broke historically:
 *   1. container migration  — link points at the pre-container `<container>/skill-manager`
 *   2. manifest relocation  — link points at `<container>/current/…` while the slot moved to `v2/current`
 *   3. retired skill        — tail exists in no hub: prunable, never re-pointed
 *   4. unrelated dangling   — not a hub target: left alone
 *   5. healthy link         — never rewritten
 *   6. backup retention     — keep newest N, never touch non-snapshot entries
 *
 * Usage:
 *   node scripts/aek/repair-selftest.mjs
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pruneBackups } from './backup-retention.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPAIR = join(HERE, 'repair-skill-links.mjs')

const root = mkdtempSync(join(tmpdir(), 'aek-repair-'))
const container = join(root, 'aek')
const home = join(root, 'home')
const claude = join(home, '.claude', 'skills')

/** @type {{ ok: boolean, label: string }[]} */
const results = []
/** @param {string} label @param {boolean} ok */
function check(label, ok) {
  results.push({ ok, label })
}

/** @param {string} p */
function linkTo(p) {
  mkdirSync(dirname(p), { recursive: true })
}

/** @param {string} target @param {string} at */
function link(target, at) {
  linkTo(at)
  symlinkSync(target, at)
}

/** @param {string[]} args @returns {{ code: number, out: string }} */
function runRepair(args) {
  try {
    // `--home` pins the scan to the throwaway HOME. Without it the script walks
    // the real `~` and the test would be measuring somebody's actual links.
    const out = execFileSync(process.execPath, [REPAIR, '--home', home, ...args], {
      encoding: 'utf8',
      env: { ...process.env, AEK_ROOT: container },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (error) {
    const raw = /** @type {any} */ (error)
    return { code: raw.status ?? 1, out: `${raw.stdout ?? ''}${raw.stderr ?? ''}` }
  }
}

/** @param {string} text @returns {any} */
function asJson(text) {
  const at = text.indexOf('{')
  return JSON.parse(at < 0 ? text : text.slice(at))
}

try {
  // Two layouts in one container: the pre-container flat hub path (which must
  // NOT exist any more — that is the breakage) and the nested manifest layout
  // that replaced it. `aek.yaml` decides which one is live, so the script must
  // not prefer either: the tail lookup has to find the skill in the live hub.
  const flatHub = join(container, 'skill-manager', 'skills')
  const nestedHome = join(container, 'v2', 'current')
  const nestedHub = join(nestedHome, 'skill-manager', 'skills')
  for (const name of ['legacy', 'moved', 'shared', 'alive']) {
    mkdirSync(join(nestedHub, name), { recursive: true })
    writeFileSync(join(nestedHub, name, 'SKILL.md'), `# ${name}\n`, 'utf8')
  }
  mkdirSync(join(nestedHome, 'logs'), { recursive: true })
  writeFileSync(
    join(container, 'aek.yaml'),
    `version: 1\nslots:\n  aek: v2/current\n  next: next\n`,
    'utf8',
  )

  // 1. Pre-container link: `~/.aek/skill-manager/skills/legacy` no longer exists
  //    as the live hub, but the skill does exist under `v2/current`.
  const case1 = join(claude, 'legacy')
  link(relative(dirname(case1), join(flatHub, 'legacy')), case1)

  // 2. Relocated link: points at the OLD slot path, skill lives in the new one.
  const case2 = join(claude, 'moved')
  link(relative(dirname(case2), join(container, 'current', 'skill-manager', 'skills', 'moved')), case2)

  // 3. Retired skill: names the hub but the entry is gone everywhere.
  const case3 = join(claude, 'retired')
  link(relative(dirname(case3), join(container, 'current', 'skill-manager', 'skills', 'retired')), case3)

  // 4. Unrelated dangling link: not a hub target at all.
  const case4 = join(claude, 'elsewhere')
  link('../../../nowhere/at/all', case4)

  // 5. Healthy link: resolves today and must not be touched.
  const case5 = join(claude, 'alive')
  link(relative(dirname(case5), join(nestedHub, 'alive')), case5)
  const healthyRaw = readlinkSync(case5)

  const case1RawBefore = readlinkSync(case1)
  const case2RawBefore = readlinkSync(case2)

  const preview = asJson(runRepair(['--json']).out)
  check('预览：案例 1 的 raw 未变', readlinkSync(case1) === case1RawBefore)
  check('预览：案例 2 的 raw 未变', readlinkSync(case2) === case2RawBefore)
  check('预览统计 repointable 至少 2', preview.counts.repointable >= 2)
  check('预览统计 prunable = 1', preview.counts.prunable === 1)
  check('预览统计 unresolved = 1', preview.counts.unresolved === 1)

  const applied = asJson(runRepair(['--json', '--yes']).out)
  check('执行后 repointed = 2', applied.counts.repointed === 2)
  check('案例 1 已可解析', resolves(case1))
  check('案例 1 指向新 slot', samePath(case1, join(nestedHub, 'legacy')))
  check('案例 2 已可解析', resolves(case2))
  check('案例 2 指向新 slot', samePath(case2, join(nestedHub, 'moved')))
  // Compare against the exact relative path to the live hub. Checking "the raw
  // no longer contains /current/skill-manager" would be wrong: the live slot is
  // `v2/current`, so that substring is legitimately part of the fixed link.
  check(
    '案例 2 的 raw 已指向新 slot',
    readlinkSync(case2) === relative(dirname(case2), join(nestedHub, 'moved')),
  )
  check('案例 2 的 raw 是相对路径', !readlinkSync(case2).startsWith('/'))
  // A dangling link has no resolvable target, so `existsSync` is false even
  // though the link itself is still there — check the link, not its target.
  check('案例 3 未被动过（无 --prune）', isLink(case3))
  check('案例 4 未被动过', isLink(case4))
  check('案例 5 raw 未变', readlinkSync(case5) === healthyRaw)

  const again = asJson(runRepair(['--json']).out)
  check('幂等：再跑 repointable = 0', again.counts.repointable === 0)

  const pruned = asJson(runRepair(['--json', '--yes', '--prune']).out)
  check('--prune 删掉 1 条', pruned.counts.pruned === 1)
  check('案例 3 已被剪除', !existsSync(case3) && !isLink(case3))

  // 6. Backup retention. 13 timestamped snapshots plus one unrelated folder.
  //    mtimes are set explicitly: a tight loop can produce identical ones, which
  //    would make "newest 10" depend on readdir order rather than on time.
  const backups = join(container, 'backups')
  mkdirSync(backups, { recursive: true })
  const base = Date.parse('2026-01-01T00:00:00Z')
  for (let i = 1; i <= 13; i++) {
    const name = `20260101-${String(i).padStart(6, '0')}-pre-layout`
    const dir = join(backups, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'manifest.json'), '{}\n', 'utf8')
    utimesSync(dir, new Date(base + i * 1000), new Date(base + i * 1000))
  }
  mkdirSync(join(backups, 'hand-made'), { recursive: true })
  writeFileSync(join(backups, '.DS_Store'), '', 'utf8')

  const snapshotNames = () => readdirSync(backups).filter(n => /^\d{8}-/.test(n)).sort()

  const keepPreview = pruneBackups(backups, { keep: 10 })
  check('保留策略预览：建议删除 3 份', keepPreview.removed.length === 3)
  check('保留策略预览：一份都没删', snapshotNames().length === 13)

  const keepApplied = pruneBackups(backups, { keep: 10, apply: true })
  check('保留策略执行：删除 3 份', keepApplied.removed.length === 3)
  check('剩 10 份快照', snapshotNames().length === 10)
  check('删的是最旧 3 份', !snapshotNames().includes('20260101-000001-pre-layout') && snapshotNames().includes('20260101-000004-pre-layout'))
  check('非快照目录不受影响', existsSync(join(backups, 'hand-made')) && existsSync(join(backups, '.DS_Store')))

  // `protect` exists for the caller still working on an older snapshot: it must
  // survive even though `keep: 1` would otherwise delete it.
  const oldest = '20260101-000004-pre-layout'
  const protectedRun = pruneBackups(backups, { keep: 1, protect: [join(backups, oldest)], apply: true })
  check('protect：被保护的那份仍在', existsSync(join(backups, oldest)))
  check('protect：其余按 keep=1 收敛', protectedRun.removed.length === 8)
  check('protect：最新一份仍在', existsSync(join(backups, '20260101-000013-pre-layout')))
} catch (error) {
  check(`未捕获异常：${error instanceof Error ? error.message : String(error)}`, false)
} finally {
  rmSync(root, { recursive: true, force: true })
}

/** @param {string} p @returns {boolean} */
function resolves(p) {
  try {
    realpathSync(p)
    return true
  } catch {
    return false
  }
}

/** @param {string} p @returns {string | null} the real path, or null when it dangles. */
function realpathSyncSafe(p) {
  try {
    return realpathSync(p)
  } catch {
    return null
  }
}

/**
 * Compare two paths after resolving both. `tmpdir()` on macOS is `/var/folders/…`
 * while `realpathSync` answers `/private/var/folders/…`, so a raw string compare
 * fails for reasons that have nothing to do with the code under test.
 * @param {string} a @param {string} b @returns {boolean}
 */
function samePath(a, b) {
  const left = realpathSyncSafe(a)
  const right = realpathSyncSafe(b)
  return left !== null && right !== null && left === right
}

/** @param {string} p @returns {boolean} */
function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

const failed = results.filter(r => !r.ok)
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label}`)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length > 0) process.exitCode = 1
