#!/usr/bin/env node
/**
 * prune-tags.mjs — prune stale LOCAL version tags from this repo.
 *
 * Background: this repo's dev cycle keeps two kinds of local tags:
 *   - structural pins `aek-<sha7>` (created by release.mjs, one per round;
 *     the stable tree's current slot is pinned to one of these) and round
 *     pins `aek-s<N>` — both in active use, NEVER pruned by default
 *   - named version tags (`v1.2.3`, `aek@v0.1.6`, `aek-websearch@v0.2.3`,
 *     …) — release markers that lose their meaning once the corresponding
 *     remote releases are cleared; they are the prune target
 *
 * Repo rule (AGENTS.md §6): git write operations prefer the author's local
 * `cqg` wrapper (token injection / exclude validation) when it is installed;
 * `cqg` is a personal tool, NOT shipped with this repo, so scripts fall
 * back to bare git (see git-runner.mjs) and must keep working on global
 * clones. Execution therefore runs a single `git tag -d <tags…>` call.
 *
 * Safety: no flags = read-only plan, zero side effects. `--yes` executes.
 *
 *   node scripts/aek/prune-tags.mjs            → plan (lists what would go)
 *   node scripts/aek/prune-tags.mjs --yes      → delete (cqg when installed, bare git otherwise)
 *   node scripts/aek/prune-tags.mjs --structural   → plan/execute INCLUDING
 *                                                     structural pins (rare)
 *
 * @module scripts/aek/prune-tags
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gitRunner } from './git-runner.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const YES = flag('yes')
const INCLUDE_STRUCTURAL = flag('structural')

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`[prune-tags] ${message}`)
  process.exit(1)
}

/** @returns {string} repo root: walk up from this script to pnpm-workspace.yaml. */
function repoRoot() {
  let dir = SCRIPT_DIR
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return SCRIPT_DIR
}
const CWD = repoRoot()

/** @param {string[]} args @returns {string} via the effective git runner. */
function git(args) {
  const runner = gitRunner()
  return execFileSync(runner.cmd, [...runner.prefix, ...args], { encoding: 'utf8', cwd: CWD }).trim()
}

/** @returns {string} the stable tree's current pin (the structural tag in use). */
function stablePin() {
  const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8', cwd: CWD })
  const wtDirs = out.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9))
  for (const w of wtDirs.reverse()) {
    try {
      const pin = execFileSync('git', ['describe', '--tags', '--exact-match', 'HEAD'], { encoding: 'utf8', cwd: w, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (pin) return { tree: w, pin }
    } catch { /* not pinned to an exact tag */ }
  }
  return null
}

const STRUCTURAL = /^aek-[0-9a-f]{7}$/ // release.mjs dev-HEAD pins
const ROUND = /^aek-s\d+$/ // round pins (aek-s1, aek-s2, …)
const VERSION = /^(v\d|aek[^@]*@v)/ // named version tags: v* or pkg@v*

const localTags = git(['tag', '-l']).split('\n').filter(Boolean)
if (localTags.length === 0) fail('本地没有任何 tag，无事可做')

const pin = stablePin()
const keep = []
const prune = []
for (const t of localTags) {
  if (STRUCTURAL.test(t) || ROUND.test(t)) {
    if (INCLUDE_STRUCTURAL) prune.push(t)
    else keep.push(t)
  } else if (VERSION.test(t)) {
    prune.push(t)
  } else {
    // unknown shape: never prune by guesswork
    keep.push(`${t}（形状未知，保守保留）`)
  }
}

if (prune.length === 0) {
  console.log(`[prune-tags] 本地 ${localTags.length} 个 tag 全部属于保留类（结构钉位 / 轮钉${INCLUDE_STRUCTURAL ? '' : ' / 未知形状'}），无需清理`)
  if (pin) console.log(`[prune-tags] 稳定树现钉 ${pin.pin}（${pin.tree}）——结构 tag 保持不动`)
  process.exit(0)
}

if (!YES) {
  console.log(`[prune-tags] 本地共 ${localTags.length} 个 tag：保留 ${keep.length}（含稳定树现钉${pin ? ` ${pin.pin}` : ''}）、待删 ${prune.length}`)
  for (const t of prune) console.log(`  删 ${t}`)
  if (keep.length > 0) {
    console.log('  保留：')
    for (const t of keep) console.log(`    ${t}`)
  }
  console.log('')
  console.log(`[prune-tags] 只读计划（零副作用）。执行：node ${join('scripts', 'aek', 'prune-tags.mjs')} --yes（git tag -d，cqg 在场则经 cqg）`)
  console.log('[prune-tags] 提示：被删 tag 若指向仅其可达的旧 commit（历史改写前的链），该 commit 将失去 ref；gitea 远端同名 tag 仍在，可 git fetch 重建。')
  process.exit(0)
}

// single git call for the whole batch (cqg preferred when installed)
git(['tag', '-d', ...prune])
console.log(`[prune-tags] 已删 ${prune.length} 个：${prune.join('、')}`)

// verify
const remaining = git(['tag', '-l']).split('\n').filter(Boolean)
const leaked = remaining.filter((t) => prune.includes(t))
console.log(`[prune-tags] 验证：本地剩余 ${remaining.length} 个 tag，本批残留 ${leaked.length} 个${leaked.length ? `（${leaked.join('、')}）` : ' ✓'}`)
if (leaked.length > 0) process.exit(1)
