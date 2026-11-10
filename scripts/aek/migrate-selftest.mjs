#!/usr/bin/env node
/**
 * Self-test for `migrate-data-root.mjs`: the move AND the link repair it now
 * performs on its own.
 *
 * Runs against a throwaway container plus a throwaway HOME, so the real
 * `~/.aek` and the real `~/.claude/skills` are never touched.
 *
 * What it proves, in the order the migration does it:
 *   1. the flat entries land inside `current/`, as real directories
 *   2. `aek-next` becomes `next/` (rename, not a link)
 *   3. consumer links that pointed at the flat hub resolve again, and point at
 *      `current/skill-manager/…` — the whole reason the repair step exists
 *   4. the snapshot record mentions the repair, so a later rollback is auditable
 *   5. `backups/` is capped at `--keep-backups`
 *   6. `--no-repair` really skips the repair, and `--rollback` repairs back
 *
 * `--no-running-check` is test-only: the developer's own apps own 1685/1687 and
 * the port guard cannot tell them apart from a fake slot.
 *
 * Usage:
 *   node scripts/aek/migrate-selftest.mjs
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
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATE = join(HERE, 'migrate-data-root.mjs')

const root = mkdtempSync(join(tmpdir(), 'aek-migrate-'))
/** @type {{ ok: boolean, label: string }[]} */
const results = []
/** @param {string} label @param {boolean} ok */
function check(label, ok) {
  results.push({ ok, label })
}

/** @param {string} p */
function mkdirp(p) {
  mkdirSync(p, { recursive: true })
  return p
}

/** @param {string} at @param {string} content */
function file(at, content) {
  mkdirp(dirname(at))
  writeFileSync(at, content, 'utf8')
}

/**
 * @param {string[]} args
 * @param {{ AEK_ROOT: string, HOME: string }} env
 * @returns {{ code: number, out: string }}
 */
function run(args, env) {
  try {
    const out = execFileSync(process.execPath, [MIGRATE, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (error) {
    const raw = /** @type {any} */ (error)
    return { code: raw.status ?? 1, out: `${raw.stdout ?? ''}${raw.stderr ?? ''}` }
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

/** @param {string} p @returns {string | null} */
function realpathSafe(p) {
  try {
    return realpathSync(p)
  } catch {
    return null
  }
}

/**
 * Build one flat-layout container + a legacy `next` root + a consumer HOME.
 * @param {string} base - temp base directory.
 */
function fixture(base) {
  const container = join(base, 'aek')
  const legacyNext = join(base, 'aek-next')
  const home = join(base, 'home')

  // The aek slot, flat: a real hub, plus folders proving "not a skeleton".
  const hub = join(container, 'skill-manager', 'skills')
  mkdirp(join(hub, 'demo'))
  file(join(hub, 'demo', 'SKILL.md'), '# demo\n')
  file(join(container, 'skill-manager', 'registry.yaml'), 'skills: {}\n')
  file(join(container, 'plugins.json'), '[]\n')
  mkdirp(join(container, 'preferences'))

  // The next slot, pre-container location.
  const nextHub = join(legacyNext, 'skill-manager', 'skills')
  mkdirp(join(nextHub, 'demo-next'))
  file(join(nextHub, 'demo-next', 'SKILL.md'), '# demo-next\n')

  // A consumer link in another agent's runtime dir, written the way the
  // distributor writes it: relative to the flat hub.
  const linkPath = join(home, '.claude', 'skills', 'demo')
  mkdirp(dirname(linkPath))
  symlinkSync(relative(dirname(linkPath), join(hub, 'demo')), linkPath)

  return { container, legacyNext, home, linkPath }
}

try {
  // ── 1. migrate, with the repair step ──────────────────────────────────────
  const a = fixture(join(root, 'case-a'))
  const envA = { AEK_ROOT: a.container, HOME: a.home }

  const planOut = run(['--no-running-check'], envA).out
  check('plan: 报告有几条链接指向 flat hub', /1 consumer link\(s\) point at the flat hub/.test(planOut))
  check('plan: 说明会自动修', /will be re-pointed/.test(planOut))
  check('plan: 迁移前一个文件都没动', existsSync(join(a.legacyNext, 'skill-manager')) && existsSync(join(a.container, 'plugins.json')))

  const migrated = run(['--yes', '--no-running-check'], envA)
  check('migrate: exit 0', migrated.code === 0)
  check('migrate: current/ 出现了', existsSync(join(a.container, 'current')))
  check('migrate: next/ 是真实目录', existsSync(join(a.container, 'next')) && !isLink(join(a.container, 'next')))
  check('migrate: 旧的 aek-next 已消失', !existsSync(a.legacyNext))
  check('migrate: 数据真的搬进去了', existsSync(join(a.container, 'current', 'plugins.json')))
  check('migrate: 旧 flat 目录已清空', !existsSync(join(a.container, 'skill-manager')))

  check('links: 消费者链接重新可解析', realpathSafe(a.linkPath) !== null)
  check(
    'links: 指向 current/skill-manager',
    realpathSafe(a.linkPath) === realpathSafe(join(a.container, 'current', 'skill-manager', 'skills', 'demo')),
  )
  check('links: 新 raw 是相对路径', !readlinkSync(a.linkPath).startsWith('/'))

  const backupsDir = join(a.container, 'backups')
  const snapshots = readdirSync(backupsDir).filter(n => /^\d{8}-/.test(n))
  check('备份: 写出了快照', snapshots.length === 1)
  const record = JSON.parse(readFileSync(join(backupsDir, snapshots[0], 'manifest.json'), 'utf8'))
  check('备份: 记录里含 linkRepair', record.linkRepair && record.linkRepair.ok === true)
  check('备份: 记录里重指条数 ≥1', (record.linkRepair?.counts?.repointed ?? 0) >= 1)

  // ── 2. retention: 12 pre-existing snapshots + the new one = cap at 10 ─────
  const b = fixture(join(root, 'case-b'))
  mkdirp(join(b.container, 'backups'))
  for (let i = 1; i <= 12; i++) {
    const name = `20260101-${String(i).padStart(6, '0')}-pre-layout`
    file(join(b.container, 'backups', name, 'manifest.json'), '{}')
  }
  file(join(b.container, 'backups', 'hand-made', 'notes.md'), 'keep me\n')
  const envB = { AEK_ROOT: b.container, HOME: b.home }
  const capped = run(['--yes', '--no-running-check', '--keep-backups', '10'], envB)
  check('retention: 迁移成功', capped.code === 0)
  const leftB = readdirSync(join(b.container, 'backups')).filter(n => /^\d{8}-/.test(n))
  check('retention: 收敛到 10 份', leftB.length === 10)
  check('retention: 非快照目录保留', existsSync(join(b.container, 'backups', 'hand-made', 'notes.md')))
  check('retention: 输出说明了清理数量', /removed \d+ older/.test(capped.out))

  // ── 3. --no-repair leaves the links stale, and says so ────────────────────
  const c = fixture(join(root, 'case-c'))
  const envC = { AEK_ROOT: c.container, HOME: c.home }
  const skipped = run(['--yes', '--no-running-check', '--no-repair'], envC)
  check('no-repair: 迁移仍然成功', skipped.code === 0)
  check('no-repair: 链接仍然悬空', realpathSafe(c.linkPath) === null)
  check('no-repair: 输出里写明了跳过', /link repair skipped/.test(skipped.out))

  // ── 4. rollback repairs the links back to the flat hub ────────────────────
  const snapshotDir = join(c.container, 'backups', readdirSync(join(c.container, 'backups')).filter(n => /^\d{8}-/.test(n))[0])
  const rolled = run(['--rollback', snapshotDir, '--yes', '--no-running-check'], envC)
  check('rollback: exit 0', rolled.code === 0)
  check('rollback: 回到 flat 布局', existsSync(join(c.container, 'plugins.json')) && !existsSync(join(c.container, 'current')))
  check('rollback: 链接被修回 flat hub', realpathSafe(c.linkPath) === realpathSafe(join(c.container, 'skill-manager', 'skills', 'demo')))
} catch (error) {
  check(`未捕获异常：${error instanceof Error ? error.message : String(error)}`, false)
} finally {
  rmSync(root, { recursive: true, force: true })
}

const failed = results.filter(r => !r.ok)
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label}`)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length > 0) process.exitCode = 1
