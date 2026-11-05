#!/usr/bin/env node
/**
 * scope.mjs — 「AEK 从 dsh 上游取用哪些资产」的唯一真源。
 *
 * 立场：AEK 是一次性分叉，不持续同步 dsh 上游；但 coraek 建立在 cordis 之上，
 * 所以 cordis 运行时架构（vendor/、typert、cordis-* 扩展、契约脚本与测试）
 * 必须完整保留。dsh 的文档站、双语规范、session 格式变更史、GitHub Actions
 * 属于上游治理层，AEK 不需要，也不该为了让复制过来的 dsh 门禁变绿而搬回来。
 *
 * 用法（不带任何参数 = 只读报告，零副作用）：
 *   node scripts/aek/upstream/scope.mjs
 *   node scripts/aek/upstream/scope.mjs --check
 *   node scripts/aek/upstream/scope.mjs --prune                       # 预演，零副作用
 *   node scripts/aek/upstream/scope.mjs --prune --yes                 # 真正删除
 *   node scripts/aek/upstream/scope.mjs --copy --upstream <dir>       # 预演，零副作用
 *   node scripts/aek/upstream/scope.mjs --copy --upstream <dir> --yes # 只补本地缺失，不覆盖
 *   node scripts/aek/upstream/scope.mjs --help
 *
 * 安全约定：
 *   - 默认动作是只读报告；--prune / --copy 不带 --yes 一律 dry-run。
 *   - 上游目录没有默认值，必须由 --upstream 或 AEK_UPSTREAM_DIR 显式提供。
 *   - 所有路径相对仓库根目录计算，脚本内不出现任何绝对路径。
 *   - 删除前校验路径未越出仓库根目录，且跳过符号链接。
 */
import {
  copyFileSync,
  existsSync,
  globSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** 上游取用：cordis 运行时架构 + 代码契约（一个都不能少）。 */
const KEEP = [
  'vendor/**',
  'packages/typert/**',
  'packages/extensions/cordis-host-runner/**',
  'packages/extensions/cordis-client-runner/**',
  'packages/extensions/tool-cordis/**',
  'packages/extensions/ui-cordis/**',
  'packages/preset/agent-preset/skills/*cordis*/**',
  'scripts/cordis-config-files.ts',
  'scripts/cordis-config-files.spec.ts',
  'scripts/cordis-core-api.ts',
  'scripts/cordis-core-api.spec.ts',
  'scripts/cordis-walk.ts',
  'scripts/cordis-yaml.ts',
  'scripts/verify-cordis-config.ts',
  'scripts/verify-cordis-config.spec.ts',
  'scripts/gen-cordis-inspect-catalog.ts', // 产出运行时源码 api-catalog.ts
  'scripts/gen-cordis-catalog-partition.spec.ts',
  // cordis catalog 契约快照：typert/generator/tests/cordis-catalog.spec.ts 逐字节比对它。
  // 它不是 dsh 文档站页面，删了会把 cordis 契约测试打红。
  'docs/cordis-api/inherited.md',
]

/** 上游治理层：与 cordis 运行时无关，AEK 不需要。 */
const DROP = [
  'docs/persistence-changes/**',
  'docs/i18n/**',
  '.agents/skills/dsh-doc/**',
  'docs/subsystems/**',
  'docs/session-format-status.md',
  'docs/session-format-status.zh.md',
  'docs/persistence-schema.json',
  'docs/persistence-catalog.md',
  'docs/persistence-catalog.zh.md',
  'docs/persistence-catalog.i18n.yaml',
  'docs/experimental-persistence-catalog.md',
  'docs/experimental-persistence-catalog.zh.md',
  'docs/experimental-persistence-catalog.i18n.yaml',
  '.github/**',
]

/** 上游文档站门禁：只在 dsh 的 doc-sync / ci-static 聚合里跑，AEK 不跑这些 mode。 */
const DOC_GATES = [
  'doc-typecheck',
  'docs-site-build',
  'doc-graphs',
  'markdown-links',
  'cordis-catalog',
  'persistence-catalog',
  'persistence-changes',
  'persistence-releases',
  'persistence-formats',
  'session-format-catalog',
  'translation-pairing',
  'translation-prompt',
  'doc-budgets',
  'upgrade-guides',
  'doc-standard-tests',
  'docs-site-projection',
  'subsystem-pages',
]

/** 引用过上游文档 corpus 的 spec：删 corpus 后实测只有 3 个会红，其余仍绿。 */
const DOC_SPECS = [
  'scripts/translation-prompt.spec.ts',
  'scripts/translation-pairing.spec.ts',
  'scripts/persistence-releases.spec.ts',
  'scripts/persistence-developer.spec.ts',
  'scripts/persistence-formats.spec.ts',
  'scripts/persistence-changes.spec.ts',
  'scripts/doc-standard.spec.ts',
  'scripts/verify-concrete-terms.spec.ts',
  'scripts/plugin-record-catalog.spec.ts',
  'scripts/verify-package-paths.spec.ts',
  'scripts/verify-package-readme-summaries.spec.ts',
]

/**
 * 实测因缺 corpus 变红的 3 个 spec，必须在 vitest.config.ts 的排除列表里。
 * 文件本身保留：run-gates.ts 的 doc-standard-tests 门与 lint baseline 仍引用它们。
 */
const AEK_EXCLUDED_SPECS = [
  'scripts/doc-standard.spec.ts',
  'scripts/persistence-developer.spec.ts',
  'scripts/translation-prompt.spec.ts',
]

/** 必须保留的 cordis 契约门禁 / 测试，报告里单列，防止误删（此处填 gate id，不是 pnpm 脚本名）。 */
const CORDIS_GATES = [
  'cordis-config',
  'cordis-inspect-catalog',
  'typert-contracts',
  'typecheck',
  'lint',
]
const CORDIS_SPECS = [
  'scripts/cordis-core-api.spec.ts',
  'packages/typert/generator/tests/cordis-catalog.spec.ts',
]

const HELP = `scope.mjs — 固化 AEK 与 dsh 上游的资产边界

  (无参数)                          只读报告（默认，零副作用）
  --check                           DROP 未清 / cordis 缺失 / spec 未排除时退出码 1
  --prune                           预演删除 DROP 清单命中文件（零副作用）
  --prune --yes                     真正删除
  --copy --upstream <dir>           预演从上游补齐 KEEP 清单（零副作用）
  --copy --upstream <dir> --yes     真复制，只补本地缺失、不覆盖已有文件
  --help                            本帮助

上游目录也可由环境变量 AEK_UPSTREAM_DIR 提供；脚本不内置任何默认路径。
KEEP=${KEEP.length} 组 glob，DROP=${DROP.length} 组 glob，排除 spec=${AEK_EXCLUDED_SPECS.length} 个。`

function parseArgs(argv) {
  const opts = { action: 'report', yes: false, upstream: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') opts.action = 'help'
    else if (arg === '--check') opts.action = 'check'
    else if (arg === '--prune') opts.action = 'prune'
    else if (arg === '--copy') opts.action = 'copy'
    else if (arg === '--yes') opts.yes = true
    else if (arg === '--upstream') {
      i += 1
      opts.upstream = argv[i] ?? ''
      if (!opts.upstream) fail('--upstream 需要一个目录参数')
    } else fail(`未知参数：${arg}（用 --help 看用法）`)
  }
  return opts
}

function fail(message) {
  console.error(`scope: ${message}`)
  process.exit(2)
}

/** 生成物/依赖目录不进资产清单，避免 --copy 把 node_modules 或编译产物搬进仓库。 */
const SKIP_SEGMENTS = new Set(['node_modules', '.git', 'lib', 'dist', 'build', '.turbo'])

/** globSync 会把目录一并返回，这里只留真实文件，并跳过符号链接与生成物。 */
function expand(patterns, cwd) {
  const hits = new Set()
  for (const hit of globSync(patterns, { cwd })) {
    const rel = String(hit).split('\\').join('/')
    if (rel.split('/').some(segment => SKIP_SEGMENTS.has(segment))) continue
    const full = join(cwd, rel)
    try {
      if (lstatSync(full).isSymbolicLink()) continue
      if (!statSync(full).isFile()) continue
    } catch {
      continue
    }
    hits.add(rel)
  }
  return [...hits].sort()
}

function insideRoot(rel) {
  const full = resolve(ROOT, rel)
  return full === ROOT || full.startsWith(ROOT + sep)
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function totalSize(files) {
  return files.reduce((sum, rel) => {
    try {
      return sum + statSync(join(ROOT, rel)).size
    } catch {
      return sum
    }
  }, 0)
}

function registeredGates() {
  const source = readFileSync(join(ROOT, 'scripts/run-gates.ts'), 'utf8')
  return new Set([...source.matchAll(/(?:pnpmScript|pnpmExec)\('([^']+)'/g)].map(match => match[1]))
}

/** 3 个红 spec 是否已在 vitest 排除列表里（配置文本出现即视为已排除）。 */
function missingExclusions() {
  const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')
  return AEK_EXCLUDED_SPECS.filter(rel => !config.includes(rel))
}

/** 自底向上删空目录，只处理 DROP 命中文件原本所在的目录。 */
function pruneEmptyDirs(files) {
  const dirs = new Set()
  for (const rel of files) {
    let current = dirname(rel)
    while (current && current !== '.' && current !== '..') {
      dirs.add(current)
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  const removed = []
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
    const full = join(ROOT, dir)
    if (!insideRoot(dir) || !existsSync(full)) continue
    try {
      rmdirSync(full) // 非空会抛错，正是我们要的行为：绝不递归删
      removed.push(dir)
    } catch {
      // 目录非空或已被删，跳过
    }
  }
  return removed
}

function printFileList(files, limit = 12) {
  for (const rel of files.slice(0, limit)) console.log(`  ${rel}`)
  if (files.length > limit) console.log(`  ... 另有 ${files.length - limit} 个文件`)
}

function report() {
  const dropHits = expand(DROP, ROOT)
  const keepHits = expand(KEEP, ROOT)
  const gates = registeredGates()
  const liveDocGates = DOC_GATES.filter(id => gates.has(id))
  const liveDocSpecs = DOC_SPECS.filter(rel => existsSync(join(ROOT, rel)))
  const excludedMissing = missingExclusions()
  const missingCordisGates = CORDIS_GATES.filter(id => !gates.has(id))
  const missingCordisSpecs = CORDIS_SPECS.filter(rel => !existsSync(join(ROOT, rel)))

  console.log('=== AEK / dsh 上游资产边界 ===')
  console.log(`仓库根目录：${ROOT}`)
  console.log('')
  console.log(`[KEEP] cordis 运行时架构：本地命中 ${keepHits.length} 个文件`)
  console.log(`[DROP] dsh 治理层：本地命中 ${dropHits.length} 个文件 / ${humanSize(totalSize(dropHits))}`)
  printFileList(dropHits)
  console.log('')
  console.log(`[GATE] 仍注册的上游文档门禁 ${liveDocGates.length}/${DOC_GATES.length}（AEK 不跑 doc-sync / ci-static，仅记录）：${liveDocGates.join(', ') || '无'}`)
  console.log(`[SPEC] 引用过 dsh 文档的 spec 文件仍存在 ${liveDocSpecs.length}/${DOC_SPECS.length} 个（保留文件，靠 vitest 排除）`)
  console.log(`[SPEC] 应排除但尚未排除：${excludedMissing.join(', ') || '无'}`)
  console.log(`[KEEP-CHECK] cordis 契约门禁缺失：${missingCordisGates.join(', ') || '无'}`)
  console.log(`[KEEP-CHECK] cordis 契约测试缺失：${missingCordisSpecs.join(', ') || '无'}`)
  return { dropHits, keepHits, excludedMissing, missingCordisGates, missingCordisSpecs }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.action === 'help') {
    console.log(HELP)
    return
  }
  if (!existsSync(join(ROOT, 'scripts/run-gates.ts'))) fail('找不到 run-gates.ts，请确认在 AEK 仓库内运行')

  if (opts.action === 'copy') {
    const upstream = opts.upstream || process.env.AEK_UPSTREAM_DIR || ''
    if (!upstream) fail('--copy 必须配 --upstream <dir>（或环境变量 AEK_UPSTREAM_DIR）')
    if (!existsSync(upstream)) fail(`上游目录不存在：${upstream}`)
    const upstreamRoot = resolve(upstream)
    const sourceFiles = expand(KEEP, upstreamRoot)
    const missing = sourceFiles.filter(rel => !existsSync(join(ROOT, rel)))
    console.log(`上游 KEEP 命中 ${sourceFiles.length} 个文件；本地缺失 ${missing.length} 个`)
    printFileList(missing, 20)
    if (!opts.yes) {
      console.log('[dry-run] 未写入任何文件；加 --yes 才复制（只补缺失，不覆盖已有文件）')
      return
    }
    let copied = 0
    for (const rel of missing) {
      if (!insideRoot(rel)) continue
      const dest = join(ROOT, rel)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(join(upstreamRoot, rel), dest)
      copied += 1
    }
    console.log(`已复制 ${copied} 个文件（未覆盖任何已有文件）`)
    return
  }

  const state = report()
  if (opts.action === 'check') {
    const dirty = state.dropHits.length > 0 || state.excludedMissing.length > 0
      || state.missingCordisGates.length > 0 || state.missingCordisSpecs.length > 0
    console.log('')
    console.log(dirty ? '[check] FAIL：边界未收敛' : '[check] OK：边界已收敛')
    if (dirty) process.exitCode = 1
    return
  }
  if (opts.action === 'prune') {
    console.log('')
    if (state.dropHits.length === 0) {
      console.log('[prune] 没有命中 DROP 清单的文件，无需操作')
      return
    }
    if (!opts.yes) {
      console.log(`[dry-run] 将删除 ${state.dropHits.length} 个文件 / ${humanSize(totalSize(state.dropHits))}；未做任何改动`)
      console.log('[dry-run] 加 --yes 才真正删除')
      return
    }
    let removed = 0
    for (const rel of state.dropHits) {
      if (!insideRoot(rel)) {
        console.warn(`[prune] 跳过越界路径：${rel}`)
        continue
      }
      rmSync(join(ROOT, rel), { force: true })
      removed += 1
    }
    const emptyDirs = pruneEmptyDirs(state.dropHits)
    console.log(`[prune] 已删除 ${removed} 个文件，清理空目录 ${emptyDirs.length} 个`)
    console.log('[prune] 只动了 DROP 清单命中的文件；cordis 资产、spec、门禁配置均未改动')
    return
  }
  console.log('')
  console.log('只读报告完成，未做任何改动（--help 看其它动作）')
}

main()
