#!/usr/bin/env node
/**
 * Link report — every symlink that touches a slot, classified.
 *
 * The AEK data roots are full of symlinks and they are NOT one thing. A link
 * can point inside its own slot (a generated collection view, an Electron
 * framework alias), into the sibling slot, into this source checkout (a dsh
 * profile's `node_modules/@cheezmil/*`), into $HOME (another agent's skills
 * dir consuming our hub), or nowhere at all. Copying a data root between slots
 * without knowing which is which silently produces dangling links — or links
 * that resolve into the OTHER slot, welding the two together.
 *
 * Two populations are reported, because they need opposite treatment:
 *   1. links INSIDE a slot — they travel with the tree and must be recomputed
 *      against their new location;
 *   2. links OUTSIDE the slots that point INTO one (~/.claude/skills/... →
 *      ~/.aek/current/skill-manager/skills/...) — they never travel, but they
 *      are the consumers that break (or silently keep reading the old slot)
 *      when content is promoted from next to current.
 *
 * This tool never writes. Paths come from `@cheezmil/coraek/slots`, never from
 * a literal `~/.aek`.
 *
 * Usage:
 *   node scripts/aek/link-report.mjs                # report, read-only
 *   node scripts/aek/link-report.mjs --json         # machine-readable
 *   node scripts/aek/link-report.mjs --slot next    # one slot only
 *   node scripts/aek/link-report.mjs --no-external  # skip the $HOME scan
 *   node scripts/aek/link-report.mjs --stale-only   # only "manifest moved, links didn't"
 *   node scripts/aek/link-report.mjs --verbose      # list every link
 *
 * @module scripts/aek/link-report
 */
import { existsSync, readdirSync, readlinkSync, realpathSync, writeSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolveAekRoot } from '../../packages/aek/base/coraek/home.mjs'
import { SLOT_NAMES, slotHome } from '../../packages/aek/base/coraek/slots.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const VERBOSE = argv.includes('--verbose')
const SKIP_EXTERNAL = argv.includes('--no-external')
const STALE_ONLY = argv.includes('--stale-only')
const SLOT_FILTER = (() => {
  const i = argv.indexOf('--slot')
  if (i === -1) return null
  const value = argv[i + 1]
  if (!SLOT_NAMES.includes(value)) {
    throw new Error(`--slot must be one of ${SLOT_NAMES.join(' | ')} (got ${String(value)})`)
  }
  return value
})()

/** Walk up from this script to the workspace root (pnpm-workspace.yaml). */
function findSourceRoot(start) {
  let dir = start
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const SOURCE_ROOT = findSourceRoot(HERE) ? realpathSync(findSourceRoot(HERE)) : null
const ROOTS = Object.fromEntries(SLOT_NAMES.map(slot => [slot, slotHome(slot)]))
const CONTAINER = resolveAekRoot(process.env)

/** @param {string} child @param {string} base @returns {boolean} */
function isInside(child, base) {
  if (!base) return false
  return child === base || child.startsWith(base.endsWith(sep) ? base : base + sep)
}

/** @param {string} file @param {string} [base] @returns {{ raw: string, abs: string, real: string | null }} */
function readLink(file, base = dirname(file)) {
  const raw = readlinkSync(file)
  const abs = isAbsolute(raw) ? resolve(raw) : resolve(base, raw)
  let real = null
  try {
    real = realpathSync(abs)
  } catch {
    real = null
  }
  return { raw, abs, real }
}

/**
 * Read every symlink under a root without following links or descending into
 * them (a `Dirent` for a symlink is never `isDirectory()`).
 * @param {string} root - absolute slot root.
 * @returns {{ rel: string, raw: string, abs: string, real: string | null }[]} the links.
 */
function collectLinks(root) {
  const found = []
  if (!existsSync(root)) return found
  const walk = dir => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        found.push({ rel: relative(root, full), ...readLink(full) })
      } else if (entry.isDirectory() && entry.name !== '.git') {
        walk(full)
      }
    }
  }
  walk(root)
  return found
}

/**
 * Classify a link target relative to the slots and the source checkout.
 * @param {{ abs: string, real: string | null }} link - one link.
 * @param {string} self - the slot root the link lives in.
 * @param {string} other - the sibling slot root.
 * @returns {'internal' | 'cross-slot' | 'source' | 'external' | 'broken'} the kind.
 */
function classify(link, self, other) {
  if (link.real === null) return 'broken'
  const target = link.real
  if (isInside(target, self)) return 'internal'
  if (isInside(target, other)) return 'cross-slot'
  if (isInside(target, SOURCE_ROOT)) return 'source'
  return 'external'
}

const KIND_NOTE = {
  internal: '目标在本槽内：随树搬迁，落点不变即自洽',
  'cross-slot': '目标在另一个槽：绝不能原样拷，会把两个槽焊死',
  source: '目标在源码 checkout：相对链接按槽内深度解析，可直接沿用',
  external: '目标在 $HOME 别处：搬槽不影响它',
  broken: '目标不存在：搬迁时应丢弃，不能带过去',
}

/**
 * Sort a broken link into why it is broken — the three causes need different
 * treatment: build output regenerates, Chromium singleton files are never real
 * paths, and a retired snapshot is just history.
 * @param {string} rel - path inside the slot.
 * @returns {'node_modules' | 'chromium-lock' | 'stale-snapshot' | 'other'} the bucket.
 */
function brokenBucket(rel) {
  if (rel.includes(`${sep}node_modules${sep}`) || rel.endsWith(`${sep}node_modules`)) return 'node_modules'
  if (/Singleton(Cookie|Lock|Socket)$/u.test(rel)) return 'chromium-lock'
  if (rel.includes(`${sep}.skills${sep}`) || rel.includes(`${sep}record${sep}`)) return 'stale-snapshot'
  return 'other'
}

const rows = []
for (const slot of STALE_ONLY ? [] : SLOT_FILTER ? [SLOT_FILTER] : SLOT_NAMES) {
  const self = ROOTS[slot]
  const other = ROOTS[slot === 'aek' ? 'next' : 'aek']
  for (const link of collectLinks(self)) {
    const kind = classify(link, self, other)
    rows.push({
      slot,
      rel: link.rel,
      raw: link.raw,
      abs: link.abs,
      kind,
      bucket: kind === 'broken' ? brokenBucket(link.rel) : null,
      absolute: isAbsolute(link.raw),
    })
  }
}

/**
 * Links OUTSIDE both slots whose target lands inside one. These are the
 * consumers (other agents' skill dirs); they never move with a copy, but a
 * promote changes what they see.
 * @returns {{ file: string, raw: string, abs: string, to: 'current' | 'next' | 'dead' }[]} the consumer links.
 */
function externalConsumers() {
  const home = homedir()
  const out = []
  const SKIP = new Set([
    'Library', 'Applications', 'Movies', 'Music', 'Pictures', 'Downloads',
    'node_modules', '.git', '.Trash', '.cache', '.npm', '.pnpm-store',
  ])
  const slots = [['current', ROOTS.aek], ['next', ROOTS.next]]
  const walk = (dir, depth) => {
    if (depth > 3) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        const link = readLink(full)
        const hit = slots.find(([, root]) => isInside(link.abs, root))
        if (!hit) {
          // A link that still spells the CONTAINER but matches neither slot is
          // the signature of "aek.yaml moved the slot, the links did not
          // follow" — the failure nobody notices until the app starts empty.
          if (isInside(link.abs, CONTAINER)) {
            out.push({ file: relative(home, full), raw: link.raw, abs: link.abs, absolute: isAbsolute(link.raw), to: 'dead' })
          }
          continue
        }
        out.push({
          file: relative(home, full),
          raw: link.raw,
          abs: link.abs,
          absolute: isAbsolute(link.raw),
          to: link.real === null ? 'dead' : /** @type {'current' | 'next'} */ (hit[0]),
        })
      } else if (entry.isDirectory() && !SKIP.has(entry.name)) {
        if (depth === 0 && !entry.name.startsWith('.') && entry.name !== 'MyDurio') continue
        walk(full, depth + 1)
      }
    }
  }
  walk(home, 0)
  return out
}

const consumers = SKIP_EXTERNAL ? [] : externalConsumers()
// Three populations, three fixes: a `dead` consumer that names a slot directory
// is repaired by tail lookup; one that names a *vanished* container path means
// the manifest relocated the slot (`relocate.mjs` fixes it, the tail lookup
// cannot); anything else is somebody's unrelated dead link.
const stale = consumers.filter(c => !SLOT_NAMES.some(slot => isInside(c.abs, ROOTS[slot])) && isInside(c.abs, CONTAINER))
const deadInSlot = consumers.filter(c => c.to === 'dead' && SLOT_NAMES.some(slot => isInside(c.abs, ROOTS[slot])))
// Same relative path in both slots: an IDENTICAL raw target means the copy is
// behaviour-preserving (both parse to the same relative location, since the
// slots sit at the same depth). A differing raw string was generated per slot
// and must be rewritten after a copy.
const byRel = new Map()
for (const row of rows) {
  if (!byRel.has(row.rel)) byRel.set(row.rel, {})
  byRel.get(row.rel)[row.slot] = row
}
const identical = []
const differing = []
for (const [rel, slots] of byRel) {
  if (!slots.aek || !slots.next) continue
  ;(slots.aek.raw === slots.next.raw ? identical : differing).push({ rel, aek: slots.aek.raw, next: slots.next.raw })
}

const summary = {}
for (const row of rows) {
  summary[row.slot] ??= { total: 0, kinds: {}, buckets: {}, absolute: 0, relative: 0 }
  const s = summary[row.slot]
  s.total++
  s.kinds[row.kind] = (s.kinds[row.kind] ?? 0) + 1
  if (row.bucket) s.buckets[row.bucket] = (s.buckets[row.bucket] ?? 0) + 1
  s[row.absolute ? 'absolute' : 'relative']++
}

if (JSON_OUT) {
  // `writeSync(1, …)`: a piped stdout is async, and `process.exit()` right
  // after a `write()` truncates the JSON mid-string.
  writeSync(1, JSON.stringify({
    sourceRoot: SOURCE_ROOT, container: CONTAINER, roots: ROOTS, summary, identical, differing,
    consumers, stale, deadInSlot, links: rows,
  }, null, 2))
  process.exit(0)
}

const label = slot => (slot === 'aek' ? 'current' : 'next')
const sample = (list, limit) => (VERBOSE ? list : list.slice(0, limit))

if (STALE_ONLY) {
  // Cheap mode for the launcher: only asks "did the manifest move without the
  // links following". Prints one line when clean, the fix when not.
  if (stale.length === 0) {
    console.log(`links: 正常（0 条链接指向已不存在的槽位置）`)
  } else {
    console.log(`links: ${stale.length} 条槽外链接指向 ${CONTAINER} 下已不存在的路径`)
    for (const item of sample(stale, 5)) console.log(`  ${item.file} → ${item.raw}`)
    console.log('  修法: node scripts/aek/repair-skill-links.mjs --yes')
    console.log('  （若刚手改过 aek.yaml 挪槽，用 relocate.mjs 一次做完搬家 + 改清单 + 修链接）')
  }
  process.exit(stale.length === 0 ? 0 : 1)
}

console.log(`源码 checkout: ${SOURCE_ROOT ?? '(未找到 pnpm-workspace.yaml)'}`)
for (const slot of SLOT_NAMES) console.log(`  ${label(slot)} → ${ROOTS[slot]}`)

console.log('\n── 槽内链接 ──')
for (const [slot, info] of Object.entries(summary)) {
  console.log(`${label(slot).padEnd(8)} 共 ${String(info.total).padStart(4)} 条（相对 ${info.relative} / 绝对 ${info.absolute}）`)
  const kinds = Object.entries(info.kinds).sort((a, b) => b[1] - a[1])
  console.log(`         ${kinds.map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}`)
  const buckets = Object.entries(info.buckets).sort((a, b) => b[1] - a[1])
  if (buckets.length > 0) console.log(`         断链构成：${buckets.map(([k, v]) => `${k} ${v}`).join(' · ')}`)
}

for (const kind of ['cross-slot', 'broken', 'internal', 'source', 'external']) {
  const list = rows.filter(row => row.kind === kind)
  if (list.length === 0) continue
  console.log(`\n── ${kind} (${list.length}) ── ${KIND_NOTE[kind]}`)
  for (const row of sample(list, 6)) {
    console.log(`  [${label(row.slot)}] ${row.rel}`)
    console.log(`      → ${row.raw}`)
  }
  if (list.length > 6 && !VERBOSE) console.log(`  … 其余 ${list.length - 6} 条（--verbose 全列）`)
}

console.log('\n── 两槽同名链接 ──')
console.log(`  raw 完全一致（拷贝后行为不变）: ${identical.length}`)
console.log(`  raw 不同（拷贝后必须重写）: ${differing.length}`)
for (const item of sample(differing, 4)) {
  console.log(`  ${item.rel}`)
  console.log(`      current → ${item.aek}`)
  console.log(`      next    → ${item.next}`)
}

if (!SKIP_EXTERNAL) {
  const toCurrent = consumers.filter(c => c.to === 'current').length
  const toNext = consumers.filter(c => c.to === 'next').length
  console.log('\n── 槽外消费者链接（~/.claude/skills 等指向槽内）──')
  console.log(`  指向 current: ${toCurrent} · 指向 next: ${toNext} · 已失效: ${deadInSlot.length} · 指向已搬走的位置: ${stale.length}`)
  const absCount = consumers.filter(c => c.absolute).length
  console.log(`  raw 形态：相对 ${consumers.length - absCount} / 绝对 ${absCount}`)
  const byDir = new Map()
  for (const c of consumers) {
    const top = c.file.split(sep)[0]
    byDir.set(top, (byDir.get(top) ?? 0) + 1)
  }
  console.log(`  来源目录：${[...byDir.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  const shape = consumers[0]?.raw ?? '—'
  console.log(`  样例 raw: ${shape}`)
  for (const item of sample(consumers, 8)) console.log(`  ${item.file} → ${item.to}`)
  if (consumers.length > 8 && !VERBOSE) console.log(`  … 其余 ${consumers.length - 8} 条（--verbose 全列）`)
  if (stale.length > 0) {
    console.log(`\n  ⚠ ${stale.length} 条指向 ${CONTAINER} 下已不存在的路径 —— 清单把槽挪过，链接没跟上：`)
    for (const item of sample(stale, 5)) console.log(`    ${item.file} → ${item.raw}`)
    console.log('    修法: node scripts/aek/repair-skill-links.mjs --yes')
  }
}

const crossSlot = rows.filter(row => row.kind === 'cross-slot').length
const realBroken = rows.filter(row => row.kind === 'broken' && row.bucket === 'other').length
console.log(
  `\n结论：跨槽链接 ${crossSlot} 条${crossSlot === 0 ? '（两槽未互相焊死）' : '（危险，拷贝前必须处理）'}；` +
    `有意义的断链 ${realBroken} 条（其余断链是构建产物 / Chromium 锁 / 历史快照，属垃圾）；` +
    `槽外指向已搬走位置的 ${stale.length} 条。`,
)

// `--assert` turns the report into a gate: a cross-slot link means the two data
// roots are welded together, a meaningful dangling link means something points
// at a path that no longer exists, and a stale consumer link means the manifest
// moved a slot without the links following. All three must be zero.
if (argv.includes('--assert')) {
  if (crossSlot > 0 || realBroken > 0 || stale.length > 0) {
    console.error(`[link-report] FAIL: cross-slot ${crossSlot} · dangling ${realBroken} · stale ${stale.length}`)
    process.exitCode = 1
  } else {
    console.log('[link-report] PASS: 0 跨槽 · 0 有意义断链 · 0 过期链接')
  }
}
