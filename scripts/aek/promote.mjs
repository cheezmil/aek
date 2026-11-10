#!/usr/bin/env node
/**
 * promote — take the decisions made in the next slot and apply them to the
 * current slot, incrementally, without ever touching runtime state.
 *
 * WHY THIS EXISTS
 * The two slots are deliberately separate data roots. Development happens in
 * `next`, the shipped app reads `current`. `data-root.mjs` copies a whole root
 * and is the right tool for "initialise a fresh slot" — but using it to
 * upgrade `current` destroys everything current owns and is not in next
 * (`plugin-actions.json`, `shots/`, `aek-system-skill/aek-usage`), drags 300MB
 * of dev output along, and copies `.credentials.yaml` between the two.
 *
 * So this tool moves only the categories that are actually decisions:
 *
 *   skills        `<home>/skill-manager/skills`       user / hand-written skills
 *   registry      `<home>/skill-manager/registry.yaml` + `collections/`
 *   prompts       `<home>/prompt-manager`
 *   mcp           `<home>/mcp/settings`
 *   preferences   `<home>/preferences`
 *   plugins       `<home>/plugins.json`
 *   permissions   `<home>/permissions.json`
 *   websearch     `<home>/websearch`                  contains key material
 *
 * Everything else in a data root (sessions, logs, desktop Chromium profile,
 * dev bundles, rollback copies, quick-git mirrors, pid locks) is runtime state
 * and is NOT in the catalogue by design — it cannot be promoted, only rebuilt.
 *
 * LINK RULES (the reason this file is long)
 *   1. A symlink is never dereferenced. Copying 126 Electron framework aliases
 *      as files would multiply the size and break `Versions/Current`.
 *   2. A relative link is re-emitted with `relative()` against the NEW
 *      location, never by copying the raw string: `aek.yaml` may nest a slot
 *      (`v2/current`), and then the same raw text resolves elsewhere.
 *   3. A link whose target lives INSIDE the source slot is remapped into the
 *      destination slot. Without this, promoting a collection view would leave
 *      it pointing back into `next` — welding the two slots together.
 *   4. A dangling link is skipped and reported. It carries no data.
 *
 * SAFETY
 *   - Direction is fixed: next → current. There is no `--from`.
 *   - No arguments = read-only plan. `--yes` is required to write.
 *   - Both slots must be stopped: a running shell holds file handles under the
 *     root we are about to write, so the app would keep reading the old inode.
 *   - A file that already exists with different content is a CONFLICT and is
 *     left alone; only `--overwrite` replaces it, and then the old copy is
 *     saved under `<container>/backups/<ts>-pre-promote/` first.
 *   - Files that look like credentials need `--include-secrets`.
 *   - Every applied action is written to `manifest.json` in the backup folder,
 *     so `--rollback <dir>` can undo exactly this run.
 *   - After writing, every new link is `realpathSync`-checked; a single dangling
 *     link fails the run (the files are already in place, the report says which).
 *
 * Usage:
 *   node scripts/aek/promote.mjs                          # plan, read-only
 *   node scripts/aek/promote.mjs --only skills,prompts    # plan a subset
 *   node scripts/aek/promote.mjs --all                    # plan every category
 *   node scripts/aek/promote.mjs --yes --only skills      # apply
 *   node scripts/aek/promote.mjs --json                   # machine-readable plan
 *   node scripts/aek/promote.mjs --rollback <backup-dir> --yes
 *
 * Test-only: `--no-running-check` skips the "both slots stopped" guard so
 * `promote-selftest.mjs` can drive a throwaway container while the developer's
 * own two apps keep running. It must never be used on a real data root.
 *
 * @module scripts/aek/promote
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { SLOT_NAMES, SLOTS, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { aekBackupsPath } from '../../packages/aek/base/coraek/home.mjs'
import { manifestFor, resolveDir } from '../../packages/aek/base/coraek/paths.mjs'
import { DEFAULT_KEEP, pruneBackups } from './backup-retention.mjs'

const FROM = 'next'
const TO = 'aek'

/**
 * The categories a developer may promote, keyed by the name given to `--only`.
 * `paths` are relative to a slot's data root; the FIRST segment goes through
 * the manifest `dirs` table so a renamed folder keeps working.
 * `exclude` prunes per-category noise that must never travel.
 */
const CATALOG = [
  { key: 'skills', label: '用户 / 自建技能', paths: ['skill-manager/skills'], exclude: ['.skills', 'log', 'log.txt', 'backup', '.backups', '.DS_Store'] },
  { key: 'registry', label: '技能登记表与集合', paths: ['skill-manager/registry.yaml', 'skill-manager/collections'], exclude: ['.backups', '.DS_Store'] },
  { key: 'prompts', label: 'Prompt 管理器', paths: ['prompt-manager'], exclude: ['.DS_Store'] },
  { key: 'mcp', label: 'MCP 设置', paths: ['mcp/settings'], exclude: ['.internal.json', '.DS_Store'] },
  { key: 'preferences', label: '偏好设置', paths: ['preferences'], exclude: ['.DS_Store'] },
  { key: 'plugins', label: '插件开关', paths: ['plugins.json'], exclude: [] },
  { key: 'permissions', label: '权限登记', paths: ['permissions.json'], exclude: [] },
  { key: 'websearch', label: 'Web Search（含密钥）', paths: ['websearch'], exclude: ['.DS_Store', 'log', 'logs'], sensitive: true },
]

/** Categories selected when `--only` / `--all` says nothing: the safe ones. */
const DEFAULT_KEYS = ['skills', 'registry', 'prompts', 'mcp', 'preferences', 'plugins']

/** A path matching this needs `--include-secrets` before it may be written. */
const SECRET_PATTERN = /(?:^|\/)(?:\.credentials|credentials|secrets?|providers?\.local)[^/]*$|\.(?:key|pem|p12|pfx)$|(?:^|\/)[^/]*(?:api[-_]?key|access[-_]?token|secret[-_]?key)[^/]*$/iu

// ── Argument parsing ─────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const flag = name => argv.includes(`--${name}`)
const value = name => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? null : (argv[i + 1] ?? null)
}

const JSON_OUT = flag('json')
const YES = flag('yes')
const ALL = flag('all')
const OVERWRITE = flag('overwrite')
const INCLUDE_SECRETS = flag('include-secrets')
/**
 * TEST-ONLY escape hatch. Self-tests run against a throwaway container while
 * the developer's own two apps are running, and the guard cannot tell those
 * ports apart from the fake slot's. Never use it on a real data root.
 */
const SKIP_RUNNING_CHECK = flag('no-running-check')

/**
 * How many `<ts>-pre-promote/` trees to keep. Every run adds one and each can
 * be large, so the folder is capped; `backup-retention.mjs` owns the rule and
 * refuses to touch anything that does not look like a timestamped snapshot.
 */
const KEEP_BACKUPS = (() => {
  const raw = value('keep-backups')
  if (raw === null) return DEFAULT_KEEP
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    process.stderr.write(`[promote] --keep-backups 需要一个 ≥1 的整数，收到 ${raw}\n`)
    process.exit(1)
  }
  return parsed
})()
const ROLLBACK_DIR = value('rollback')

const only = (() => {
  const raw = value('only')
  if (!raw) return null
  const keys = raw.split(',').map(s => s.trim()).filter(Boolean)
  const unknown = keys.filter(k => !CATALOG.some(c => c.key === k))
  if (unknown.length > 0) {
    throw new Error(`--only 不认识 ${unknown.join(' | ')}（可用：${CATALOG.map(c => c.key).join(' | ')}）`)
  }
  return keys
})()

// ── Slot paths ───────────────────────────────────────────────────────────────

/** `realpathSync` with a fallback, so a missing root never throws here. */
const realOrSelf = p => {
  try { return realpathSync(p) } catch { return p }
}

/**
 * Absolute path of a manifest-named folder inside a slot.
 *
 * The root is realpath-normalised: `AEK_ROOT` may point through a symlink
 * (`/tmp` on Linux, `/var` → `/private/var` on macOS), and every containment
 * test below compares prefixes. Without normalisation an internal link looks
 * "outside the slot" and gets re-emitted pointing back at the source slot.
 * @param {'aek' | 'next'} slot @param {...string} segments @returns {string}
 */
function slotPath(slot, ...segments) {
  const home = HOMES[slot]
  const [first, ...rest] = segments
  const manifest = manifestFor(home)
  const base = manifest ? resolveDir(manifest.dirs, home, first) : join(home, first)
  return rest.length === 0 ? base : join(base, ...rest)
}

const HOMES = { aek: realOrSelf(slotHome('aek')), next: realOrSelf(slotHome('next')) }
const SRC_HOME = HOMES[FROM]
const DST_HOME = HOMES[TO]

// ── Filesystem helpers ───────────────────────────────────────────────────────

/** @param {string} p @returns {boolean} */
const isLink = p => {
  try { return lstatSync(p).isSymbolicLink() } catch { return false }
}

/** @param {string} p @returns {boolean} */
const isFile = p => {
  try { return lstatSync(p).isFile() } catch { return false }
}

/** @param {string} p @param {string} base @returns {boolean} */
const inside = (p, base) => p === base || p.startsWith(base.endsWith(sep) ? base : base + sep)

/**
 * Content identity of two files. Size first (cheap), then a streamed hash, so
 * a 200MB bundle does not have to sit in memory.
 * @param {string} a @param {string} b @returns {boolean}
 */
function sameFile(a, b) {
  const sa = statSync(a)
  const sb = statSync(b)
  if (sa.size !== sb.size) return false
  /** @param {string} p @returns {string} */
  const digest = p => createHash('md5').update(readFileSync(p)).digest('hex')
  return digest(a) === digest(b)
}

/**
 * Walk a source path into a flat list of entries, never following links.
 * @param {string} root - source root.
 * @param {(rel: string) => boolean} excluded - prune predicate on the relative path.
 * @returns {{ rel: string, abs: string, kind: 'file' | 'link' }[]} entries.
 */
function walk(root, excluded) {
  const out = []
  if (!existsSync(root)) return out
  const visit = (dir, relBase) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name
      if (excluded(rel)) continue
      const abs = join(dir, entry.name)
      if (entry.isSymbolicLink()) out.push({ rel, abs, kind: 'link' })
      else if (entry.isDirectory()) visit(abs, rel)
      else out.push({ rel, abs, kind: 'file' })
    }
  }
  visit(root, '')
  return out
}

// ── Planning ─────────────────────────────────────────────────────────────────

/** @typedef {{ rel: string, src: string, dst: string, kind: 'file' | 'link', action: string, reason?: string, linkTarget?: string, secret?: boolean }} Change */

/**
 * Decide what to do with one source entry.
 * @param {{ rel: string, abs: string, kind: 'file' | 'link' }} entry - one walked entry.
 * @param {string} dst - absolute destination path.
 * @returns {Change} the planned change.
 */
/**
 * @param {{ rel: string, abs: string, kind: 'file' | 'link' }} entry - one walked entry.
 * @param {string} dst - absolute destination path.
 * @param {string[]} willWrite - destinations this run is going to create.
 * @returns {Change} the planned change.
 */
function planEntry(entry, dst, willWrite) {
  const base = { rel: entry.rel, src: entry.abs, dst, kind: entry.kind, secret: SECRET_PATTERN.test(entry.rel) }

  if (entry.kind === 'link') {
    const raw = readlinkSync(entry.abs)
    const abs = isAbsolute(raw) ? resolve(raw) : resolve(dirname(entry.abs), raw)
    let real
    try {
      real = realpathSync(abs)
    } catch {
      return { ...base, action: 'skip', reason: '断链（目标不存在，不带过去）' }
    }
    // Rule 3: an internal target must follow the same relative position in the
    // destination slot, otherwise the link would point back into `next`.
    const mapped = inside(real, SRC_HOME) ? join(DST_HOME, relative(SRC_HOME, real)) : real
    // The target may be a file this same run is about to add — a collection
    // view linking a skill that does not exist in `current` yet. Only a target
    // that is neither present nor about to be written makes the link dangle.
    // A link may point at a DIRECTORY that gains files in this run, so the test
    // is "planned path equals the target or lives under it".
    const planned = willWrite.some(p => p === mapped || inside(p, mapped))
    if (!existsSync(mapped) && !planned) {
      return { ...base, action: 'skip', reason: `断链（槽内目标 ${relative(SRC_HOME, real)} 未随本次晋升，链接会悬空）` }
    }
    const linkTarget = isAbsolute(raw) ? mapped : relative(dirname(dst), mapped)
    if (isLink(dst)) {
      const existingRaw = readlinkSync(dst)
      const existingAbs = isAbsolute(existingRaw) ? resolve(existingRaw) : resolve(dirname(dst), existingRaw)
      if (existingAbs === mapped) return { ...base, action: 'identical', linkTarget }
      return { ...base, action: 'conflict', reason: '目标处已有不同的链接', linkTarget }
    }
    if (existsSync(dst)) return { ...base, action: 'conflict', reason: '目标处是实体文件，源是链接', linkTarget }
    return { ...base, action: 'add', linkTarget }
  }

  if (!existsSync(dst)) return { ...base, action: 'add' }
  if (!isFile(dst)) return { ...base, action: 'conflict', reason: '目标处不是普通文件' }
  return { ...base, action: sameFile(entry.abs, dst) ? 'identical' : 'conflict' }
}

/** @type {Change[]} */
const changes = []
/** @type {{ entry: { rel: string, abs: string, kind: 'link' }, dst: string }[]} */
const pendingLinks = []
const selected = ALL ? CATALOG.map(c => c.key) : (only ?? DEFAULT_KEYS)

for (const category of CATALOG) {
  if (!selected.includes(category.key)) continue
  // A whole category can be key material (`websearch` holds the provider key
  // pool as sqlite DBs). Every file in it then needs --include-secrets, because
  // the file NAME says nothing about what is inside.
  const sensitive = category.sensitive === true
  for (const relPath of category.paths) {
    const srcRoot = slotPath(FROM, relPath)
    const dstRoot = slotPath(TO, relPath)
    if (!existsSync(srcRoot)) continue
    const excluded = rel => category.exclude.some(name => rel.split('/').includes(name))
    // Links are decided AFTER every file is known: a link may target a file
    // this same run is about to create.
    const push = entry => {
      const dst = entry.dst ?? dstRoot
      if (entry.kind === 'link') {
        pendingLinks.push({ entry, dst, sensitive })
        return
      }
      const planned = planEntry(entry, dst, [])
      changes.push(sensitive ? { ...planned, secret: true } : planned)
    }
    if (isLink(srcRoot)) {
      push({ rel: relPath, abs: srcRoot, kind: 'link', dst: dstRoot })
      continue
    }
    if (isFile(srcRoot)) {
      push({ rel: relPath, abs: srcRoot, kind: 'file', dst: dstRoot })
      continue
    }
    for (const entry of walk(srcRoot, excluded)) {
      const dst = join(dstRoot, entry.rel.split('/').join(sep))
      push({ ...entry, rel: `${relPath}/${entry.rel}`, dst })
    }
  }
}

// Second pass: links, now that we know which destinations this run creates.
const willWrite = changes.filter(change => change.action === "add").map(change => change.dst)
for (const { entry, dst, sensitive } of pendingLinks) {
  const planned = planEntry(entry, dst, willWrite)
  changes.push(sensitive ? { ...planned, secret: true } : planned)
}

// ── Running-instance guard ───────────────────────────────────────────────────

/**
 * Pids listening on a port, or null when `lsof` itself is unavailable (sandbox).
 * @param {number} port @returns {string[] | null}
 */
function listenPids(port) {
  try {
    return execFileSync('/usr/sbin/lsof', ['-nP', `-iTCP:${String(port)}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' })
      .split('\n').filter(line => line.startsWith('p')).map(line => line.slice(1)).filter(Boolean)
  } catch {
    return null
  }
}

/**
 * Anything that still runs a slot. Ports are the primary evidence; the runtime
 * pid file is the fallback when `lsof` cannot run in this environment.
 * @returns {string[]} human-readable lines.
 */
function runningSlots() {
  const busy = []
  let portProbeWorked = false
  for (const slot of SLOT_NAMES) {
    for (const port of [SLOTS[slot].webPort, SLOTS[slot].cdpPort]) {
      const pids = listenPids(port)
      if (pids !== null) portProbeWorked = true
      for (const pid of pids ?? []) busy.push(`${slot}: pid ${pid} 占用端口 ${port}`)
    }
    const pidFile = join(slotHome(slot), '.aek-runtime.pid')
    if (!portProbeWorked && existsSync(pidFile)) {
      const pid = readFileSync(pidFile, 'utf8').trim()
      try {
        process.kill(Number(pid), 0)
        busy.push(`${slot}: pid ${pid}（.aek-runtime.pid 仍在运行）`)
      } catch { /* dead pid file, not busy */ }
    }
  }
  return busy
}

// ── Rollback ─────────────────────────────────────────────────────────────────

/**
 * Undo a previous run from its manifest.
 * @param {string} dir - the `*-pre-promote` backup directory.
 * @returns {void}
 */
function rollback(dir) {
  const manifestFile = join(dir, 'manifest.json')
  if (!existsSync(manifestFile)) throw new Error(`找不到 ${manifestFile}`)
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  if (manifest.direction !== `${FROM}->${TO}`) {
    throw new Error(`备份方向是 ${String(manifest.direction)}，期望 ${FROM}->${TO}`)
  }
  if (!YES) {
    process.stdout.write(`[promote] rollback plan (${manifest.actions.length} 项)：\n`)
    for (const action of manifest.actions) process.stdout.write(`  ${action.op} ${action.dst}\n`)
    process.stdout.write('[promote] dry run；加 --yes 执行回滚\n')
    return
  }
  const busy = SKIP_RUNNING_CHECK ? [] : runningSlots()
  if (busy.length > 0) {
    process.stderr.write(`[promote] 有实例在运行，先停掉：\n${busy.map(l => `  ${l}`).join('\n')}\n`)
    process.exitCode = 1
    return
  }
  let restored = 0
  // Reverse order: a directory created early may hold files created later.
  for (const action of [...manifest.actions].reverse()) {
    try {
      if (action.op === 'add') {
        // Nothing existed before: remove what we added.
        if (existsSync(action.dst)) rmSync(action.dst, { recursive: true, force: true })
      } else if (action.op === 'overwrite' && action.backup) {
        if (existsSync(action.backup)) {
          mkdirSync(dirname(action.dst), { recursive: true })
          copyFileSync(action.backup, action.dst)
        }
      }
      restored++
    } catch (error) {
      process.stderr.write(`[promote] 回滚失败 ${action.dst}: ${String(error)}\n`)
      process.exitCode = 1
    }
  }
  process.stdout.write(`[promote] rollback 完成，处理 ${restored}/${manifest.actions.length} 项\n`)
}

if (ROLLBACK_DIR) {
  rollback(resolve(ROLLBACK_DIR))
  process.exit(process.exitCode ?? 0)
}

// ── Report / apply ───────────────────────────────────────────────────────────

const counts = changes.reduce((acc, change) => {
  acc[change.action] = (acc[change.action] ?? 0) + 1
  return acc
}, /** @type {Record<string, number>} */ ({}))

const writable = changes.filter(change => change.action === 'add' || (change.action === 'conflict' && OVERWRITE))
const blocked = changes.filter(change => change.action === 'conflict' && !OVERWRITE)
// Secrets are counted across everything this run COULD write, so the warning
// appears even while the plan is still refusing to overwrite a conflict.
const secrets = changes.filter(change => change.secret && change.action !== 'identical' && change.action !== 'skip')

if (JSON_OUT) {
  // `writeSync(1, …)` and not `process.stdout.write`: a piped stdout is async,
  // and `process.exit()` right after would truncate the JSON mid-string.
  writeSync(1, JSON.stringify({
    direction: `${FROM}->${TO}`,
    source: SRC_HOME,
    destination: DST_HOME,
    slots: { from: FROM, to: TO },
    selected,
    counts,
    wouldWrite: writable.length,
    conflicts: blocked.length,
    secrets: secrets.map(change => change.rel),
    changes,
  }, null, 2))
  process.exit(0)
}

const stamp = () => {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

process.stdout.write(`[promote] mode    = ${YES ? 'EXECUTE' : 'DRY RUN (no side effects)'}\n`)
process.stdout.write(`[promote] 方向    = ${FROM} → ${TO}\n`)
process.stdout.write(`[promote] ${FROM.padEnd(7)} = ${SRC_HOME}\n`)
process.stdout.write(`[promote] ${TO.padEnd(7)} = ${DST_HOME}\n`)
process.stdout.write(`[promote] 条目    = ${selected.join(', ')}\n`)
process.stdout.write(`[promote] 统计    = add ${counts.add ?? 0} · 内容相同 ${counts.identical ?? 0} · 冲突 ${counts.conflict ?? 0} · 跳过 ${counts.skip ?? 0}\n`)

const show = (title, list, limit = 10) => {
  if (list.length === 0) return
  process.stdout.write(`\n── ${title} (${list.length}) ──\n`)
  for (const change of list.slice(0, limit)) {
    process.stdout.write(`  ${change.rel}${change.reason ? `  — ${change.reason}` : ''}\n`)
  }
  if (list.length > limit) process.stdout.write(`  … 其余 ${list.length - limit} 项（--json 全列）\n`)
}

show('将新增', changes.filter(c => c.action === 'add'))
show('内容不同（不覆盖，需 --overwrite）', blocked)
show('跳过', changes.filter(c => c.action === 'skip'))

if (secrets.length > 0) {
  process.stdout.write(`\n⚠️  ${secrets.length} 个文件看起来是密钥：${secrets.slice(0, 6).map(c => c.rel).join(', ')}${secrets.length > 6 ? ' …' : ''}\n`)
  if (!INCLUDE_SECRETS) process.stdout.write('    未传 --include-secrets，本次不会写入这些文件。\n')
}

const effective = INCLUDE_SECRETS ? writable : writable.filter(change => !change.secret)

if (!YES) {
  process.stdout.write(`\n[promote] dry run 结束：将写入 ${effective.length} 项。加 --yes 执行。\n`)
  if (effective.length > 0) process.stdout.write('[promote] 执行前会检查两个槽是否已停止，并把被覆盖的旧文件备份到 backups/\n')
  process.exit(0)
}

if (effective.length === 0) {
  process.stdout.write('\n[promote] 没有需要写入的内容。\n')
  process.exit(0)
}

const busy = SKIP_RUNNING_CHECK ? [] : runningSlots()
if (busy.length > 0) {
  process.stderr.write(`[promote] 两个槽必须全部停止才能晋升（运行中的壳会继续读旧文件）：\n${busy.map(l => `  ${l}`).join('\n')}\n`)
  process.stderr.write('[promote] 先跑 node scripts/aek/slots.mjs --stop-all --yes\n')
  process.exit(1)
}

const backupDir = aekBackupsPath(`${stamp()}-pre-promote`)
mkdirSync(backupDir, { recursive: true })
process.stdout.write(`\n[promote] 备份目录 = ${backupDir}\n`)

// Keep the backup folder bounded: every promotion adds a tree, and a dozen
// promotions is a dozen trees. The one just created is at the top of the
// mtime sort and is protected explicitly besides.
const retention = pruneBackups(dirname(backupDir), { keep: KEEP_BACKUPS, protect: [backupDir], apply: true })
if (retention.removed.length > 0) {
  process.stdout.write(`[promote] 清理旧备份 ${String(retention.removed.length)} 份（保留最新 ${String(retention.keep)} 份）\n`)
}
for (const error of retention.errors) process.stderr.write(`[promote] 旧备份删除失败 ${error}\n`)

/** @type {{ op: string, dst: string, backup: string | null, src: string }[]} */
const applied = []
let failed = 0

for (const change of effective) {
  try {
    mkdirSync(dirname(change.dst), { recursive: true })
    let backup = null
    const existed = existsSync(change.dst) || isLink(change.dst)
    if (existed) {
      const flat = change.dst.slice(DST_HOME.length + 1).split(sep).join('__')
      backup = join(backupDir, flat)
      mkdirSync(dirname(backup), { recursive: true })
      if (isLink(change.dst)) {
        // Preserve what the link pointed at, not just its text.
        writeFileSync(`${backup}.link`, readlinkSync(change.dst), 'utf8')
      } else {
        copyFileSync(change.dst, backup)
      }
    }
    if (change.kind === 'link') {
      const target = change.linkTarget
      if (!target) throw new Error('missing link target')
      const staging = `${change.dst}.promote-${stamp()}`
      rmSync(staging, { force: true })
      symlinkSync(target, staging)
      renameSync(staging, change.dst)
    } else {
      const staging = `${change.dst}.promote-${stamp()}`
      copyFileSync(change.src, staging)
      renameSync(staging, change.dst)
    }
    applied.push({ op: existed ? 'overwrite' : 'add', dst: change.dst, backup, src: change.src })
  } catch (error) {
    failed++
    process.stderr.write(`[promote] 写入失败 ${change.rel}: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

writeFileSync(
  join(backupDir, 'manifest.json'),
  JSON.stringify({ direction: `${FROM}->${TO}`, at: new Date().toISOString(), source: SRC_HOME, destination: DST_HOME, actions: applied }, null, 2),
  'utf8',
)

// Verify every link written in this run: a link that does not resolve is a
// silent data bug, so it is reported loudly (the files stay, rollback is a flag).
let dangling = 0
for (const change of effective) {
  if (change.kind !== 'link' || !existsSync(change.dst)) continue
  try {
    realpathSync(change.dst)
  } catch {
    dangling++
    process.stderr.write(`[promote] 新链接悬空：${change.rel}\n`)
  }
}

process.stdout.write(`[promote] 写入 ${applied.length} 项${failed > 0 ? `，失败 ${failed} 项` : ''}${dangling > 0 ? `，悬空链接 ${dangling} 条` : ''}\n`)
process.stdout.write(`[promote] 回滚：node scripts/aek/promote.mjs --rollback "${backupDir}" --yes\n`)
if (failed > 0 || dangling > 0) process.exitCode = 1
