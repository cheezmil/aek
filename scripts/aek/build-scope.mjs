#!/usr/bin/env node
/**
 * build-scope.mjs — BF 轮构建白名单计算（BF-2 产物，BF-4 的应用器）。
 *
 * 立场（用户 2026-11-19 裁定）：
 *   - 遥测族已物理剔除（BF-3，不在本脚本范围）。
 *   - 其余无用宿主行走「构建过滤 + 行删除」软路线：不删包目录、不删 bundle
 *     deps（恢复 = 加回白名单 + 加回行 + 重编），但白名单外不编译，且 bundle
 *     patch 里已拍板的行组删除。
 *
 * 用法（不带任何参数 = 只读，零副作用）：
 *   node scripts/aek/build-scope.mjs            计算可达集，打印 ① 白名单 diff
 *                                              ② 行删除清单 ③ 不再编译包列表
 *   node scripts/aek/build-scope.mjs --yes      应用：写白名单文件 + 过滤 tsdown
 *                                              workspace + 删 patch 行组
 *                                              （tsconfig references 不动：两聚合的
 *                                              include 通配仍拉入白名单外包测试文件，
 *                                              剔 references 会 TS6307；typecheck 是
 *                                              检查面，不参与运行内存）
 *
 * 安全约定：
 *   - 默认动作只读；--yes 才写。
 *   - 所有路径相对仓库根计算；脚本内不出现任何绝对路径。
 *   - 红线（永不出白名单）：app-boot 全局 required 八件 + remote-access +
 *     发动机族 + `web` 行（aek-websearch 的 ctx.web 缝隙依赖）。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ── 红线（构建白名单 + 行删除都不可触） ─────────────────────────────────────
const REQUIRED_STARTUP_IDS = [
  'agent-loop', 'webserver', 'web-runtime', 'modules', 'connection',
  'headless-runner', 'acp', 'sdk-jsonrpc-server',
]
const ENGINE_FAMILY_IDS = [
  'llm', 'session', 'storage', 'agent', 'tools', 'sandbox',
  'subprocess', 'subagent', 'credentials',
  'compaction-basic', 'image-offload', 'tool-result-pruner',
  'spill-local', 'spill-policy',
]
const REDLINE_IDS = [...REQUIRED_STARTUP_IDS, 'remote-access', ...ENGINE_FAMILY_IDS, 'web']

// ── 用户拍板的行删除组（BF-4 清单，行 id） ─────────────────────────────────
const CUT_GROUP_ROW_IDS = [
  'llm-pi-ai', 'web-search-deepseek', 'web-deepseek-api', 'web-fetch-http',
  'message-feedback', 'session-log-download',
  'workflow-ptc', 'tool-workflow', 'ptc-runtime',
  'jobs', 'tool-jobs',
  'skill', 'skill-filesystem', 'tool-skill',
  'commands', 'command-goal', 'goal', 'plan-mode',
]

// ── 遥测族物理剔除的行（BF-3 裁定：物理删净，随 --yes 一并执行） ─────────────
const TELEMETRY_ROW_IDS = [
  'otel', 'session-telemetry-otel', 'desktop-product-telemetry', 'product-analytics',
]

// ── 行删除总清单（BF-3 遥测 + BF-4 拍板组；--yes 执行，可达集按删后计算） ──
const DELETE_ROW_IDS = [...TELEMETRY_ROW_IDS, ...CUT_GROUP_ROW_IDS]

// ── 组合链上的三个 bundle patch（repo 内；用户 patch 在 runtime 安装侧，不在此） ─
const PATCH_FILES = [
  'packages/bundle/base/cordis.patch.yml',
  'packages/bundle/web-app/cordis.patch.yml',
  'packages/aek/base/coraek-profile/cordis.patch.yml',
]

const ALLOWLIST_FILE = 'scripts/aek/build-scope.allowlist.json'
const TSDOWN_CONFIG = 'tsdown.config.ts'
const TSDOWN_START = '// build-scope allowlist (written by scripts/aek/build-scope.mjs --yes)'
const TSDOWN_END = '// /build-scope allowlist'

/** @param {string} rel @returns {string} */
const repo = (rel) => join(ROOT, rel)

function safeReaddir(rel) {
  try {
    return readdirSync(repo(rel))
  } catch {
    return []
  }
}

// ── 包目录发现（与 tsdown workspace 的四个 glob 同构） ──────────────────────
function listPackages() {
  const dirs = new Set()
  const add = (rel) => {
    if (existsSync(repo(join(rel, 'package.json')))) dirs.add(rel)
  }
  for (const group of safeReaddir('packages')) {
    const gdir = join('packages', group)
    if (group !== 'aek') {
      for (const sub of safeReaddir(gdir)) add(join(gdir, sub))
      continue
    }
    for (const mid of safeReaddir(gdir)) {
      const mdir = join(gdir, mid)
      if (existsSync(repo(join(mdir, 'package.json')))) add(mdir)
      for (const sub of safeReaddir(mdir)) {
        if (existsSync(repo(join(mdir, sub, 'package.json')))) add(join(mdir, sub))
      }
    }
  }
  for (const v of safeReaddir('vendor')) add(join('vendor', v))
  return [...dirs].sort()
}

// ── 包名 → 目录 ──────────────────────────────────────────────────────────────
function buildNameMap(dirs) {
  const nameToDir = new Map()
  for (const dir of dirs) {
    try {
      const name = JSON.parse(readFileSync(repo(join(dir, 'package.json')), 'utf8')).name
      if (typeof name === 'string') nameToDir.set(name, dir)
    } catch {
      /* directory without a parseable manifest */
    }
  }
  return nameToDir
}

/** Row `name` 可能是 `@scope/pkg` 或 `@scope/pkg/subpath`（导出子路径）；取裸包名。 */
function bareName(rowName) {
  const m = String(rowName).match(/^(@[^/\s]+\/[^/\s]+)(?:\/|$)/u)
  return m ? m[1] : String(rowName)
}

// ── patch 行解析（!!js 保留为数据） ─────────────────────────────────────────
const jsExprType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: String(data) }),
})
const cordisSchema = yaml.JSON_SCHEMA.extend(jsExprType)

/** @returns {{file:string, op:string, id:string, name:string, disabled:unknown, line:number}[]} */
function patchRows(file) {
  const doc = yaml.load(readFileSync(repo(file), 'utf8'), { schema: cordisSchema })
  const sourceLines = readFileSync(repo(file), 'utf8').split('\n')
  const rows = []
  for (const group of Array.isArray(doc) ? doc : []) {
    if (group === null || typeof group !== 'object') continue
    for (const op of ['insert', 'patch', 'replace', 'remove']) {
      const list = group[op]
      if (!Array.isArray(list)) continue
      for (const entry of list) {
        if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') continue
        const found = sourceLines.findIndex((l) => l.trim().endsWith(`id: ${entry.id}`))
        rows.push({ file, op, id: entry.id, name: entry.name, disabled: entry.disabled, line: found >= 0 ? found + 1 : -1 })
      }
    }
  }
  return rows
}

/** disabled 语义：`true` = disabled；缺省/`false`/`!!js` 表达式 = 保守 enabled。 */
function rowEnabled(row) {
  return row.disabled !== true
}

// ── 可达集 ───────────────────────────────────────────────────────────────────
/** 全仓 bundle/profile patch 扫描：红线 id 不在三链 patch 时（如 acp-app bundle）按行名定位包目录。 */
function allRepoPatchFiles() {
  const files = []
  const walk = (rel) => {
    for (const entry of safeReaddir(rel)) {
      const child = join(rel, entry)
      if (entry === 'node_modules' || entry === 'lib') continue
      if (entry === 'cordis.patch.yml') files.push(child)
      else walk(child)
    }
  }
  for (const group of safeReaddir('packages')) walk(join('packages', group))
  return files
}

/**
 * @param {string[]} deleteIds 删行总清单（可达集按删后状态计算：这些行不进种子）
 */
function computeReachable(deleteIds = []) {
  const skip = new Set(deleteIds)
  const dirs = listPackages()
  const nameToDir = buildNameMap(dirs)
  const rows = PATCH_FILES.flatMap(patchRows)

  const seeds = new Set()
  const missingRedline = []
  for (const id of REDLINE_IDS) {
    let row = rows.find((r) => r.id === id && r.op === 'insert')
    if (row === undefined) {
      // 三链之外（acp-app / sdk-app / headless bundle 等）也按行名定位
      for (const file of allRepoPatchFiles()) {
        row = patchRows(file).find((r) => r.id === id && r.op === 'insert')
        if (row !== undefined) break
      }
    }
    if (row === undefined) {
      missingRedline.push(id)
      continue
    }
    const dir = nameToDir.get(bareName(row.name))
    if (dir !== undefined) seeds.add(dir)
  }
  for (const row of rows) {
    if (row.op !== 'insert' || !rowEnabled(row) || skip.has(row.id)) continue
    const dir = nameToDir.get(bareName(row.name))
    if (dir !== undefined) seeds.add(dir)
  }
  for (const dir of dirs) {
    if (dir.startsWith('packages/aek/') || dir.startsWith('vendor/')) seeds.add(dir)
  }
  seeds.add('apps/cli')

  const reachable = new Set(seeds)
  const closureWhy = new Map()
  const queue = [...seeds]
  for (let i = 0; i < queue.length; i += 1) {
    const dir = queue[i]
    if (dir === 'apps/cli') continue
    let manifest
    try {
      manifest = JSON.parse(readFileSync(repo(join(dir, 'package.json')), 'utf8'))
    } catch {
      continue
    }
    for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.devDependencies })) {
      const target = nameToDir.get(dep)
      if (target === undefined || reachable.has(target)) continue
      reachable.add(target)
      closureWhy.set(target, dir)
      queue.push(target)
    }
  }
  return { dirs, nameToDir, rows, reachable, closureWhy, missingRedline }
}

// ── tsdown 成员（复现 tsdown.config.ts 的收集逻辑做 diff） ─────────────────
function tsdownMembers() {
  const bundled = listPackages().filter((dir) => {
    if (!existsSync(repo(join(dir, 'package.json')))) return false
    if (existsSync(repo(join(dir, 'tsdown.config.ts')))) return true
    const tsconfig = repo(join(dir, 'tsconfig.json'))
    if (!existsSync(tsconfig)) return false
    return /"outDir"\s*:\s*"lib\/types"/u.test(readFileSync(tsconfig, 'utf8'))
  })
  return [...bundled, 'apps/cli'].sort()
}

// ── 报告（只读） ────────────────────────────────────────────────────────────
function report() {
  const { dirs, nameToDir, rows, reachable, closureWhy, missingRedline } = computeReachable()
  const dirToName = new Map()
  for (const [name, dir] of nameToDir) dirToName.set(dir, name)
  const members = tsdownMembers()
  const excluded = members.filter((m) => !reachable.has(m))
  const cutRows = rows.filter((r) => CUT_GROUP_ROW_IDS.includes(r.id))
  const redlineViolation = CUT_GROUP_ROW_IDS.filter((id) => REDLINE_IDS.includes(id))

  // 拍板组删行后，其包是否仍被保留面闭包拉回
  const pulledBack = []
  for (const name of new Set(cutRows.map((r) => bareName(r.name)))) {
    const dir = nameToDir.get(name)
    if (dir === undefined || !reachable.has(dir)) continue
    const via = closureWhy.get(dir)
    if (via !== undefined) pulledBack.push({ name, dir, via })
  }

  console.log('=== 构建白名单（build-scope，只读） ===')
  if (missingRedline.length > 0) console.log(`[warn] 红线 id 无 patch 行可定位：${missingRedline.join(', ')}`)
  if (redlineViolation.length > 0) console.log(`[fail] 拍板组与红线相交：${redlineViolation.join(', ')}`)
  console.log(`包目录候选 ${dirs.length}，tsdown 成员 ${members.length}，白名单内 ${members.length - excluded.length}，不再编译 ${excluded.length}`)

  console.log('\n① 白名单 diff（tsdown 成员收敛到可达集；以下出白名单，不再编译）')
  for (const dir of excluded) console.log(`  - ${dir}  (${dirToName.get(dir) ?? '?'})`)

  console.log('\n② 行删除清单（拍板组，删后 Loader 不再挂载这些行）')
  const byFile = new Map()
  for (const row of cutRows) {
    if (!byFile.has(row.file)) byFile.set(row.file, [])
    byFile.get(row.file).push(row)
  }
  for (const [file, fileRows] of byFile) {
    console.log(`  ${file}`)
    for (const row of fileRows) console.log(`    - id=${row.id}  name=${row.name ?? '?'}  ${row.op}  ${rowEnabled(row) ? 'enabled' : 'disabled'}`)
  }
  if (pulledBack.length > 0) {
    console.log('\n  [warn] 拍板组删行后仍被保留面闭包拉回（包留白名单，仅行删除生效）：')
    for (const p of pulledBack) console.log(`    ${p.name} ← 依赖它的 ${p.via}`)
  } else {
    console.log('\n  [ok] 拍板组删行后无保留面闭包依赖（可整组出白名单）')
  }

  console.log('\n③ 不再编译包列表 = ① 排除集；其中 experimental：')
  const experimental = excluded.filter((d) => d.startsWith('packages/experimental/'))
  for (const dir of experimental) console.log(`  - ${dir}`)
  console.log(`（experimental ${experimental.length} 个；非 experimental ${excluded.length - experimental.length} 个）`)

  if (cutRows.length === 0) console.log('\n[warn] 拍板组在 patch 中未找到任何行块（id 或文件漂移）')
}

// ── 应用（--yes） ───────────────────────────────────────────────────────────
function apply() {
  const pre = computeReachable()
  // 白名单按删行后的可达集计算：被删行不进种子，其包随闭包收缩
  const { nameToDir: _n, reachable, missingRedline } = computeReachable(DELETE_ROW_IDS)
  const members = tsdownMembers()
  const included = members.filter((m) => reachable.has(m))
  if (missingRedline.length > 0) console.log(`[warn] 红线 id 无 patch 行可定位：${missingRedline.join(', ')}`)

  writeFileSync(repo(ALLOWLIST_FILE), `${JSON.stringify({
    note: 'BF-2 build-scope allowlist. Written by scripts/aek/build-scope.mjs --yes; delete this file to restore the full build.',
    includes: included,
  }, null, 2)}\n`)
  console.log(`写 ${ALLOWLIST_FILE}（${included.length}/${members.length} 成员，按删行后可达集）`)

  applyTsdown()

  const deleteRows = pre.rows.filter((r) => DELETE_ROW_IDS.includes(r.id) && r.op === 'insert')
  const byFile = new Map()
  for (const row of deleteRows) {
    if (!byFile.has(row.file)) byFile.set(row.file, [])
    byFile.get(row.file).push(row)
  }
  for (const [file, fileRows] of byFile) applyPatchRowDeletions(file, fileRows)

  console.log('\n应用完成。下一步：pnpm run typecheck && pnpm run lint && pnpm run build:lib')
}

function applyTsdown() {
  const path = repo(TSDOWN_CONFIG)
  let source = readFileSync(path, 'utf8')
  const block = [
    TSDOWN_START,
    "const buildScopeAllowlist = existsSync(join(import.meta.dirname, 'scripts/aek/build-scope.allowlist.json'))",
    "  ? new Set(JSON.parse(readFileSync(join(import.meta.dirname, 'scripts/aek/build-scope.allowlist.json'), 'utf8')).includes)",
    '  : undefined // 白名单文件缺失 = 全量构建（软路线默认，恢复路径保持打开）',
    TSDOWN_END,
  ].join('\n')
  if (source.includes(TSDOWN_START)) {
    const a = source.indexOf(TSDOWN_START)
    const b = source.indexOf(TSDOWN_END)
    if (b === -1) throw new Error('tsdown 尾标记缺失，手工修复后再 --yes')
    source = source.slice(0, a) + block + source.slice(b + TSDOWN_END.length)
  } else {
    const anchor = 'export default defineConfig(({ env }) => {'
    if (!source.includes(anchor)) throw new Error('tsdown anchor 未找到')
    source = source.replace(anchor, `${block}\n${anchor}`)
  }
  // 在 workspace 收集处套用过滤（幂等）
  const filterLine = '.filter(dir => buildScopeAllowlist === undefined || buildScopeAllowlist.has(dir))'
  if (!source.includes(filterLine)) {
    const base = "    .filter(isWorkspaceBundled)"
    if (!source.includes(base)) throw new Error('tsdown filter anchor 未找到')
    source = source.replace(base, `${base}\n${filterLine}`)
  }
  writeFileSync(path, source)
  console.log(`更新 ${TSDOWN_CONFIG}`)
}

/**
 * 删 patch 行块：从 `- id: X` 行到下一个「非空且缩进 ≤ 行缩进」的边界为止。
 * 空行不作为边界（`config: |` 字面块内部的空行属于行块本身）。
 * 行块上方紧邻的连续注释行（无空行隔开）一并删去，避免留下孤儿注释。
 */
function applyPatchRowDeletions(file, fileRows) {
  const lines = readFileSync(repo(file), 'utf8').split('\n')
  const indentOf = (l) => (l.match(/^ */u)?.[0] ?? '').length
  for (const row of [...fileRows].sort((a, b) => b.line - a.line)) {
    const start = lines.findIndex((l, i) => i + 1 === row.line && l.trim().endsWith(`id: ${row.id}`))
    if (start === -1) {
      console.log(`[warn] ${file}: 行块定位失败（id=${row.id}，L${row.line}），跳过`)
      continue
    }
    const I = indentOf(lines[start])
    // 上行紧邻的注释行（属于本行块；遇空行即停）
    let from = start
    while (from > 0 && lines[from - 1].trimStart().startsWith('#') && indentOf(lines[from - 1]) >= I) from -= 1
    // 行块尾：下一个非空且缩进 ≤ I 的行（同级项 / 组头 / 更浅缩进）
    let end = start + 1
    while (end < lines.length) {
      const l = lines[end]
      if (l.trim() !== '' && indentOf(l) <= I) break
      end += 1
    }
    lines.splice(from, end - from)
    console.log(`删 ${file} 行块 id=${row.id}（原 L${row.line} 起，含紧邻注释）`)
  }
  writeFileSync(repo(file), lines.join('\n'))
}

// ── main ────────────────────────────────────────────────────────────────────
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('用法：node scripts/aek/build-scope.mjs [--yes]（无参 = 只读报告）')
  process.exit(0)
}
try {
  if (process.argv.includes('--yes')) apply()
  else report()
} catch (error) {
  console.error(`build-scope: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  process.exit(1)
}
