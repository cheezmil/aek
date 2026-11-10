#!/usr/bin/env node
/**
 * Self-test for `promote.mjs`, run against a throwaway container.
 *
 * `promote` writes into a real data root, so it can never be verified by
 * pointing it at the developer's own `~/.aek`. This script builds a fake
 * container in the OS temp directory (`AEK_ROOT` points at it), seeds both
 * slots with the cases that actually matter, runs the real CLI as a child
 * process, and asserts the outcome file by file.
 *
 * Cases covered:
 *   1. a new file is added
 *   2. an identical file is left alone
 *   3. a differing file is a conflict and NOT overwritten
 *   4. `--overwrite` replaces it, saving the old copy to backups/
 *   5. a relative symlink inside the slot is re-pointed at the DESTINATION
 *      slot (never back into the source)
 *   6. a dangling link is skipped, not copied
 *   7. key material (`websearch/*.db`) needs `--include-secrets`
 *   8. `--rollback` restores the pre-run state exactly
 *   9. running with no arguments writes nothing
 *
 * The temp container is deleted on success and KEPT on failure (the path is
 * printed) so a failing case can be inspected.
 *
 * Usage:
 *   node scripts/aek/promote-selftest.mjs
 *
 * @module scripts/aek/promote-selftest
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROMOTE = join(HERE, 'promote.mjs')

/** @type {string[]} */
const failures = []
let checks = 0

/**
 * @param {string} label - what is being asserted.
 * @param {boolean} ok - the condition.
 */
function check(label, ok) {
  checks++
  if (ok) process.stdout.write(`  ok   ${label}\n`)
  else {
    process.stdout.write(`  FAIL ${label}\n`)
    failures.push(label)
  }
}

const root = mkdtempSync(join(tmpdir(), 'aek-promote-'))
const cur = join(root, 'current')
const nxt = join(root, 'next')

writeFileSync(
  join(root, 'aek.yaml'),
  ['version: 1', 'root: .', 'slots:', '  aek: current', '  next: next', 'backups: backups', ''].join('\n'),
  'utf8',
)

/**
 * @param {string} base - slot root.
 * @param {string} rel - path inside the slot.
 * @param {string} content - file body.
 */
function put(base, rel, content) {
  const file = join(base, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf8')
  return file
}

// ── Fixture ──────────────────────────────────────────────────────────────────

put(nxt, 'skill-manager/skills/added/SKILL.md', 'new skill\n')
put(nxt, 'skill-manager/skills/samed/SKILL.md', 'same body\n')
put(cur, 'skill-manager/skills/samed/SKILL.md', 'same body\n')
put(nxt, 'skill-manager/skills/changed/SKILL.md', 'next version\n')
put(cur, 'skill-manager/skills/changed/SKILL.md', 'current version\n')
put(nxt, 'skill-manager/skills/linker/SKILL.md', 'links another skill\n')

// A relative link inside the slot. It must follow the file into `current`.
const linkPath = join(nxt, 'skill-manager/skills/linker/ref')
symlinkSync('../added', linkPath)

// A dangling link carries no data and must not be copied.
symlinkSync('../does-not-exist', join(nxt, 'skill-manager/skills/linker/dead'))

// Key material: never written without --include-secrets.
put(nxt, 'websearch/brave.db', 'PRETEND-KEY-MATERIAL\n')

// ── Run ──────────────────────────────────────────────────────────────────────

const env = { ...process.env, AEK_ROOT: root }
/** @param {string[]} args @returns {{ code: number, out: string }} */
function run(args) {
  try {
    // The developer's own two apps are usually running, and the guard cannot
    // tell their ports from the fake slot's. Only the guard is skipped.
    const argv = [...args, '--no-running-check']
    const out = execFileSync(process.execPath, [PROMOTE, ...argv], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, out }
  } catch (error) {
    return { code: /** @type {any} */ (error).status ?? 1, out: `${/** @type {any} */ (error).stdout ?? ''}${/** @type {any} */ (error).stderr ?? ''}` }
  }
}

process.stdout.write(`临时容器：${root}\n\n── 9. 无参数只读 ──\n`)
const dry = run([])
check('无参数 exit 0', dry.code === 0)
check('无参数没有写入新文件', !existsSync(join(cur, 'skill-manager/skills/added')))
check('计划里有 add 3（两个文件 + 一条链接）', /统计\s*=\s*add 3/.test(dry.out))

process.stdout.write('\n── 1/2/3/5/6/7 计划与首次执行 ──\n')
const plan = run(['--only', 'skills,websearch'])
check('计划 exit 0', plan.code === 0)
check('冲突被识别（changed/SKILL.md）', /冲突 1/.test(plan.out))
check('密钥被拦截警告', /看起来是密钥/.test(plan.out))

const apply = run(['--only', 'skills,websearch', '--yes'])
check('执行 exit 0', apply.code === 0)
check('1. 新文件已写入', existsSync(join(cur, 'skill-manager/skills/added/SKILL.md')))
check('2. 相同文件原样', readFileSync(join(cur, 'skill-manager/skills/samed/SKILL.md'), 'utf8') === 'same body\n')
check('3. 冲突文件未被覆盖', readFileSync(join(cur, 'skill-manager/skills/changed/SKILL.md'), 'utf8') === 'current version\n')
check('7. 密钥文件未写入', !existsSync(join(cur, 'websearch/brave.db')))

const newLink = join(cur, 'skill-manager/skills/linker/ref')
check('5. 链接已创建', existsSync(newLink) && lstatSync(newLink).isSymbolicLink())
const raw = existsSync(newLink) ? readlinkSync(newLink) : ''
check(`5. 链接是相对的（${raw}）`, !raw.startsWith('/'))
check('5. 链接不含源槽名 next', !raw.includes(`${'/'}next`))
check('5. 链接解析到 current 槽内', (() => {
  if (!existsSync(newLink)) return false
  try {
    // Compare real paths: /var is a symlink to /private/var on macOS, so the
    // raw temp-dir prefix never matches what realpath returns.
    return realpathSync(newLink) === realpathSync(join(cur, 'skill-manager/skills/added'))
  } catch {
    return false
  }
})())
check('6. 断链未被复制', !existsSync(join(cur, 'skill-manager/skills/linker/dead')))

process.stdout.write('\n── 4/8 --overwrite 与 --rollback ──\n')
const overwrite = run(['--only', 'skills', '--overwrite', '--yes'])
check('--overwrite exit 0', overwrite.code === 0)
check('4. 冲突被覆盖', readFileSync(join(cur, 'skill-manager/skills/changed/SKILL.md'), 'utf8') === 'next version\n')

const backupLine = overwrite.out.split('\n').find(line => line.includes('备份目录 = '))
const backupDir = backupLine ? backupLine.split('= ')[1].trim() : ''
check('4. 备份目录已创建', backupDir !== '' && existsSync(backupDir))
const backupManifest = backupDir ? JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf8')) : { actions: [] }
check('4. manifest 记录了动作', backupManifest.actions.length > 0)

const rollback = backupDir ? run(['--rollback', backupDir, '--yes']) : { code: 1, out: '' }
check('8. rollback exit 0', rollback.code === 0)
check('8. 被覆盖的文件已还原', readFileSync(join(cur, 'skill-manager/skills/changed/SKILL.md'), 'utf8') === 'current version\n')

// ── Result ───────────────────────────────────────────────────────────────────

process.stdout.write(`\n${checks - failures.length}/${checks} 通过\n`)
if (failures.length > 0) {
  process.stdout.write(`失败项：\n${failures.map(f => `  - ${f}`).join('\n')}\n`)
  process.stdout.write(`现场保留在 ${root}\n`)
  process.exitCode = 1
} else {
  rmSync(root, { recursive: true, force: true })
  process.stdout.write('临时容器已清理\n')
}
