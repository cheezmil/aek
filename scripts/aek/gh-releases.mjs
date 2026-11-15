#!/usr/bin/env node
/**
 * gh-releases.mjs — clear the stale GitHub releases surface of this repo's
 * `github` remote. GitHub's Releases page actually mixes THREE kinds of
 * entries, and the REST `/releases` list endpoint only knows two of them:
 *
 *   1. normal releases  — listed by GET /releases (delete by release id)
 *   2. bare tags        — a tag ref with no release body ("tag without a
 *                         release"); listed by GET /tags (delete the ref)
 *   3. orphan releases  — release objects whose tag ref was already deleted.
 *                         GitHub's list endpoint hides them, but
 *                         `gh release list` and the Releases page still show
 *                         them, and they (with their assets!) are reachable
 *                         by tag via /releases/tags/<name> (delete by id).
 *
 * The full target set is derived as:
 *   gh release list names (all three kinds)
 *   → each name resolved to kind 1/2/3 via the two REST list endpoints
 *
 * Default (no flags) = read-only plan. State changes require `--yes`
 * (repo rule: scripts are dry-run by default).
 *
 *   node scripts/aek/gh-releases.mjs               → plan: delete everything
 *   node scripts/aek/gh-releases.mjs --yes        → delete ALL entries
 *   node scripts/aek/gh-releases.mjs --no-tags    → keep bare tags (kinds 1+3)
 *   node scripts/aek/gh-releases.mjs --only <n>   → plan/execute one entry
 *
 * Repo slug is parsed from the git remote named `github`; nothing hardcoded.
 *
 * @module scripts/aek/gh-releases
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? null : (argv[i + 1] ?? null)
}
const YES = flag('yes')
const NO_TAGS = flag('no-tags')
const ONLY = value('only') // entry name to target; omitted = everything

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`[gh-releases] ${message}`)
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

/** @param {string[]} args @returns {string} */
function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', cwd: CWD }).trim()
}

/** @returns {string} `owner/repo` parsed from the git remote named `github`. */
function repoSlug() {
  let out
  try {
    out = run('git', ['remote', 'get-url', 'github'])
  } catch {
    fail('本仓没有名为 github 的 remote（git remote add github <url>）')
  }
  const m = out.match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\s*$/)
  if (!m) fail(`remote github 的 URL 解析不出 owner/repo：${out}`)
  return `${m[1]}/${m[2]}`
}

/** @param {string[]} args @returns {string} raw stdout of `gh api`. */
function ghApi(args) {
  return execFileSync('gh', ['api', ...args], { encoding: 'utf8' })
}

/** @param {string[]} args @returns {unknown} parsed JSON of `gh api`. */
function ghJson(args) {
  return JSON.parse(ghApi(args))
}

const slug = repoSlug()

// kind 1: normal releases (REST list)
const normalReleases = ghJson(['--paginate', `repos/${slug}/releases?per_page=100`])
  /** @type {{ id: number, tag_name: string, name?: string, published_at?: string }[]} */
const normalNames = new Set(normalReleases.map((r) => r.tag_name))

// kind 2 source: remote tag refs (REST list)
const tagNames = ghJson(['--paginate', `repos/${slug}/tags?per_page=100`]).map((t) => t.name)
  /** @type {string[]} */
const bareTags = tagNames.filter((t) => !normalNames.has(t))

/** @param {string} name @returns {{ id: number }} the release object behind the name. */
function releaseByTagName(name) {
  return ghJson([`repos/${slug}/releases/tags/${encodeURIComponent(name)}`])
}

/**
 * `gh --json` prints a single-line JSON array (or NDJSON for some versions):
 * normalize both to an object array.
 * @param {string} raw @returns {{ tagName?: string }[]}
 */
function ghJsonObjects(raw) {
  const t = raw.trim()
  if (!t) return []
  try {
    const parsed = JSON.parse(t)
    if (Array.isArray(parsed)) return parsed
  } catch { /* not a single array — fall through to NDJSON */ }
  return t.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

// full entry set as the Releases page / `gh release list` shows it:
// that command also surfaces kind-3 orphan releases the REST list hides.
const cliNames = ghJsonObjects(run('gh', ['release', 'list', '--limit', '1000', '--json', 'tagName']))
  .map((o) => o.tagName)
const orphans = cliNames.filter((n) => n && !normalNames.has(n) && !tagNames.includes(n))

// assemble the target set as { label, kind, delete: () => void }
const targets = []
for (const r of normalReleases) {
  targets.push({
    label: r.tag_name, kind: 'release',
    del: () => ghApi(['-X', 'DELETE', `repos/${slug}/releases/${r.id}`]),
  })
}
for (const t of NO_TAGS ? [] : bareTags) {
  targets.push({
    label: t, kind: 'bare-tag',
    del: () => ghApi(['-X', 'DELETE', `repos/${slug}/git/refs/tags/${encodeURIComponent(t)}`]),
  })
}
for (const n of orphans) {
  targets.push({
    label: n, kind: 'orphan-release',
    del: () => ghApi(['-X', 'DELETE', `repos/${slug}/releases/${String(releaseByTagName(n).id)}`]),
  })
}

if (ONLY) {
  const hit = targets.filter((t) => t.label === ONLY)
  if (hit.length === 0) {
    fail(`--only ${ONLY} 不在目标集里（共 ${targets.length} 条：${[...new Set(targets.map((t) => t.kind))].join('/')}）`)
  }
  targets.length = 0
  targets.push(...hit)
}
if (targets.length === 0) fail('没有可删对象')

if (!YES) {
  const counts = {}
  for (const t of targets) counts[t.kind] = (counts[t.kind] ?? 0) + 1
  console.log(`[gh-releases] 仓库 github.com/${slug}：共 ${targets.length} 条目标 → ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('、')}`)
  for (const t of targets) {
    let detail = ''
    if (t.kind === 'release') {
      const r = normalReleases.find((x) => x.tag_name === t.label)
      detail = ` ${r?.name ?? ''}\t${r?.published_at ?? ''}`
    }
    if (t.kind === 'orphan-release') detail = '\t（tag ref 已删、release 对象仍在，含其资产）'
    if (t.kind === 'bare-tag') detail = '\t（无 release 正文，显示在 Releases 页）'
    console.log(`  ${t.kind.padEnd(14)} ${t.label}${detail}`)
  }
  console.log('')
  console.log(`[gh-releases] 只读计划（零副作用）。执行：node ${join('scripts', 'aek', 'gh-releases.mjs')}${ONLY ? ` --only ${ONLY}` : ''}${NO_TAGS ? ' --no-tags' : ''} --yes`)
  console.log('[gh-releases] 本地仓的 git tag 不受影响；远端 ref 删除后可用 git tag + push 重建。')
  process.exit(0)
}

// ── Execute ──────────────────────────────────────────────────────────────────
const failures = []
for (const t of targets) {
  try {
    t.del()
    console.log(`[gh-releases] 已删 ${t.kind} ${t.label}`)
  } catch {
    failures.push(t.label)
    console.error(`[gh-releases] 删除失败 ${t.kind} ${t.label}，继续其余`)
  }
}
if (failures.length > 0) {
  fail(`仍有 ${failures.length} 条删除失败：${failures.join('、')}（重跑同命令可续删）`)
}

// verify: re-derive the live sets and confirm every target is gone
const cliNames2 = ghJsonObjects(run('gh', ['release', 'list', '--limit', '1000', '--json', 'tagName']))
  .map((o) => o.tagName)
const tagNames2 = ghJson(['--paginate', `repos/${slug}/tags?per_page=100`]).map((t) => t.name)
const normalNames2 = new Set(ghJson(['--paginate', `repos/${slug}/releases?per_page=100`]).map((r) => r.tag_name))
const stillThere = targets.filter((t) => {
  if (t.kind === 'release') return normalNames2.has(t.label)
  if (t.kind === 'orphan-release') return cliNames2.includes(t.label) && !normalNames2.has(t.label)
  return tagNames2.includes(t.label) // bare-tag (only targeted when !NO_TAGS)
})
console.log(`[gh-releases] 完成：删除 ${targets.length} 条；验证本批残留 ${stillThere.length} 条${stillThere.length ? `（${stillThere.map((t) => t.label).join('、')}，重跑可续删）` : '，本批已清空 ✓'}`)
if (stillThere.length > 0) process.exit(1)
