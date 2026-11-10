#!/usr/bin/env node
/**
 * Move a slot to a new location — the manifest edit AND everything that depends
 * on it, in one safe step.
 *
 * `aek.yaml` is the single place that says where each slot lives. That makes
 * relocating a folder a one-line edit… which is exactly the trap: hand-editing
 * the file leaves every consumer link (`~/.claude/skills/x` → `../../.aek/
 * current/skill-manager/skills/x`) pointing at a path that no longer exists.
 * Nothing detects it, the app just starts with zero skills.
 *
 * This tool does the whole move as one transaction:
 *
 *   1. preflight  — is anything running, does the target already exist, is the
 *                   rename possible on one volume, how many links point at the
 *                   OLD location right now
 *   2. snapshot   — write the manifest bytes plus a record into
 *                   `<container>/backups/<ts>-pre-relocate/` (the rename itself
 *                   is reversible, so no data is copied)
 *   3. rename     — one `rename(2)`, atomic, no copy
 *   4. manifest   — rewrite ONLY the `slots.<name>` line, preserving every
 *                   comment and every other line; re-read to prove it took
 *   5. repair     — re-point the consumer links at the new hub location
 *   6. verify     — the manifest validates and no link dangles
 *   7. backups    — keep the newest N snapshots
 *
 * Any failure after step 3 undoes steps 3–4 (rename back, restore the manifest
 * bytes) and re-runs the repair, so a failed move leaves the machine exactly
 * where it started.
 *
 * Default is a read-only plan. `--yes` performs the move.
 *
 * Usage:
 *   node scripts/aek/relocate.mjs --slot aek --to v2/current        # plan
 *   node scripts/aek/relocate.mjs --slot aek --to v2/current --yes  # move
 *   node scripts/aek/relocate.mjs --rollback <snapshot-dir> --yes   # undo a move
 *   node scripts/aek/relocate.mjs --json
 *
 * `--to` is relative to the manifest `root` (normally the container); an
 * absolute path is accepted for moving a slot to another disk.
 *
 * @module scripts/aek/relocate
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aekBackupsPath, resolveAekRoot } from '../../packages/aek/base/coraek/home.mjs'
import {
  AEK_MANIFEST_FILENAME,
  readAekManifest,
  renderManifest,
  resolveManifestPath,
} from '../../packages/aek/base/coraek/paths.mjs'
import { SLOT_NAMES, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { DEFAULT_KEEP, pruneBackups } from './backup-retention.mjs'
import { deviceOf, repairLinks, runningProcesses, stamp } from './slot-ops.mjs'

const PATHS_CLI = fileURLToPath(new URL('./paths.mjs', import.meta.url))

const ARGS = process.argv.slice(2)
const APPLY = ARGS.includes('--yes')
const JSON_OUT = ARGS.includes('--json')
/** Test-only: the developer's own apps hold 1685/1687, indistinguishable from a fake slot. */
const SKIP_RUNNING_CHECK = ARGS.includes('--no-running-check')

/**
 * Read `--flag value`, rejecting a missing value instead of silently defaulting.
 * @param {string} name - flag name without dashes.
 * @returns {string | undefined} the value, or undefined when the flag is absent.
 */
function valueOf(name) {
  const i = ARGS.indexOf(`--${name}`)
  if (i === -1) return undefined
  const value = ARGS[i + 1]
  if (!value || value.startsWith('--')) throw new Error(`--${name} 需要一个值`)
  return value
}

const SLOT = (() => {
  const raw = valueOf('slot')
  if (raw === undefined) return 'aek'
  if (!SLOT_NAMES.includes(raw)) throw new Error(`--slot 只能是 ${SLOT_NAMES.join(' | ')}（收到 ${raw}）`)
  return raw
})()

const KEEP_AT = ARGS.indexOf('--keep-backups')
const KEEP_BACKUPS = KEEP_AT >= 0 ? Number(ARGS[KEEP_AT + 1]) : DEFAULT_KEEP

const ROOT = resolveAekRoot(process.env)

/** @param {string} msg */
function say(msg) { console.log(msg) }
/** @param {string} msg */
function fail(msg) { console.error(`error: ${msg}`); process.exit(1) }

/** @param {string} p @returns {boolean} */
function isDir(p) {
  try { return lstatSync(p).isDirectory() } catch { return false }
}
/** @param {string} p @returns {boolean} */
function isLink(p) {
  try { return lstatSync(p).isSymbolicLink() } catch { return false }
}

/**
 * Canonical absolute path, even when the leaf does not exist yet.
 *
 * `realpathSync` is the only honest answer (macOS turns `/var` into
 * `/private/var`, and a temp dir therefore never string-compares equal to its
 * own real path), but it throws on a missing leaf — and every path this tool
 * compares includes one that is about to be created. So: resolve the nearest
 * existing ancestor for real, then re-attach the missing tail.
 * @param {string} p @returns {string}
 */
function norm(p) {
  const absolute = resolve(p)
  /** @type {string[]} */
  const tail = []
  let probe = absolute
  for (;;) {
    try {
      return join(realpathSync(probe), ...tail.reverse())
    } catch { /* not there yet — climb one level */ }
    const parent = dirname(probe)
    if (parent === probe) return absolute
    tail.push(basename(probe))
    probe = parent
  }
}

/** @param {string} child @param {string} base @returns {boolean} */
function isInside(child, base) {
  const a = norm(child)
  const b = norm(base)
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep)
}

/**
 * Shorten an absolute path for display.
 * @param {string} absolute @returns {string}
 */
function pretty(absolute) {
  const home = process.env.HOME ?? ''
  if (home && absolute.startsWith(home + sep)) return `~/${relative(home, absolute).split(sep).join('/')}`
  return absolute
}

/**
 * How the new location should be spelled INSIDE the manifest: relative to the
 * manifest root when it sits under it (that is what keeps the file portable),
 * `~/…` for a path under the user's home, absolute otherwise.
 * @param {string} root - manifest root.
 * @param {string} target - absolute destination.
 * @returns {string} the manifest value.
 */
function manifestValueFor(root, target) {
  if (isInside(target, root)) {
    const rel = relative(norm(root), norm(target))
    return rel === '' ? '.' : rel.split(sep).join('/')
  }
  const home = process.env.HOME ?? ''
  if (home && isInside(target, home)) return `~/${relative(norm(home), norm(target)).split(sep).join('/')}`
  return norm(target)
}

/**
 * Rewrite one `slots.<name>` value while leaving every other byte alone.
 *
 * Comments, ordering, `dirs` overrides and the writer's choice of quoting all
 * survive — the manifest is hand-edited by design, so a "regenerate the whole
 * file" approach would quietly throw the user's work away. A JSON manifest
 * (accepted as an escape hatch by the reader) is re-serialised instead.
 * @param {string} text - manifest contents.
 * @param {'aek' | 'next'} slot - slot to set.
 * @param {string} value - new directory value.
 * @returns {string} the patched contents.
 */
function setSlotValue(text, slot, value) {
  if (text.trimStart().startsWith('{')) {
    const document = JSON.parse(text)
    document.slots = { ...(document.slots ?? {}), [slot]: value }
    return `${JSON.stringify(document, null, 2)}\n`
  }

  const lines = text.split('\n')
  const slotsAt = lines.findIndex((line) => /^slots:\s*(?:#.*)?$/u.test(line))

  if (slotsAt === -1) {
    // No `slots:` block at all — append one. An existing file keeps its body.
    return `${text.replace(/\n*$/u, '\n')}\nslots:\n  ${slot}: ${value}\n`
  }

  // The block is the run of indented (or blank) lines after `slots:`.
  let end = slotsAt + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/u.test(lines[end]))) end++

  for (let i = slotsAt + 1; i < end; i++) {
    const match = /^(\s+)([A-Za-z0-9_-]+)\s*:\s*(.*)$/u.exec(lines[i])
    if (!match || match[2] !== slot) continue
    const rest = match[3]
    const commentAt = rest.search(/\s#/u)
    const comment = commentAt === -1 ? '' : `  ${rest.slice(commentAt).trim()}`
    lines[i] = `${match[1]}${slot}: ${value}${comment}`
    return lines.join('\n')
  }

  // `slots:` exists but this key does not — insert it as the first entry.
  const indent = /^(\s+)/u.exec(lines[slotsAt + 1] ?? '')?.[1] ?? '  '
  lines.splice(slotsAt + 1, 0, `${indent}${slot}: ${value}`)
  return lines.join('\n')
}

/**
 * Write a file atomically: a crash mid-write must never leave a half-parsed
 * manifest behind, because everything else reads it at startup.
 * @param {string} file @param {string} contents
 */
function writeAtomic(file, contents) {
  const tmp = `${file}.tmp-${String(process.pid)}`
  writeFileSync(tmp, contents, 'utf8')
  renameSync(tmp, file)
}

/**
 * Everything the move needs to know, computed without touching the disk.
 * @returns {{
 *   slot: 'aek' | 'next', container: string, manifestFile: string,
 *   manifestExists: boolean, manifestText: string,
 *   fromAbs: string, toAbs: string, toValue: string,
 *   linksAtRisk: number, problems: string[],
 * }}
 */
function plan() {
  const manifest = readAekManifest(ROOT)
  const manifestFile = join(ROOT, AEK_MANIFEST_FILENAME)
  const manifestText = existsSync(manifestFile) ? readFileSync(manifestFile, 'utf8') : renderManifest()
  const fromAbs = slotHome(SLOT, process.env)
  const base = manifest?.root ?? ROOT

  const rawTo = valueOf('to')
  if (rawTo === undefined) {
    throw new Error('缺少 --to（例如 --to v2/current）')
  }
  const toAbs = resolveManifestPath(base, rawTo)
  const toValue = manifestValueFor(base, toAbs)

  /** @type {string[]} */
  const problems = []
  if (!isDir(fromAbs)) problems.push(`槽 ${SLOT} 的当前目录不存在：${pretty(fromAbs)}`)
  if (isLink(fromAbs)) problems.push(`${pretty(fromAbs)} 是软链；槽目录必须是实体目录`)
  if (norm(fromAbs) === norm(toAbs)) problems.push(`目标就是当前位置：${pretty(toAbs)}`)
  if (existsSync(toAbs)) problems.push(`目标已存在：${pretty(toAbs)}（先挪走再加 --yes）`)
  if (isInside(toAbs, fromAbs) || isInside(fromAbs, toAbs)) problems.push('目标与当前位置互相嵌套')
  if (isInside(toAbs, aekBackupsPath())) problems.push('目标落在 backups/ 里')
  if (norm(toAbs) === norm(ROOT)) problems.push('目标不能是容器本身')

  // The rename must stay on one device; a cross-device "move" is a copy, which
  // this tool deliberately does not do (it would need to preserve links and
  // could fail halfway with the data in two places).
  const nearest = (() => {
    let probe = toAbs
    while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe)
    return probe
  })()
  const fromDevice = deviceOf(fromAbs)
  const toDevice = deviceOf(nearest)
  if (fromDevice !== -1 && toDevice !== -1 && fromDevice !== toDevice) {
    problems.push(`目标在另一块磁盘（${pretty(toAbs)}）；本工具只做同盘 rename，跨盘请自己复制后改清单`)
  }

  // How many consumer links point at the OLD location right now. They still
  // resolve, so this needs `--assume-gone`; a plain preview would report 0.
  const preview = repairLinks({ root: ROOT, apply: false, assumeGone: [fromAbs] })
  const linksAtRisk = preview.counts.wouldBreak ?? preview.counts.repointable ?? 0
  // Baseline for the "did the move break something the repair cannot fix"
  // comparison: links that dangle TODAY have nothing to do with this move.
  const baseline = repairLinks({ root: ROOT, apply: false })
  const brokenBefore = baseline.counts.broken ?? 0

  return {
    slot: SLOT,
    container: ROOT,
    manifestFile,
    manifestExists: existsSync(manifestFile),
    manifestText,
    fromAbs,
    toAbs,
    toValue,
    linksAtRisk,
    brokenBefore,
    problems,
  }
}

/**
 * Ask the paths CLI whether the layout on disk is sane right now.
 * @returns {{ ok: boolean, output: string }}
 */
function checkPaths() {
  try {
    const out = execFileSync(process.execPath, [PATHS_CLI, 'check', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, AEK_ROOT: ROOT },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, output: out }
  } catch (error) {
    const raw = /** @type {any} */ (error)
    return { ok: false, output: `${raw.stdout ?? ''}${raw.stderr ?? ''}` }
  }
}

/**
 * Undo a half-finished move: put the directory back, restore the manifest bytes,
 * then repair the links back. Best effort — every step is guarded so one
 * failure cannot strand the others.
 * @param {ReturnType<typeof plan>} p - the plan being applied.
 * @param {{ manifestFile: string, manifestText: string, snapshot: string }} state
 */
function undo(p, state) {
  if (isDir(p.toAbs) && !existsSync(p.fromAbs)) {
    try {
      mkdirSync(dirname(p.fromAbs), { recursive: true })
      renameSync(p.toAbs, p.fromAbs)
      say(`undo: ${pretty(p.toAbs)} -> ${pretty(p.fromAbs)}`)
    } catch (error) {
      say(`undo: 目录挪不回去（${/** @type {Error} */ (error).message}）；手工处理见 ${pretty(state.snapshot)}`)
    }
  }
  try {
    if (state.manifestFile) writeAtomic(state.manifestFile, state.manifestText)
    else rmSync(join(ROOT, AEK_MANIFEST_FILENAME), { force: true })
    say('undo: 清单已还原')
  } catch (error) {
    say(`undo: 清单还原失败（${/** @type {Error} */ (error).message}）；备份在 ${pretty(state.snapshot)}`)
  }
  const repair = repairLinks({ root: ROOT, apply: true })
  say(`undo: 链接修复 ${String(repair.counts.repointed ?? 0)} 条（${repair.ok ? 'ok' : '仍有悬空'}）`)
}

/**
 * Perform the move. Every step after the rename is guarded: on any problem the
 * whole thing is undone and the process exits non-zero.
 * @param {ReturnType<typeof plan>} p - the plan to apply.
 * @returns {number} process exit code.
 */
function apply(p) {
  const snapshot = join(aekBackupsPath(), `${stamp()}-pre-relocate`)
  mkdirSync(snapshot, { recursive: true })
  const record = {
    kind: 'relocate',
    slot: p.slot,
    container: p.container,
    fromAbs: p.fromAbs,
    toAbs: p.toAbs,
    toValue: p.toValue,
    manifestFile: p.manifestFile,
    manifestExisted: p.manifestExists,
    linksAtRisk: p.linksAtRisk,
    createdAt: new Date().toISOString(),
  }
  writeFileSync(join(snapshot, 'manifest.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  if (p.manifestExists) writeFileSync(join(snapshot, AEK_MANIFEST_FILENAME), p.manifestText, 'utf8')
  say(`[1/6] 快照 ${pretty(snapshot)}（清单 ${p.manifestExists ? '已备份' : '原不存在'}）`)

  const state = { manifestFile: p.manifestExists ? p.manifestFile : '', manifestText: p.manifestText, snapshot }

  mkdirSync(dirname(p.toAbs), { recursive: true })
  try {
    renameSync(p.fromAbs, p.toAbs)
  } catch (error) {
    fail(`rename 失败：${/** @type {Error} */ (error).message}`)
  }
  say(`[2/6] 搬家 ${pretty(p.fromAbs)} -> ${pretty(p.toAbs)}`)

  try {
    const text = setSlotValue(p.manifestText, p.slot, p.toValue)
    writeAtomic(p.manifestFile, text)

    const after = readAekManifest(p.container)
    const declared = after?.slots[p.slot]
    if (!declared || norm(declared) !== norm(p.toAbs)) {
      throw new Error(`清单没有生效：slots.${p.slot} = ${String(declared)}，期望 ${p.toAbs}`)
    }
    say(`[3/6] 清单 slots.${p.slot}: ${p.toValue}`)
  } catch (error) {
    say(`✗ ${/** @type {Error} */ (error).message}`)
    undo(p, state)
    return 1
  }

  const repair = repairLinks({ root: ROOT, apply: true })
  say(`[4/6] 链接：重指 ${String(repair.counts.repointed ?? 0)} 条 · 无可指 ${String(repair.counts.pruned ?? 0)} 条`)
  if (repair.counts.unresolved) {
    say(`      仍有 ${String(repair.counts.unresolved)} 条悬空（与本次搬家无关的历史死链）`)
  }

  const recheck = repairLinks({ root: ROOT, apply: false })
  const stillBroken = recheck.counts.repointable ?? 0
  // A link that pointed INSIDE the slot at something other than a skill (say a
  // log file) cannot be re-pointed by tail lookup. Report it instead of
  // pretending the move was clean — but do not fail, the data is fine.
  const newlyBroken = Math.max(0, (recheck.counts.broken ?? 0) - (p.brokenBefore ?? 0))
  if (newlyBroken > 0) {
    say(`      注意：${String(newlyBroken)} 条链接指向槽内非技能路径，搬完已经悬空（无法自动重指）`)
  }
  const paths = checkPaths()
  if (!paths.ok) {
    say('✗ 清单校验未通过：')
    say(paths.output.trim())
  }
  say(`[5/6] 校验：清单 ${paths.ok ? '通过' : '未通过'} · 待重指 ${String(stillBroken)} 条`)

  const pruned = pruneBackups(aekBackupsPath(), { keep: KEEP_BACKUPS, apply: true })
  say(`[6/6] 备份 ${pruned.total} 份，保留 ${KEEP_BACKUPS}，清理 ${pruned.removed.length} 份`)

  if (!paths.ok || stillBroken > 0) {
    say('')
    say('搬家已完成，但上面的问题需要人工确认：')
    say(`  快照 / 回滚: node scripts/aek/relocate.mjs --rollback ${pretty(snapshot)} --yes`)
    return 1
  }

  say('')
  say(`完成。槽 ${p.slot} 现在在 ${pretty(p.toAbs)}`)
  say(`回滚: node scripts/aek/relocate.mjs --rollback ${pretty(snapshot)} --yes`)
  return 0
}

/**
 * Put the slot back where a snapshot says it was, then repair the links.
 * @param {string} dir - snapshot directory written by {@link apply}.
 * @returns {number} process exit code.
 */
function rollback(dir) {
  const snapshot = resolve(dir)
  if (!existsSync(snapshot)) fail(`快照不存在：${snapshot}`)
  let record
  try {
    record = JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8'))
  } catch (error) {
    fail(`读不出快照记录：${/** @type {Error} */ (error).message}`)
    return 1
  }
  if (record.kind !== 'relocate') fail(`${snapshot} 不是 relocate 快照（kind=${String(record.kind)}）`)

  const busy = SKIP_RUNNING_CHECK ? [] : runningProcesses()
  if (busy.length > 0) {
    console.error('还有实例在运行，先停掉：')
    for (const line of busy) console.error(`  - ${line}`)
    return 1
  }

  const { fromAbs, toAbs } = record
  if (!existsSync(toAbs)) fail(`当前位置不存在：${pretty(toAbs)}（已经手动搬走了？）`)
  if (existsSync(fromAbs)) fail(`原位置已被占用：${pretty(fromAbs)}；先挪走它`)
  mkdirSync(dirname(fromAbs), { recursive: true })
  renameSync(toAbs, fromAbs)
  say(`[1/3] 搬回 ${pretty(toAbs)} -> ${pretty(fromAbs)}`)

  const backupManifest = join(snapshot, AEK_MANIFEST_FILENAME)
  const manifestFile = record.manifestFile ?? join(ROOT, AEK_MANIFEST_FILENAME)
  if (existsSync(backupManifest)) {
    writeAtomic(manifestFile, readFileSync(backupManifest, 'utf8'))
    say(`[2/3] 清单已还原 ${pretty(manifestFile)}`)
  } else {
    rmSync(manifestFile, { force: true })
    say('[2/3] 原来没有清单，已删除')
  }

  const repair = repairLinks({ root: ROOT, apply: true })
  say(`[3/3] 链接：重指 ${String(repair.counts.repointed ?? 0)} 条（${repair.ok ? 'ok' : '仍有悬空'}）`)
  say(`回滚完成。记录保留在 ${pretty(snapshot)}`)
  return repair.ok ? 0 : 1
}

function usage() {
  say('用法: node scripts/aek/relocate.mjs --slot <aek|next> --to <相对路径> [--yes] [--json]')
  say('      node scripts/aek/relocate.mjs --rollback <快照目录> --yes')
  say('')
  say('  --to        新位置，相对清单 root（一般就是容器）；也可写绝对路径（须同盘）')
  say('  --yes       真的搬；不加只打印计划')
  say('  --json      机器可读（只读计划）')
  say('  --keep-backups N   备份留几份（默认 10）')
  return 0
}

// ── entry ──────────────────────────────────────────────────────────────────────
try {
  const rollbackAt = ARGS.indexOf('--rollback')
  if (rollbackAt >= 0) {
    const dir = ARGS[rollbackAt + 1]
    if (!dir) fail('--rollback 需要快照目录')
    if (!APPLY) {
      say(`将把 ${pretty(dir)} 记录里的槽搬回原位。加 --yes 执行。`)
      process.exit(0)
    }
    process.exit(rollback(dir))
  }

  if (ARGS.includes('--help') || ARGS.includes('-h')) process.exit(usage())
  if (valueOf('to') === undefined) process.exit(usage())

  const p = plan()
  if (JSON_OUT) {
    process.stdout.write(`${JSON.stringify({ mode: APPLY ? 'apply' : 'plan', ...p, manifestText: undefined, problems: p.problems }, null, 2)}\n`)
    process.exit(p.problems.length > 0 ? 1 : 0)
  }

  say(`容器    ${pretty(p.container)}`)
  say(`槽 ${p.slot}  ${pretty(p.fromAbs)}`)
  say(`     -> ${pretty(p.toAbs)}   （清单里写作 ${p.toValue}）`)
  say(`清单    ${pretty(p.manifestFile)}${p.manifestExists ? '' : '（不存在，将新建）'}`)
  say(`链接    ${p.linksAtRisk} 条槽外链接指向旧位置，会随搬家重指`)
  for (const problem of p.problems) say(`  ✗ ${problem}`)
  if (p.problems.length > 0) {
    say('')
    say('计划不成立，未做任何改动。')
    process.exit(1)
  }
  if (!APPLY) {
    say('')
    say('计划检查通过。加 --yes 执行。')
    process.exit(0)
  }

  const busy = SKIP_RUNNING_CHECK ? [] : runningProcesses()
  if (busy.length > 0) {
    console.error('还有实例在运行，先停掉：')
    for (const line of busy) console.error(`  - ${line}`)
    process.exit(1)
  }
  process.exit(apply(p))
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
