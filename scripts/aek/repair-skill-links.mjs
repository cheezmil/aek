#!/usr/bin/env node
/**
 * Repair skill symlinks that still point at the pre-container data root.
 *
 * Before the container layout the skill hub lived at `~/.aek/skill-manager`.
 * It now lives at `<AEK_HOME>/skill-manager` (`~/.aek/current/skill-manager`).
 * Every agent runtime dir (`~/.claude/skills`, `~/.qoder/skills`, …) still holds
 * symlinks like
 *
 *   ../../.aek/skill-manager/skills/aek-websearch     (dangling)
 *
 * so other agents see no skills at all. This script rewrites each dangling
 * link to the same relative shape under the new hub, but only when the mapped
 * target actually exists — a link whose skill was deleted is left alone and
 * reported.
 *
 * Default is a read-only preview. Pass `--yes` to rewrite.
 *
 * Some links point at skills that no longer exist in the hub at all (the
 * retired `aek-task-manager` / `aekb` / `aek-install-and-init` entries). Those
 * can only be pruned, never re-pointed — `--prune` removes the dangling link
 * itself (a dangling link holds no data; the list is written to a manifest
 * first so nothing is silently lost).
 *
 * Usage:
 *   node scripts/aek/repair-skill-links.mjs
 *   node scripts/aek/repair-skill-links.mjs --yes
 *   node scripts/aek/repair-skill-links.mjs --yes --prune
 */
import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { AEK_HOME_DIRNAME } from '../../packages/aek/base/coraek/home.mjs'
import { homedir } from 'node:os'

const APPLY = process.argv.includes('--yes')
const PRUNE = process.argv.includes('--prune')
const HOME = homedir()
const OLD_HUB = join(HOME, AEK_HOME_DIRNAME, 'skill-manager') // pre-container hub
// Both slots keep an independent hub; repair each one's own links.
const NEW_HUBS = [join(slotHome('aek'), 'skill-manager'), join(slotHome('next'), 'skill-manager')]

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
  for (const hub of NEW_HUBS) found.add(join(hub, 'collections'))
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
 * Map a dangling link's old destination onto the current hub.
 * @param {string} linkPath - the symlink itself.
 * @returns {{ target: string | null, inHub: boolean }} mapped path (null when the
 *   skill no longer exists) plus whether the link belongs to the hub at all.
 */
function remap(linkPath) {
  const raw = readlinkSync(linkPath)
  const absolute = resolve(dirname(linkPath), raw)
  // Link target may still be the pre-container hub, or the current one (a hub
  // entry whose own target vanished).
  const legacyPrefix = OLD_HUB + sep
  const currentPrefix = NEW_HUBS.map((hub) => hub + sep).find((prefix) => absolute.startsWith(prefix)) ?? null
  if (absolute.startsWith(legacyPrefix)) {
    const mapped = join(NEW_HUBS[0], absolute.slice(legacyPrefix.length))
    return { target: existsSync(mapped) ? mapped : null, inHub: true }
  }
  if (currentPrefix) return { target: null, inHub: true }
  return { target: null, inHub: false }
}

function main() {
  const broken = []
  const fixed = []
  const prunable = []
  const unresolved = []

  for (const dir of skillDirs()) {
    for (const link of linksUnder(dir)) {
      if (existsSync(link)) continue
      broken.push(link)
      const { target, inHub } = remap(link)
      if (target) {
        fixed.push({ link, target })
        continue
      }
      // A dangling link inside the hub means the skill itself is gone; the same
      // is true for a runtime link pointing at an old hub entry. Both are prunable.
      if (inHub) prunable.push(link)
      else unresolved.push(link)
    }
  }

  console.log(`模式：${APPLY ? '执行 (--yes)' : '预览（不改动，加 --yes 执行）'}${PRUNE ? ' + prune' : ''}`)
  console.log(`旧 hub：${OLD_HUB}`)
  console.log(`新 hub：${NEW_HUBS.join(' , ')}`)
  console.log(
    `失效链接 ${broken.length} 个：可重指 ${fixed.length}，可剪除 ${prunable.length}，外部无关 ${unresolved.length}`,
  )
  for (const item of fixed) {
    console.log(`  ${APPLY ? '+' : '~'} ${item.link} -> ${relative(dirname(item.link), item.target)}`)
    if (!APPLY) continue
    unlinkSync(item.link)
    symlinkSync(relative(dirname(item.link), item.target), item.link)
  }
  if (prunable.length > 0) {
    console.log(`\n${PRUNE ? '剪除' : '可剪除（加 --prune 执行）'}的技能已不存在于 hub：`)
    for (const link of prunable) console.log(`  - ${link} -> ${readlinkSync(link)}`)
    if (APPLY && PRUNE) {
      const manifest = join(slotHome('aek'), 'logs', `pruned-skill-links-${Date.now()}.txt`)
      try {
        writeFileSync(manifest, prunable.map((l) => `${l} -> ${readlinkSync(l)}`).join('\n') + '\n')
        console.log(`  清单已写入 ${manifest}`)
      } catch (error) {
        console.error(`  清单写入失败（继续剪除）：${error.message}`)
      }
      for (const link of prunable) unlinkSync(link)
    }
  }
  for (const link of unresolved) {
    console.log(`  ! ${link} -> ${readlinkSync(link)}（与 hub 无关，跳过）`)
  }
  if (!APPLY && (fixed.length > 0 || (PRUNE && prunable.length > 0))) {
    console.log('\n预览结束。确认无误后加 --yes 执行。')
  }
  if (APPLY && fixed.length > 0) {
    const stillBroken = fixed.filter((item) => {
      try {
        realpathSync(item.link)
        return false
      } catch {
        return true
      }
    })
    console.log(`\n复检：${fixed.length - stillBroken.length}/${fixed.length} 已恢复可解析`)
    if (stillBroken.length > 0) process.exitCode = 1
  }
}

main()
