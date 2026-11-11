#!/usr/bin/env node
/**
 * scripts/aek/git-gc.mjs — 本地 .git 维护（只读分析 + 受控 GC）
 *
 * 设计约束（项目硬规则）：
 *  - 默认无参 = 只读报告，零副作用；`--gc` 也是 dry-run；只有 `--gc --yes` 才真的改仓库。
 *  - 所有 git 调用统一走 `cqg git <args>`，禁止裸 git（token 注入 / exclude 校验）。
 *  - 源码零绝对路径：仓库根取 cwd，.git 用相对路径拼；跨平台路径只用 path/os 模块。
 *  - 本脚本永远不 push。推送属于独立的、需用户确认的动作。
 *
 * 用法：
 *   node scripts/aek/git-gc.mjs                 只读报告（默认，no-op）
 *   node scripts/aek/git-gc.mjs --json          只读报告，JSON 输出
 *   node scripts/aek/git-gc.mjs --gc            打印将要执行的清理步骤（dry-run）
 *   node scripts/aek/git-gc.mjs --gc --yes      执行受控 GC（会写 .git，先留回滚点）
 *   node scripts/aek/git-gc.mjs --gc --yes --aggressive   额外做 aggressive repack（很慢）
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const GIT_DIR = path.join(ROOT, '.git')
const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const jsonMode = has('--json')
const doGc = has('--gc')
const yes = has('--yes') || has('-y')
const aggressive = has('--aggressive')

const USAGE = `git-gc.mjs — .git 体积分析与受控 GC（默认只读，永不 push）

  node scripts/aek/git-gc.mjs                    只读报告（默认 no-op）
  node scripts/aek/git-gc.mjs --json             只读报告（JSON）
  node scripts/aek/git-gc.mjs --gc               dry-run，只打印步骤
  node scripts/aek/git-gc.mjs --gc --yes         执行 GC（reflog 保守过期 + gc --prune=now）
  node scripts/aek/git-gc.mjs --gc --yes --aggressive   额外 aggressive repack（很慢）

执行前会在 .git/aek-gc-backups/<时间戳>/ 留 refs / HEAD / reflog / 报告快照。
GC 不会删除「仍被历史引用」的大文件；那种情况需要重写历史，须用户另行确认。
`

function git(args, options = {}) {
  const result = spawnSync('cqg', ['git', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: process.platform === 'win32',
  })
  if (result.error) {
    throw new Error(`cqg git ${args.join(' ')} 无法执行: ${result.error.message}`)
  }
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(
      `cqg git ${args.join(' ')} 失败 (exit ${result.status}): ${String(result.stderr || '').slice(0, 600)}`,
    )
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function human(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`
}

function dirSize(dir) {
  let bytes = 0
  let files = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      try {
        if (entry.isDirectory()) stack.push(full)
        else if (entry.isFile()) {
          bytes += fs.statSync(full).size
          files++
        }
      } catch {
        // unreadable entry: skip, never fail the whole report
      }
    }
  }
  return { bytes, files }
}

function parseCountObjects() {
  const out = git(['count-objects', '-vH']).stdout
  const counts = {}
  for (const line of out.split('\n')) {
    const match = /^([a-z-]+):\s*(.+)$/.exec(line.trim())
    if (match) counts[match[1]] = match[2].trim()
  }
  return counts
}

function readAllObjects() {
  const out = git([
    'cat-file',
    '--batch-all-objects',
    '--batch-check=%(objectname) %(objecttype) %(objectsize)',
  ]).stdout
  const objects = new Map()
  for (const line of out.split('\n')) {
    const parts = line.trim().split(/\s+/)
    const [oid, type, size] = parts
    if (!/^[0-9a-f]{40}$/.test(oid ?? '')) continue
    objects.set(oid, { type, size: Number(size) || 0 })
  }
  return objects
}

function readReachable() {
  const out = git(['rev-list', '--objects', '--all']).stdout
  const reachable = new Set()
  const paths = new Map()
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const space = line.indexOf(' ')
    const oid = space === -1 ? line : line.slice(0, space)
    if (!/^[0-9a-f]{40}$/.test(oid)) continue
    reachable.add(oid)
    if (space !== -1 && !paths.has(oid)) paths.set(oid, line.slice(space + 1))
  }
  return { reachable, paths }
}

function readHeadTree() {
  const out = git(['ls-tree', '-r', 'HEAD']).stdout
  const oids = new Set()
  for (const line of out.split('\n')) {
    const match = /^[0-7]{6}\s+(blob|tree|commit)\s+([0-9a-f]{40})\s/.exec(line)
    if (match) oids.add(match[2])
  }
  return oids
}

function readUnreachable() {
  const result = git(
    ['fsck', '--unreachable', '--no-reflogs', '--no-progress'],
    { allowFailure: true },
  )
  const oids = new Set()
  const other = []
  for (const line of result.stdout.split('\n')) {
    const match = /^unreachable\s+(blob|tree|commit|tag)\s+([0-9a-f]{40})$/.exec(line.trim())
    if (match) oids.add(match[2])
    else if (line.trim()) other.push(line.trim())
  }
  return { oids, other: other.slice(0, 12), exitOk: result.ok }
}

function readPacks() {
  const dir = path.join(GIT_DIR, 'objects', 'pack')
  let names = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith('.pack'))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name))
      return { name, bytes: stat.size, mtime: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.bytes - a.bytes)
}

function readReflogEntries() {
  const result = git(['reflog', 'show', '--all', '--format=%H'], { allowFailure: true })
  if (!result.ok) return -1
  return result.stdout.split('\n').filter((line) => line.trim()).length
}

function analyse() {
  if (!fs.existsSync(GIT_DIR)) {
    throw new Error(`当前目录不是 git 仓库根（缺少 .git）: ${ROOT}`)
  }
  const objects = readAllObjects()
  const { reachable, paths } = readReachable()
  const headTree = readHeadTree()
  const unreachable = readUnreachable()
  const counts = parseCountObjects()
  const packs = readPacks()
  const gitDir = dirSize(GIT_DIR)

  let totalBytes = 0
  let unreachableBytes = 0
  let reachableBytes = 0
  for (const [oid, meta] of objects) {
    totalBytes += meta.size
    if (unreachable.oids.has(oid)) unreachableBytes += meta.size
    else reachableBytes += meta.size
  }
  // fsck 的 unreachable 集合不一定覆盖 --all 之外的全部对象，用可达集合再兜一层
  let outsideRefsBytes = 0
  for (const [oid, meta] of objects) {
    if (!reachable.has(oid)) outsideRefsBytes += meta.size
  }

  const top = [...objects.entries()]
    .filter(([, meta]) => meta.type === 'blob')
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 20)
    .map(([oid, meta]) => ({
      oid: oid.slice(0, 12),
      bytes: meta.size,
      size: human(meta.size),
      path: paths.get(oid) ?? '(unreachable / not in --all)',
      reachable: reachable.has(oid),
      inHead: headTree.has(oid),
    }))

  const byPrefix = new Map()
  for (const [oid, meta] of objects) {
    if (meta.type !== 'blob' || !reachable.has(oid)) continue
    const p = paths.get(oid)
    if (!p) continue
    const key = p.split('/').slice(0, 3).join('/')
    const prev = byPrefix.get(key) ?? { bytes: 0, files: 0, largest: 0 }
    prev.bytes += meta.size
    prev.files++
    prev.largest = Math.max(prev.largest, meta.size)
    byPrefix.set(key, prev)
  }
  const topPaths = [...byPrefix.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 12)
    .map(([prefix, stat]) => ({
      prefix,
      bytes: stat.bytes,
      size: human(stat.bytes),
      files: stat.files,
      largest: human(stat.largest),
    }))

  return {
    root: ROOT,
    gitDirBytes: gitDir.bytes,
    gitDirFiles: gitDir.files,
    packs,
    counts,
    reflogEntries: readReflogEntries(),
    objects: objects.size,
    totalBytes,
    reachableBytes,
    unreachableBytes,
    unreachableCount: unreachable.oids.size,
    outsideRefsBytes,
    fsckExitOk: unreachable.exitOk,
    fsckOther: unreachable.other,
    top,
    topPaths,
    pushSizes: readRemotePushSizes(objects),
    head: git(['rev-parse', 'HEAD']).stdout.trim(),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(),
    // GC 只影响 git 自己的对象库：未跟踪文件不会受损，不该被用来拒绝执行。
    status: git(['status', '--porcelain=v1', '--untracked-files=no']).stdout.trim(),
    statusAll: git(['status', '--porcelain=v1']).stdout.trim(),
  }
}

function readRemotePushSizes(objects) {
  const refs = git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes']).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith('/HEAD'))
  const results = []
  for (const ref of refs) {
    const result = git(['rev-list', '--objects', `${ref}..HEAD`], { allowFailure: true })
    if (!result.ok) continue
    let bytes = 0
    let count = 0
    let largest = { bytes: 0, path: '' }
    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue
      const space = line.indexOf(' ')
      const oid = space === -1 ? line : line.slice(0, space)
      const meta = objects.get(oid)
      if (!meta) continue
      bytes += meta.size
      count++
      const p = space === -1 ? '(commit/tree)' : line.slice(space + 1)
      if (meta.size > largest.bytes) largest = { bytes: meta.size, path: p }
    }
    results.push({
      ref,
      objects: count,
      bytes,
      size: human(bytes),
      largest: human(largest.bytes),
      largestPath: largest.path,
    })
  }
  return results
}

function oversizedReachable(info) {
  const items = info.top.filter((item) => item.reachable && item.bytes >= 10 * 1024 ** 2)
  return {
    count: items.length,
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
    items,
  }
}

function printReport(info) {
  const lines = []
  lines.push(`仓库根      ${info.root}`)
  const untracked = info.statusAll.split('\n').filter((line) => line.startsWith('??')).length
  lines.push(`分支/HEAD   ${info.branch} ${info.head.slice(0, 12)}  已跟踪改动: ${info.status ? '有（拒绝 GC）' : '无'}  未跟踪: ${untracked} 个`)
  lines.push('')
  lines.push('=== .git 体积 ===')
  lines.push(`.git 合计 ${human(info.gitDirBytes)}（${info.gitDirFiles} 个文件）`)
  lines.push(`  loose  : count=${info.counts.count ?? '—'} size=${info.counts.size ?? '—'}`)
  lines.push(`  pack   : ${info.counts.packs ?? '—'} 个，size-pack=${info.counts['size-pack'] ?? '—'}`)
  for (const pack of info.packs) {
    lines.push(`    ${pack.name}  ${human(pack.bytes)}  ${pack.mtime}`)
  }
  lines.push(`  garbage: ${info.counts.garbage ?? '—'} (${info.counts['size-garbage'] ?? '—'})`)
  lines.push('')
  lines.push('=== 对象 ===')
  lines.push(`对象 ${info.objects} 个，未压缩合计 ${human(info.totalBytes)}`)
  lines.push(`  --all 可达之外: ${human(info.outsideRefsBytes)}`)
  lines.push(`  fsck unreachable: ${info.unreachableCount} 个 / ${human(info.unreachableBytes)}`)
  lines.push(`  reflog 条目: ${info.reflogEntries < 0 ? '读取失败' : info.reflogEntries}`)
  if (info.fsckOther.length > 0) {
    lines.push(`  fsck 其它输出: ${info.fsckOther.join(' | ').slice(0, 300)}`)
  }
  lines.push('')
  lines.push('=== 历史最大 blob TOP 20 ===')
  for (const item of info.top) {
    const flags = `${item.reachable ? 'reachable' : 'UNREACHABLE'}${item.inHead ? ' +inHEAD' : ''}`
    lines.push(`  ${item.size.padStart(11)}  ${item.oid}  ${flags.padEnd(22)}  ${item.path}`)
  }
  lines.push('')
  lines.push('=== 可达 blob 按目录聚合 TOP 12（前 3 段路径）===')
  for (const item of info.topPaths) {
    lines.push(`  ${item.size.padStart(11)}  ${String(item.files).padStart(5)} 文件  最大 ${item.largest.padStart(11)}  ${item.prefix}`)
  }
  lines.push('')
  lines.push('=== 待推送对象估算（相对各远端跟踪分支，未压缩体积）===')
  for (const item of info.pushSizes) {
    lines.push(`  ${item.ref.padEnd(16)} ${item.objects} 个对象 / ${item.size.padStart(11)}  最大 ${item.largest.padStart(11)}  ${item.largestPath}`)
  }
  lines.push('')
  lines.push('=== 判断 ===')
  lines.push(`  GC 可回收（不可达对象）约 ${human(Math.max(info.unreachableBytes, info.outsideRefsBytes))} 未压缩体积；loose 会并入新 pack。`)
  const oversized = oversizedReachable(info)
  if (oversized.count > 0) {
    lines.push(`  仍被 --all 引用的 >=10MiB blob: ${oversized.count} 个 / 未压缩合计 ${human(oversized.bytes)}`)
    for (const item of oversized.items) {
      lines.push(`    ${item.size.padStart(11)}  ${item.path}${item.inHead ? '  (当前 HEAD 仍在)' : '  (仅历史)'}`)
    }
    lines.push('  这些是 .git 体积大头，GC 不会删除；要真正瘦身必须重写历史（filter-repo / cqg clean-oversize），须用户明确确认。')
  } else {
    lines.push('  未发现 >=10MiB 的可达历史大文件。')
  }
  return lines.join('\n')
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function writeRollbackPoint(info) {
  const dir = path.join(GIT_DIR, 'aek-gc-backups', stamp())
  fs.mkdirSync(dir, { recursive: true })
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), value, 'utf8')
  write('head.txt', `${info.head}\n`)
  write('branch.txt', `${info.branch}\n`)
  write('refs.txt', git(['for-each-ref', '--format=%(refname) %(objectname)']).stdout)
  const reflog = git(['reflog', 'show', '--all'], { allowFailure: true })
  write('reflog-all.txt', reflog.ok ? reflog.stdout : `# reflog read failed\n${reflog.stderr}`)
  write('status.txt', info.status)
  write('status-all.txt', info.statusAll)
  // 快照是仓库内文件：不要把本机绝对路径写进去（项目零绝对路径规则）。
  write('report-before.json', `${JSON.stringify({ ...info, root: '.' }, null, 2)}\n`)
  return dir
}

function gcSteps() {
  return [
    ['reflog', 'expire', '--expire=30.days.ago', '--expire-unreachable=7.days.ago', '--all'],
    ['gc', '--prune=now', ...(aggressive ? ['--aggressive'] : []), '--quiet'],
    ['multi-pack-index', 'expire'],
    ['multi-pack-index', 'write'],
  ]
}

function runGc(before) {
  const steps = gcSteps()
  if (!yes) {
    console.log('DRY RUN — 未执行任何变更。确认后加 --yes。')
    console.log(`回滚点将写入: ${path.join('.git', 'aek-gc-backups', '<时间戳>')}`)
    console.log('将依次执行:')
    for (const step of steps) console.log(`  cqg git ${step.join(' ')}`)
    console.log('本脚本不 push；--aggressive=' + String(aggressive))
    return 0
  }
  if (before.status) {
    console.error('拒绝 GC：工作区不干净，请先提交或清理。')
    return 1
  }
  const markers = ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply']
  for (const marker of markers) {
    if (fs.existsSync(path.join(GIT_DIR, marker))) {
      console.error(`拒绝 GC：检测到进行中的 ${marker}。`)
      return 1
    }
  }
  const rollback = writeRollbackPoint(before)
  console.log(`回滚点: ${path.relative(ROOT, rollback)}`)
  for (const step of steps) {
    const isOptional = step[0] === 'multi-pack-index'
    const result = git(step, { allowFailure: isOptional })
    console.log(`  cqg git ${step.join(' ')} -> ${result.ok ? 'ok' : 'skipped (optional)'}`)
    if (!result.ok && !isOptional) return 1
  }
  const after = analyse()
  console.log('')
  console.log('=== GC 前后对比 ===')
  console.log(`.git 体积     ${human(before.gitDirBytes)} -> ${human(after.gitDirBytes)}  (${human(after.gitDirBytes - before.gitDirBytes)})`)
  console.log(`pack 数       ${before.packs.length} -> ${after.packs.length}`)
  console.log(`loose count   ${before.counts.count} -> ${after.counts.count}`)
  console.log(`对象总数      ${before.objects} -> ${after.objects}`)
  console.log(`未压缩合计    ${human(before.totalBytes)} -> ${human(after.totalBytes)}`)
  console.log(`unreachable   ${before.unreachableCount} / ${human(before.unreachableBytes)} -> ${after.unreachableCount} / ${human(after.unreachableBytes)}`)
  console.log(`HEAD          ${before.head.slice(0, 12)} -> ${after.head.slice(0, 12)} (${before.head === after.head ? '未变' : '变了，需检查'})`)
  return before.head === after.head ? 0 : 1
}

function main() {
  if (has('--help') || has('-h')) {
    process.stdout.write(USAGE)
    return 0
  }
  const unknown = argv.filter(
    (arg) => !['--json', '--gc', '--yes', '-y', '--aggressive', '--help', '-h'].includes(arg),
  )
  if (unknown.length > 0) {
    console.error(`未知参数: ${unknown.join(' ')}\n`)
    process.stdout.write(USAGE)
    return 2
  }
  const info = analyse()
  if (jsonMode) {
    console.log(JSON.stringify(info, null, 2))
  } else if (!doGc) {
    console.log(printReport(info))
  }
  if (doGc) return runGc(info)
  return 0
}

try {
  process.exitCode = main()
} catch (error) {
  console.error(`[git-gc] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
