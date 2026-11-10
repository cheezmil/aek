#!/usr/bin/env node
/**
 * Repair skill symlinks whose target no longer resolves, by re-pointing them at
 * the same skill in the CURRENT hub.
 *
 * Why this exists: every agent runtime dir (`~/.claude/skills`, `~/.qoder/skills`,
 * `~/.chatbox/skills`, …) holds a *relative* link into the AEK skill hub, e.g.
 *
 *   ../../.aek/current/skill-manager/skills/aek-websearch
 *
 * A relative link is computed once, when it is written. It keeps working while
 * the hub stays put, and breaks the moment the hub moves — either because the
 * container layout changed (`~/.aek/skill-manager` → `~/.aek/current/skill-manager`,
 * the migration that motivated this script) or because `aek.yaml` relocated a
 * slot (`current/` → `v2/current/`). The links cannot follow automatically:
 * from outside the container they have to spell every level out.
 *
 * The mapping is therefore done by TAIL, not by prefix. Whatever a dangling
 * link points at, the part after the hub folder name (`skill-manager/skills/x`
 * → `skills/x`) identifies the skill; that tail is looked up in each hub that
 * exists right now, and the link is rewritten to a fresh relative path. This is
 * what makes one script handle both the container migration and any later
 * manifest relocation, without knowing which one happened.
 *
 * A dangling link whose tail exists in no hub means the skill itself is gone
 * (retired `aek-task-manager` / `aekb` / …). Those can only be pruned, never
 * re-pointed — `--prune` removes the link (a dangling link holds no data; the
 * list is written to a manifest first so nothing is silently lost).
 *
 * Default is a read-only preview.
 *
 * Usage:
 *   node scripts/aek/repair-skill-links.mjs                  # preview
 *   node scripts/aek/repair-skill-links.mjs --yes            # rewrite
 *   node scripts/aek/repair-skill-links.mjs --yes --prune    # also drop dead links
 *   node scripts/aek/repair-skill-links.mjs --json           # machine-readable
 *   node scripts/aek/repair-skill-links.mjs --home <dir>     # scan another HOME (tests)
 *   node scripts/aek/repair-skill-links.mjs --assume-gone <dir>
 *       Treat every link resolving under <dir> as broken, even though it still
 *       resolves. Used by the migration's dry run: the flat hub is about to be
 *       moved, so the links that point at it are already doomed and the plan
 *       has to report how many will be re-pointed.
 */
import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { slotHome } from '../../packages/aek/base/coraek/slots.mjs'

const ARGS = process.argv.slice(2)
const APPLY = ARGS.includes('--yes')
const PRUNE = ARGS.includes('--prune')
const JSON_OUT = ARGS.includes('--json')
const HOME_AT = ARGS.indexOf('--home')
const HOME = HOME_AT >= 0 && ARGS[HOME_AT + 1] ? resolve(ARGS[HOME_AT + 1]) : homedir()

/**
 * Directories whose targets must be treated as already gone. Repeatable; each
 * value is a prefix. Only the dry run uses it — see the module comment.
 * @type {string[]}
 */
const ASSUME_GONE = ARGS.reduce((acc, arg, index) => {
  if (arg !== '--assume-gone') return acc
  const value = ARGS[index + 1]
  if (value) acc.push(resolve(value) + sep)
  return acc
}, /** @type {string[]} */ ([]))

/**
 * Normalize a path for prefix comparison: `realpath` when the path exists, the
 * plain absolute path otherwise. macOS resolves `/var` to `/private/var`, and a
 * raw prefix compare across that boundary silently matches nothing.
 * @param {string} p @returns {string}
 */
function canonical(p) {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

/** Resolved `ASSUME_GONE` prefixes, canonical form, with a trailing separator. */
const GONE_PREFIXES = ASSUME_GONE.map(prefix => `${canonical(prefix.slice(0, -1))}${sep}`)

/**
 * Is this absolute target inside a directory the caller declared gone?
 * @param {string} absolute - resolved link target.
 * @returns {boolean}
 */
function assumedGone(absolute) {
  if (GONE_PREFIXES.length === 0) return false
  const real = canonical(absolute)
  return GONE_PREFIXES.some(prefix => real.startsWith(prefix) || absolute.startsWith(prefix))
}

/** Both slots keep an independent hub; repair each pool of links. */
const HUBS = [join(slotHome('aek'), 'skill-manager'), join(slotHome('next'), 'skill-manager')].filter(
  (hub, index, all) => all.indexOf(hub) === index,
)

/**
 * Directory names that can appear in a link target as "the hub". Derived from
 * the hubs themselves, so a manifest rename of `skill-manager` keeps working.
 */
const HUB_MARKERS = [...new Set(HUBS.map(hub => `${sep}${basename(hub)}${sep}`))]

/** Directories worth scanning: every `<dir>/skills` under $HOME, 4 levels deep. */
function skillDirs() {
  const found = new Set()
  const walk = (dir, depth) => {
    if (depth > 3) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.name === 'skills') found.add(full)
      walk(full, depth + 1)
    }
  }
  walk(HOME, 0)
  // The hub's own generated views also carry links.
  for (const hub of HUBS) found.add(join(hub, 'collections'))
  return [...found]
}

/** @returns {string[]} absolute paths of every symlink under `dir` (one or two levels). */
function linksUnder(dir) {
  const links = []
  const walk = (current, depth) => {
    if (depth > 2) return
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      let stat
      try {
        stat = lstatSync(full)
      } catch {
        continue
      }
      if (stat.isSymbolicLink()) links.push(full)
      else if (stat.isDirectory() && depth < 2) walk(full, depth + 1)
    }
  }
  walk(dir, 0)
  return links
}

/**
 * The part of a hub target that identifies the skill, e.g. `skills/aek-websearch`.
 *
 * Prefix-independent on purpose: after `current/` becomes `v2/current/`, or the
 * pre-container `~/.aek/skill-manager` becomes `~/.aek/current/skill-manager`,
 * the prefix is wrong but the tail still names a real skill.
 * @param {string} absolute - an absolute link target.
 * @returns {string | null} the tail, or null when the target is not inside a hub at all.
 */
function hubTail(absolute) {
  let best = null
  for (const marker of HUB_MARKERS) {
    const at = absolute.lastIndexOf(marker)
    if (at < 0) continue
    const tail = absolute.slice(at + marker.length)
    if (tail === '' || tail.includes('..')) continue
    if (best === null || at > best.at) best = { at, tail }
  }
  return best === null ? null : best.tail
}

/**
 * Hubs to try for one link, most plausible first: a target that used to name
 * the next slot's directory should stay in the next slot. The slot folder name
 * (`next` / `current`) is what tells them apart — the hub folder name is the
 * same in both (`skill-manager`).
 * @param {string} absolute - the dangling target.
 * @returns {string[]} hub roots, preferred first.
 */
function hubsFor(absolute) {
  const [aekHub, nextHub] = HUBS
  if (!nextHub || !aekHub) return HUBS
  const nextSlotDir = basename(dirname(nextHub))
  const mentionsNext = absolute.includes(`${sep}${nextSlotDir}${sep}`)
  return mentionsNext ? [nextHub, aekHub] : [aekHub, nextHub]
}

/**
 * Map a dangling link onto a live hub.
 * @param {string} linkPath - the symlink itself.
 * @returns {{ target: string | null, inHub: boolean }} the live target (null when
 *   the skill no longer exists anywhere) and whether the link belongs to a hub.
 */
function remap(linkPath) {
  const raw = readlinkSync(linkPath)
  const absolute = resolve(dirname(linkPath), raw)
  const tail = hubTail(absolute)
  if (tail === null) return { target: null, inHub: false }
  for (const hub of hubsFor(absolute)) {
    const candidate = join(hub, tail)
    if (existsSync(candidate)) return { target: candidate, inHub: true }
  }
  return { target: null, inHub: true }
}

function main() {
  const broken = []
  const fixed = []
  const prunable = []
  const unresolved = []
  let wouldBreak = 0

  for (const dir of skillDirs()) {
    for (const link of linksUnder(dir)) {
      const raw = readlinkSync(link)
      const absolute = resolve(dirname(link), raw)
      // A link that still resolves can be *about* to break: the dry run is told
      // which directory is going away, and counts those separately so the plan
      // can report them without pretending they are already broken.
      const doomed = assumedGone(absolute)
      if (doomed) wouldBreak++
      if (!doomed && existsSync(link)) continue
      broken.push(link)
      const { target, inHub } = remap(link)
      if (target) {
        fixed.push({ link, target })
        continue
      }
      // A dangling link that named a hub entry means the skill itself is gone;
      // the same is true for a runtime link pointing at an old hub entry.
      if (inHub) prunable.push(link)
      else unresolved.push(link)
    }
  }

  /** @type {{ link: string, target: string }[]} */
  const written = []
  for (const item of fixed) {
    if (!APPLY) continue
    const next = relative(dirname(item.link), item.target)
    unlinkSync(item.link)
    symlinkSync(next, item.link)
    written.push(item)
  }

  /** @type {string[]} */
  const pruned = []
  if (APPLY && PRUNE && prunable.length > 0) {
    const manifest = join(slotHome('aek'), 'logs', `pruned-skill-links-${Date.now()}.txt`)
    try {
      writeFileSync(manifest, prunable.map((l) => `${l} -> ${readlinkSync(l)}`).join('\n') + '\n')
    } catch (error) {
      process.stderr.write(`  清单写入失败（继续剪除）：${error instanceof Error ? error.message : String(error)}\n`)
    }
    for (const link of prunable) {
      unlinkSync(link)
      pruned.push(link)
    }
  }

  const stillBroken = written.filter((item) => {
    try {
      realpathSync(item.link)
      return false
    } catch {
      return true
    }
  })

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({
      mode: APPLY ? 'apply' : 'preview',
      prune: PRUNE,
      home: HOME,
      hubs: HUBS,
      assumeGone: ASSUME_GONE,
      counts: {
        broken: broken.length,
        wouldBreak,
        repointable: fixed.length,
        repointed: written.length,
        prunable: prunable.length,
        pruned: pruned.length,
        unresolved: unresolved.length,
        stillBroken: stillBroken.length,
      },
      fixed,
      prunable,
      unresolved,
    }, null, 2))
    if (stillBroken.length > 0) process.exitCode = 1
    return
  }

  console.log(`模式：${APPLY ? '执行 (--yes)' : '预览（不改动，加 --yes 执行）'}${PRUNE ? ' + prune' : ''}`)
  console.log(`扫描 HOME：${HOME}`)
  console.log(`hub：${HUBS.join(' , ')}`)
  console.log(
    `失效链接 ${broken.length} 个：可重指 ${fixed.length}，可剪除 ${prunable.length}，外部无关 ${unresolved.length}`,
  )
  for (const item of fixed) {
    console.log(`  ${APPLY ? '+' : '~'} ${item.link} -> ${relative(dirname(item.link), item.target)}`)
  }
  if (prunable.length > 0) {
    console.log(`\n${PRUNE ? '剪除' : '可剪除（加 --prune 执行）'}的技能已不存在于 hub：`)
    for (const link of prunable) console.log(`  - ${link} -> ${readlinkSync(link)}`)
  }
  for (const link of unresolved) {
    console.log(`  ! ${link} -> ${readlinkSync(link)}（与 hub 无关，跳过）`)
  }
  if (!APPLY && (fixed.length > 0 || (PRUNE && prunable.length > 0))) {
    console.log('\n预览结束。确认无误后加 --yes 执行。')
  }
  if (APPLY && fixed.length > 0) {
    console.log(`\n复检：${fixed.length - stillBroken.length}/${fixed.length} 已恢复可解析`)
    if (stillBroken.length > 0) process.exitCode = 1
  }
}

main()
