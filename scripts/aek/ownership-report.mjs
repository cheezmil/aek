#!/usr/bin/env node
/**
 * ownership-report.mjs — 区分"我写的" vs "dsh 上游复制来的"。
 *
 * 用法：
 *   node scripts/aek/ownership-report.mjs [基线目录]
 *   默认基线：/Users/xdx/MyDurio/deepseek-harness
 *
 * 输出三份清单：
 *   1. 自研包（npm scope @cheezmil/*，按名字扫，与目录位置无关）
 *   2. 相对 dsh 基线修改过的文件（两边都有、内容不同）
 *   3. 相对 dsh 基线新增/删除的文件（只在 AEK / 只在基线）
 *
 * 说明：目录管 tier（库→packages、产品→apps），归属看 scope + 本报告。
 * 基线里的 node_modules/lib 等生成物被跳过，只看源码。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname)
const BASELINE = process.argv[2] ?? '/Users/xdx/MyDurio/deepseek-harness'
const TOP_DIRS = ['packages', 'apps', 'vendor']
const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', 'build', '.git', '.turbo'])
// 生成物/二进制后缀，避免噪音
const SKIP_EXT = new Set(['.map', '.tsbuildinfo', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.exe', '.dll', '.node', '.wasm'])

/** 递归列出 dir 下所有文件的仓库相对路径（跳过 SKIP_DIRS / SKIP_EXT）。 */
function* walkRel(dir, prefix) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      yield* walkRel(path.join(dir, ent.name), rel)
    } else if (ent.isFile()) {
      if (SKIP_EXT.has(path.extname(ent.name).toLowerCase())) continue
      yield rel
    }
  }
}

function hashFile(p) {
  return createHash('md5').update(readFileSync(p)).digest('hex')
}

if (!existsSync(BASELINE)) {
  console.error(`基线目录不存在：${BASELINE}`)
  process.exit(1)
}

// 版本漂移预警：基线不是 fork 点版本时，"修改/新增"清单会被上游版本差异污染。
try {
  const aekVersion = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
  const baseVersion = JSON.parse(readFileSync(path.join(BASELINE, 'package.json'), 'utf8')).version
  if (aekVersion !== baseVersion) {
    console.log(`⚠ 版本漂移：AEK fork @ ${aekVersion}，基线 @ ${baseVersion}。`)
    console.log('  下面的"修改/新增"清单混有上游版本差异，需把基线换到 fork 点版本（或先把 AEK 同步到基线版本）后再读。')
  }
} catch { /* 基线缺 package.json 时跳过 */ }

console.log(`# AEK ownership report`)
console.log(`root:     ${ROOT}`)
console.log(`baseline: ${BASELINE}`)
console.log('')

// ── 1) @cheezmil 自研包（按名字扫，不依赖目录位置）────────────────────
const aekPackages = []
for (const top of [...TOP_DIRS, 'native', 'python']) {
  const base = path.join(ROOT, top)
  if (!existsSync(base)) continue
  for (const rel of walkRel(base, top)) {
    if (!rel.endsWith('package.json')) continue
    if (rel.includes('node_modules')) continue
    try {
      const pkg = JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'))
      if (typeof pkg.name === 'string' && pkg.name.startsWith('@cheezmil/')) {
        aekPackages.push({ name: pkg.name, version: pkg.version, at: rel.replace(/package\.json$/, '') })
      }
    } catch { /* 非本仓 package.json，跳过 */ }
  }
}
aekPackages.sort((a, b) => a.at.localeCompare(b.at))
console.log(`## 自研包（@cheezmil）— ${aekPackages.length} 个`)
for (const p of aekPackages) console.log(`  ${p.name}@${p.version}  →  ${p.at}`)
console.log('')

// ── 2/3) 相对 dsh 基线的树 diff ────────────────────────────────────────
const aekFiles = []
for (const top of TOP_DIRS) aekFiles.push(...walkRel(path.join(ROOT, top), top))
const baselineFiles = []
for (const top of TOP_DIRS) {
  const b = path.join(BASELINE, top)
  if (existsSync(b)) baselineFiles.push(...walkRel(b, top))
}

const aekSet = new Set(aekFiles)
const baseSet = new Set(baselineFiles)
const common = aekFiles.filter((f) => baseSet.has(f))
const added = aekFiles.filter((f) => !baseSet.has(f)).sort()
const removed = baselineFiles.filter((f) => !aekSet.has(f)).sort()

const modified = []
for (const f of common.sort()) {
  try {
    if (hashFile(path.join(ROOT, f)) !== hashFile(path.join(BASELINE, f))) modified.push(f)
  } catch { /* 某边读不了就跳过 */ }
}

console.log(`## 修改过的基线文件 — ${modified.length} 个（dsh 目录下、本地改过）`)
for (const f of modified) console.log(`  M ${f}`)
console.log('')
console.log(`## 新增文件（AEK 独有）— ${added.length} 个`)
for (const f of added) console.log(`  A ${f}`)
console.log('')
console.log(`## 删除文件（基线有、AEK 无）— ${removed.length} 个`)
for (const f of removed) console.log(`  D ${f}`)
