#!/usr/bin/env node
/**
 * scripts/aek/git-rewrite-history.mjs — 受控历史瘦身（只清误提交的大二进制）
 *
 * 2026-11-11 用户决策：「重写并强推 gitea，GitHub 不动」。
 *
 * 硬约束：
 *  - 默认无参 = 只读报告；`--rewrite` 是 dry-run；只有 `--rewrite --yes` 才改仓库/推远端。
 *  - **唯一允许推送的平台是 gitea**。脚本里所有 push 都固定 `--platform gitea`，
 *    不 fetch / 不 push github；执行后会用 gh api 只读核对 GitHub main 未变。
 *  - 只清 >=20MB 的误提交二进制（实测两个：aek-websearch/aek 与
 *    packages/aek-websearch/aek），不碰 pnpm-lock.yaml / cli-manifest.json。
 *  - 关键顺序：重写 → 强推 gitea（更新 gitea/main 跟踪引用）→ 删本地 github/* 跟踪引用
 *    → reflog expire + gc。若不删 github/*，旧历史（含 67 MiB 二进制）仍可达，GC 白做。
 *  - 源码零绝对路径；git 调用经 `git-runner.mjs`：本机有 `cqg`（作者本地
 *    git 包装）走 `cqg git`，否则回落裸 git。`cqg clean-oversize` 步骤是
 *    cqg 专有能力：无 cqg 时执行模式直接中止并给出裸 git 手工替代，
 *    dry-run 只标注。cqg 不是仓依赖，全球 clone 必须能读懂本脚本。
 *
 * 用法：
 *   node scripts/aek/git-rewrite-history.mjs                     只读报告
 *   node scripts/aek/git-rewrite-history.mjs --rewrite           dry-run 步骤
 *   node scripts/aek/git-rewrite-history.mjs --rewrite --yes     执行
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { gitRunner } from './git-runner.mjs'

const ROOT = process.cwd()
const GIT_DIR = path.join(ROOT, '.git')
const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const doRewrite = has('--rewrite')
const yes = has('--yes') || has('-y')
const PUSH_PLATFORM = 'gitea'
const THRESHOLD = '20MB'
const GITHUB_REPO = 'cheezmil/agent-enhance-kit'
// git runner: `cqg git` when the author's local cqg is installed, bare git otherwise.
const RUNNER = gitRunner()
const HAS_CQG = RUNNER.cmd === 'cqg'

const USAGE = `git-rewrite-history.mjs — 只清历史大二进制，强推 gitea，GitHub 保持不动

  node scripts/aek/git-rewrite-history.mjs                   只读报告（默认 no-op）
  node scripts/aek/git-rewrite-history.mjs --rewrite         dry-run，只打印步骤
  node scripts/aek/git-rewrite-history.mjs --rewrite --yes  执行

阈值 ${THRESHOLD}（只命中两个 33MB 二进制）；重写用 cqg clean-oversize --no-push
（cqg 为作者本地工具；本机未装 cqg 时执行模式会中止，替代：git filter-repo 手工清大文件），
随后只强推 ${PUSH_PLATFORM} 的 main 与 tags（cqg 用 --platform 语法，裸 git 用 remote 名），
删本地 github/* 跟踪引用后 GC。
回滚点：.git/aek-rewrite-backups/<时间戳>/ ${HAS_CQG ? '+ cqg clean-oversize 自带的完整 .git 备份。' : '（无 cqg：请先自行备份 .git）。'}
`

function run(tool, args, options = {}) {
  const label = `${tool} ${args.join(' ')}`
  const result = spawnSync(tool, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  })
  if (result.error) throw new Error(`${label} 无法执行: ${result.error.message}`)
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(`${label} 失败 (exit ${result.status}):\n${out.slice(-2000)}`)
  }
  if (options.print !== false) {
    console.log(`  [${result.status === 0 ? 'ok' : 'warn'}] ${label}`)
    if (options.verbose && out.trim()) console.log(out.trim().slice(0, 1200))
  }
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function git(args, options = {}) {
  return run(RUNNER.cmd, [...RUNNER.prefix, ...args], options)
}

/**
 * push-arg builder: cqg uses `--platform <name>`, bare git uses the remote
 * name positionally. Both target the same remote (gitea).
 * @param {string[]} extra e.g. ['--force','main']
 * @returns {string[]}
 */
function pushArgs(extra) {
  return HAS_CQG ? ['push', '--platform', PUSH_PLATFORM, ...extra] : ['push', PUSH_PLATFORM, ...extra]
}

function gitOut(args, options = {}) {
  return git(args, { print: false, ...options }).stdout
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
        // skip unreadable
      }
    }
  }
  return { bytes, files }
}

function snapshot() {
  const head = gitOut(['rev-parse', 'HEAD']).trim()
  const counts = gitOut(['count-objects', '-vH'])
  const size = dirSize(GIT_DIR)
  const remoteRefs = gitOut([
    'for-each-ref',
    '--format=%(refname) %(objectname)',
    'refs/remotes',
  ]).trim()
  const githubMain = /refs\/remotes\/github\/main\s+([0-9a-f]{40})/.exec(remoteRefs)?.[1] ?? ''
  const giteaMain = /refs\/remotes\/gitea\/main\s+([0-9a-f]{40})/.exec(remoteRefs)?.[1] ?? ''
  const oversized = gitOut([
    'cat-file',
    '--batch-all-objects',
    '--batch-check=%(objectname) %(objecttype) %(objectsize)',
  ]).split('\n').reduce((sum, line) => {
    const [, type, sizeStr] = line.trim().split(/\s+/)
    return type === 'blob' && Number(sizeStr) >= 20 * 1024 ** 2 ? sum + Number(sizeStr) : sum
  }, 0)
  return {
    head,
    gitDirBytes: size.bytes,
    gitDirFiles: size.files,
    counts: counts.trim(),
    oversizedBytes: oversized,
    githubMain,
    giteaMain,
    status: gitOut(['status', '--porcelain=v1']).trim(),
    branch: gitOut(['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
  }
}

function printSnapshot(tag, info) {
  console.log(`\n${tag}`)
  console.log(`  HEAD          ${info.head.slice(0, 12)}  (${info.branch})`)
  console.log(`  .git          ${human(info.gitDirBytes)} / ${info.gitDirFiles} 文件`)
  console.log(`  >=20MiB blob  ${human(info.oversizedBytes)}`)
  console.log(`  gitea/main    ${info.giteaMain.slice(0, 12)}   github/main(本地跟踪) ${info.githubMain.slice(0, 12)}`)
  console.log(`  工作区        ${info.status ? '不干净' : '干净'}`)
  console.log(`  ${info.counts.split('\n').join('  |  ')}`)
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function writeRollbackPoint(before) {
  const dir = path.join(GIT_DIR, 'aek-rewrite-backups', stamp())
  fs.mkdirSync(dir, { recursive: true })
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), value, 'utf8')
  write('head.txt', `${before.head}\n`)
  write('branch.txt', `${before.branch}\n`)
  write('refs-heads.txt', gitOut(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads']))
  write('refs-remotes.txt', gitOut(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes']))
  write('refs-tags.txt', gitOut(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/tags']))
  write('reflog-all.txt', git(['reflog', 'show', '--all'], { print: false, allowFailure: true }).stdout)
  write('remotes.txt', gitOut(['remote', '-v']))
  write('status.txt', before.status)
  write('snapshot-before.json', `${JSON.stringify({ ...before, root: '.' }, null, 2)}\n`)
  return dir
}

function githubRemoteHead() {
  const result = run(
    'gh',
    ['api', `repos/${GITHUB_REPO}/commits/main`, '--jq', '.sha'],
    { print: false, allowFailure: true },
  )
  if (!result.ok) return ''
  return result.stdout.trim()
}

function listGithubTrackingRefs() {
  return gitOut(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes/github'])
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [ref, oid] = line.split(/\s+/)
      return { ref, oid }
    })
}

function rewrite(before) {
  const deleted = listGithubTrackingRefs()
  const steps = [
    ['worktree prune（清理 prunable 元数据）', () => git(['worktree', 'prune'])],
    [
      `cqg clean-oversize --threshold ${THRESHOLD} --no-push --yes${HAS_CQG ? '' : '（本机无 cqg：执行模式会在此前中止）'}`,
      () => {
        if (!HAS_CQG) throw new Error('本机无 cqg：clean-oversize 为 cqg 专有能力（git filter-repo 手工替代）')
        return run('cqg', ['clean-oversize', '--threshold', THRESHOLD, '--no-push', '--yes'], { verbose: true })
      },
    ],
    [
      `强推 ${PUSH_PLATFORM} main（唯一允许的远端写操作）`,
      () => git(pushArgs(['--force', 'main']), { verbose: true }),
    ],
    [
      `强推 ${PUSH_PLATFORM} tags`,
      () => git(pushArgs(['--force', '--tags']), { verbose: true }),
    ],
    ...deleted.map(({ ref, oid }) => [
      `删本地跟踪引用 ${ref} (${oid.slice(0, 12)})，GitHub 远端不动`,
      () => git(['update-ref', '-d', ref]),
    ]),
    ['reflog expire --expire=now --all', () => git(['reflog', 'expire', '--expire=now', '--all'])],
    ['gc --prune=now', () => git(['gc', '--prune=now', '--quiet'])],
  ]

  if (!yes) {
    console.log('DRY RUN — 未执行任何变更。确认后加 --yes。')
    console.log(`将删除的本地 github/* 跟踪引用（${deleted.length} 个，远端分支本身不动）：`)
    for (const item of deleted) console.log(`  ${item.ref} ${item.oid.slice(0, 12)}`)
    console.log('将依次执行:')
    for (const [label] of steps) console.log(`  - ${label}`)
    console.log(`推送平台固定为 ${PUSH_PLATFORM}；脚本不包含任何 github 写操作。`)
    return 0
  }

  if (before.status) {
    console.error('拒绝执行：工作区不干净。')
    return 1
  }
  if (!HAS_CQG) {
    console.error('中止：本机未检测到 cqg（作者本地工具，未随仓分发）。clean-oversize 是 cqg 专有能力。')
    console.error('裸 git 手工替代（先完整备份 .git）：')
    console.error(`  git filter-repo --invert-paths --path <误提交的大文件路径> --threshold ${THRESHOLD}`)
    console.error(`  随后 git push ${PUSH_PLATFORM} --force main / --force --tags（remote 名按本机配置）`)
    console.error('或安装 cqg 后重跑本命令（届时自动经 cqg 执行）。')
    return 1
  }
  const rollback = writeRollbackPoint(before)
  console.log(`回滚点: ${path.relative(ROOT, rollback)}`)
  const githubBefore = githubRemoteHead()
  console.log(`GitHub 远端 main（只读核对，执行前）: ${githubBefore.slice(0, 12) || 'gh api 不可用'}`)

  for (const [label, action] of steps) {
    console.log(`\n> ${label}`)
    try {
      action()
    } catch (error) {
      console.error(`中止：${error instanceof Error ? error.message : String(error)}`)
      console.error(`回滚点保留在 ${path.relative(ROOT, rollback)}；cqg clean-oversize 另有完整 .git 备份。`)
      return 1
    }
  }

  const after = snapshot()
  const githubAfter = githubRemoteHead()
  printSnapshot('=== 重写后 ===', after)
  console.log('')
  console.log(`GitHub 远端 main（只读核对，执行后）: ${githubAfter.slice(0, 12) || 'gh api 不可用'}`)
  if (githubBefore && githubAfter) {
    console.log(
      githubBefore === githubAfter
        ? 'GitHub 未变 ✅（符合「GitHub 不动」）'
        : 'GitHub 变了 ❌ —— 立刻检查是否有意外的 github 推送',
    )
  }
  console.log(
    `.git 体积: ${human(before.gitDirBytes)} -> ${human(after.gitDirBytes)} (${human(after.gitDirBytes - before.gitDirBytes)})`,
  )
  console.log(`>=20MiB blob: ${human(before.oversizedBytes)} -> ${human(after.oversizedBytes)}`)
  console.log(`工作区: ${after.status ? '不干净，需复核' : '干净'}`)
  const githubUnchanged = !githubBefore || !githubAfter || githubBefore === githubAfter
  return githubUnchanged && !after.status ? 0 : 1
}

function main() {
  if (has('--help') || has('-h')) {
    process.stdout.write(USAGE)
    return 0
  }
  const unknown = argv.filter(
    (arg) => !['--rewrite', '--yes', '-y', '--help', '-h'].includes(arg),
  )
  if (unknown.length > 0) {
    console.error(`未知参数: ${unknown.join(' ')}\n`)
    process.stdout.write(USAGE)
    return 2
  }
  if (!fs.existsSync(GIT_DIR)) throw new Error(`当前目录不是 git 仓库根: ${ROOT}`)
  const before = snapshot()
  printSnapshot('=== 当前（只读） ===', before)
  if (!doRewrite) {
    console.log('\n默认只读。加 --rewrite 看 dry-run 步骤，加 --rewrite --yes 才执行。')
    return 0
  }
  return rewrite(before)
}

try {
  process.exitCode = main()
} catch (error) {
  console.error(`[git-rewrite-history] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
