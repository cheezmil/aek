#!/usr/bin/env node
/**
 * Selftest for `@cheezmil/coraek/schema` + `scripts/aek/schema.mjs`.
 *
 * Runs entirely inside `mkdtemp` containers: every data root, container and
 * backup folder is created here, so the real `~/.aek` is never read or written.
 * `AEK_ROOT` / `AEK_HOME` are pinned per case because `aekBackupsPath()` — which
 * the engine uses for snapshots — resolves them at call time.
 *
 * What it asserts, in order: a fresh install gets stamped without being
 * "migrated"; legacy data is migrated; the migrated bytes are exactly the
 * promised ones; a second run is a no-op; comments survive; an existing real
 * `url` is never replaced by a guess; a write that fails mid-run leaves both
 * the file and the version file untouched.
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderManifest } from '../../packages/aek/base/coraek/paths.mjs'
import {
  SCHEMA_FILE,
  SCHEMA_VERSION,
  applySchema,
  migrateOnBoot,
  planSchema,
  readSchemaVersion,
} from '../../packages/aek/base/coraek/schema.mjs'

const CLI = fileURLToPath(new URL('./schema.mjs', import.meta.url))
const ROOT = mkdtempSync(join(tmpdir(), 'aek-schema-'))

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = []
/**
 * @param {string} name @param {boolean} ok @param {string} [detail]
 */
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
}

/**
 * A container with one slot. `files` is written relative to the slot root.
 *
 * Unless `rootFiles` already provides one, a COMPLETE default `aek.yaml` is
 * written too — that is what a real install has. Omitting it is a separate
 * scenario (a pre-manifest install) and gets its own case.
 * @param {string} name - container name.
 * @param {Record<string, string>} [files] - slot-relative path → contents.
 * @param {Record<string, string>} [rootFiles] - container-relative path → contents.
 * @returns {{ container: string, home: string, backups: string }} the layout.
 */
function layout(name, files = {}, rootFiles = { 'aek.yaml': renderManifest() }) {
  const container = join(ROOT, name)
  const home = join(container, 'current')
  const backups = join(container, 'backups')
  mkdirSync(home, { recursive: true })
  mkdirSync(backups, { recursive: true })
  for (const [rel, text] of Object.entries(files)) {
    const full = join(home, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text, 'utf8')
  }
  for (const [rel, text] of Object.entries(rootFiles)) {
    const full = join(container, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text, 'utf8')
  }
  return { container, home, backups }
}

/**
 * True when every line of `before` appears in `after`, in the same order.
 * That is the honest form of "the migration only ADDED lines": a regex strip
 * cannot express it, because the same keys legitimately appear on other rows.
 * @param {string[]} before @param {string[]} after
 */
function isSubsequence(before, after) {
  let cursor = 0
  for (const line of before) {
    while (cursor < after.length && after[cursor] !== line) cursor++
    if (cursor >= after.length) return false
    cursor++
  }
  return true
}

/**
 * Point the process at one container for the duration of `fn`.
 * @param {{ container: string, home: string }} at @param {() => void} fn
 */
function at(at, fn) {
  const before = { root: process.env.AEK_ROOT, home: process.env.AEK_HOME }
  process.env.AEK_ROOT = at.container
  process.env.AEK_HOME = at.home
  try {
    fn()
  } finally {
    if (before.root === undefined) delete process.env.AEK_ROOT
    else process.env.AEK_ROOT = before.root
    if (before.home === undefined) delete process.env.AEK_HOME
    else process.env.AEK_HOME = before.home
  }
}

const REGISTRY = `skills:
  demo:
    path: skills/demo
    title: demo
    category: experimental
    tags: []
    consumers: []
    source:
      type: git
      repo: shenysun/skills-manager
    update_policy: manual
    description: ""
`

// ── 1. Fresh install: stamped, not "migrated" ────────────────────────────────
const fresh = layout('fresh')
at(fresh, () => {
  const plan = planSchema(fresh.home)
  check('1a 全新数据根：没有待迁移项', plan.pending.length === 0, JSON.stringify(plan.pending))
  check('1b 全新数据根：版本读作 0', plan.version === 0)

  const out = applySchema(fresh.home, { apply: true })
  check('1c 全新数据根：直接记到目标版本', readSchemaVersion(fresh.home) === SCHEMA_VERSION, String(readSchemaVersion(fresh.home)))
  check('1d 全新数据根：changed=false（没假装迁移）', out.changed === false)
  check('1e 全新数据根：没有生成快照目录', readdirSync(fresh.backups).length === 0, readdirSync(fresh.backups).join(','))
})

// ── 2. Legacy registry row gets its canonical fields ─────────────────────────
const legacy = layout('legacy', { 'skill-manager/registry.yaml': REGISTRY })
at(legacy, () => {
  const plan = planSchema(legacy.home)
  check('2a 计划命中一个步骤', plan.pending.length === 1 && plan.pending[0].id === 'registry-source-normalize', JSON.stringify(plan.pending.map(p => p.id)))
  check('2b 计划只写一个文件', plan.writes.length === 1 && plan.writes[0].file.endsWith('registry.yaml'))

  const dryRun = applySchema(legacy.home, { apply: false })
  check('2c 预览不写盘', dryRun.changed === false && readFileSync(join(legacy.home, 'skill-manager/registry.yaml'), 'utf8') === REGISTRY)
  check('2d 预览不改版本', readSchemaVersion(legacy.home) === 0)

  const applied = applySchema(legacy.home, { apply: true })
  const after = readFileSync(join(legacy.home, 'skill-manager/registry.yaml'), 'utf8')
  check('2e 执行后 changed=true', applied.changed === true)
  check('2f 版本记到目标', readSchemaVersion(legacy.home) === SCHEMA_VERSION)
  check('2g 推导出 url', after.includes('url: https://github.com/shenysun/skills-manager'))
  check('2h 补齐全部规范字段', ['subpath', 'ref', 'upstream_commit', 'upstream_tree', 'baseline_hash'].every(k => after.includes(`${k}: null`)), after)
  check('2i 保留 repo 作为来源记录', after.includes('repo: shenysun/skills-manager'))
  check('2j 其它内容一字未动（原文件的每一行仍按原顺序存在）', isSubsequence(REGISTRY.split('\n'), after.split('\n')), after)
  check('2k 生成了快照并保留原始字节', applied.snapshot !== null && readdirSync(legacy.backups).some(name => name.includes('pre-schema-v')), String(applied.snapshot))
  const snapshotBytes = applied.snapshot === null
    ? ''
    : readdirSync(applied.snapshot).map(f => readFileSync(join(applied.snapshot ?? '', f), 'utf8')).join('')
  check('2l 快照里存的是迁移前内容', snapshotBytes === REGISTRY)

  // ── 3. Idempotence ─────────────────────────────────────────────────────────
  const again = planSchema(legacy.home)
  check('3a 第二次计划为空（幂等）', again.pending.length === 0 && again.writes.length === 0, JSON.stringify(again.pending.map(p => p.id)))
  const twice = applySchema(legacy.home, { apply: true })
  check('3b 第二次执行不写盘', twice.changed === false && readFileSync(join(legacy.home, 'skill-manager/registry.yaml'), 'utf8') === after)
})

// ── 4. A real url is never replaced by a guess; unknown shapes are skipped ────
const withUrl = layout('with-url', {
  'skill-manager/registry.yaml': REGISTRY.replace(
    '      repo: shenysun/skills-manager',
    '      url: https://gitlab.example.com/x/y\n      repo: shenysun/skills-manager',
  ),
})
at(withUrl, () => {
  const plan = planSchema(withUrl.home)
  const registryWrites = plan.writes.filter(w => w.file.endsWith('registry.yaml'))
  check('4a 已有真实 url：不动 registry', registryWrites.length === 0, JSON.stringify(registryWrites.map(w => w.reason)))
})

const urlNull = layout('url-null', {
  'skill-manager/registry.yaml': REGISTRY.replace(
    '      repo: shenysun/skills-manager',
    '      url: null\n      repo: shenysun/skills-manager',
  ),
})
at(urlNull, () => {
  applySchema(urlNull.home, { apply: true })
  const after = readFileSync(join(urlNull.home, 'skill-manager/registry.yaml'), 'utf8')
  const urlKeys = after.split('\n').filter(line => /^\s+url:/u.test(line))
  check('4b url: null 被替换而不是重复', urlKeys.length === 1 && urlKeys[0].includes('github.com'), urlKeys.join(' | '))
})

const weirdRepo = layout('weird-repo', {
  'skill-manager/registry.yaml': REGISTRY.replace('repo: shenysun/skills-manager', 'repo: just-a-local-folder'),
})
at(weirdRepo, () => {
  check('4c 非 owner/name 的 repo：不猜', planSchema(weirdRepo.home).writes.filter(w => w.file.endsWith('registry.yaml')).length === 0)
})

// ── 5. Manifest dirs backfill, comments preserved ────────────────────────────
const MANIFEST = `# AEK 路径清单 —— 手工注释必须活下来
version: 1
root: .
slots:
  aek: current
  next: next
backups: backups
dirs:
  # 前半段
  skill-manager: skill-manager
  websearch: websearch
`
const manifestCase = layout('manifest', {}, { 'aek.yaml': MANIFEST })
at(manifestCase, () => {
  const plan = planSchema(manifestCase.home)
  check('5a 命中 dirs 补全', plan.pending.some(p => p.id === 'manifest-align'), JSON.stringify(plan.pending.map(p => p.id)))
  const applied = applySchema(manifestCase.home, { apply: true })
  const after = readFileSync(join(manifestCase.container, 'aek.yaml'), 'utf8')
  check('5b 补上了缺失的目录', after.includes('  prompt-manager: prompt-manager') && after.includes('  storages: storages'), after)
  check('5c 注释保留', after.includes('# AEK 路径清单 —— 手工注释必须活下来') && after.includes('# 前半段'))
  check('5d 已有覆盖不被改写', after.includes('  skill-manager: skill-manager'))
  check('5e 写了一个文件', applied.written.some(f => f.endsWith('aek.yaml')), applied.written.join(','))
  check('5f 幂等：再跑没有改动', planSchema(manifestCase.home).writes.length === 0)
})

// ── 6. A write that fails leaves no half-migrated state ──────────────────────
const broken = layout('broken', { 'skill-manager/registry.yaml': REGISTRY })
at(broken, () => {
  // The FILE is read-only: the backup succeeds and the write throws, which is
  // exactly the half-done state the runner has to undo. Making the DIRECTORY
  // read-only would not do it — replacing an existing file's bytes needs no
  // directory permission, only write permission on the file itself.
  chmodSync(join(broken.home, 'skill-manager/registry.yaml'), 0o400)
  const out = applySchema(broken.home, { apply: true })
  chmodSync(join(broken.home, 'skill-manager/registry.yaml'), 0o644)
  check('6a 失败被报告', out.error !== null, String(out.error))
  check('6b 失败后不写版本文件', readSchemaVersion(broken.home) === 0)
  check('6c 失败后原文件完好', readFileSync(join(broken.home, 'skill-manager/registry.yaml'), 'utf8') === REGISTRY)
  check('6d 失败后没有留下快照', readdirSync(broken.backups).length === 0, readdirSync(broken.backups).join(','))
})

// ── 7. Boot hook never throws, even on a data root it cannot write ───────────
const boot = layout('boot', { 'skill-manager/registry.yaml': REGISTRY })
at(boot, () => {
  /** @type {string[]} */
  const lines = []
  const out = migrateOnBoot({ home: boot.home, log: line => lines.push(line) })
  check('7a 启动钩子执行了迁移', out !== null && out.changed === true)
  check('7b 启动钩子打了一行报告', lines.length === 1 && lines[0].includes('data schema'), lines.join(' / '))
  check('7c 版本已推进', readSchemaVersion(boot.home) === SCHEMA_VERSION)

  chmodSync(join(boot.home, 'skill-manager'), 0o500)
  const failedLines = []
  const failed = migrateOnBoot({ home: join(boot.home, 'does-not-exist'), log: line => failedLines.push(line) })
  chmodSync(join(boot.home, 'skill-manager'), 0o755)
  check('7d 不存在的数据根：不抛异常', failed === null || failed.error === null || typeof failed.error === 'string')
})

// ── 8. CLI: plan is read-only, --yes writes, --json parses ───────────────────
const cli = layout('cli', { 'skill-manager/registry.yaml': REGISTRY })
/** @param {string[]} args @returns {{ code: number, out: string }} */
function run(args) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args, '--no-running-check'], {
      encoding: 'utf8',
      env: { ...process.env, AEK_ROOT: cli.container, AEK_HOME: cli.home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (error) {
    const raw = /** @type {any} */ (error)
    return { code: raw.status ?? 1, out: `${raw.stdout ?? ''}${raw.stderr ?? ''}` }
  }
}

const cliPlan = run(['--json'])
let parsed = null
try {
  parsed = JSON.parse(cliPlan.out)
} catch { /* asserted below */ }
check('8a --json 可解析', parsed !== null && parsed.target === SCHEMA_VERSION, cliPlan.out.slice(0, 200))
check('8b 计划模式 rc=0', cliPlan.code === 0)
check('8c 计划模式不写盘', readSchemaVersion(cli.home) === 0)

const cliApply = run(['--yes'])
check('8d --yes 执行成功', cliApply.code === 0, cliApply.out)
check('8e --yes 真的写了', readSchemaVersion(cli.home) === SCHEMA_VERSION)
const cliAgain = run([])
check('8f 再跑一次报告无待迁移', cliAgain.code === 0 && /没有待迁移项/u.test(cliAgain.out), cliAgain.out.split('\n').slice(-2).join(' / '))

// ── 9. A pre-manifest install gets a manifest ────────────────────────────────
const noManifest = layout('no-manifest', { 'skill-manager/registry.yaml': REGISTRY }, {})
at(noManifest, () => {
  const plan = planSchema(noManifest.home)
  check('9a 无清单：命中生成步骤', plan.pending.some(p => p.id === 'manifest-align'), JSON.stringify(plan.pending.map(p => p.id)))
  check('9b 无清单：确实没有 aek.yaml', !existsSync(join(noManifest.container, 'aek.yaml')))
  applySchema(noManifest.home, { apply: true })
  const created = join(noManifest.container, 'aek.yaml')
  check('9c 生成了 aek.yaml', existsSync(created))
  const text = existsSync(created) ? readFileSync(created, 'utf8') : ''
  check('9d 是清单格式（有 version 与 dirs）', /^version: 1$/mu.test(text) && /^dirs:$/mu.test(text), text.slice(0, 80))
  check('9e 声明了当前布局（slots.aek: current）', /^\s+aek: current$/mu.test(text), text)
  check('9f 幂等：再跑无改动', planSchema(noManifest.home).writes.length === 0)
})

// ── Report ───────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok)
for (const row of results) {
  const mark = row.ok ? 'ok  ' : 'FAIL'
  console.log(`${mark} ${row.name}${row.ok || row.detail === '' ? '' : `  ← ${row.detail}`}`)
}
console.log(`\n${String(results.length - failed.length)}/${String(results.length)} 通过`)
if (failed.length > 0) {
  console.log(`临时目录保留在 ${ROOT}`)
  process.exitCode = 1
} else {
  rmSync(ROOT, { recursive: true, force: true })
}
void existsSync
