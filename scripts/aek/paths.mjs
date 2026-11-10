#!/usr/bin/env node
/**
 * Inspect / verify / create the AEK path manifest.
 *
 * The manifest (`<container>/aek.yaml`) is the single place that says WHERE the
 * folders are. This CLI answers "what does it currently say", "is what it says
 * actually on disk", and "create the default one".
 *
 *   node scripts/aek/paths.mjs                # show (read-only, the default)
 *   node scripts/aek/paths.mjs show           # same
 *   node scripts/aek/paths.mjs check          # validate; non-zero on problems
 *   node scripts/aek/paths.mjs check --json   # machine-readable
 *   node scripts/aek/paths.mjs init           # write the default manifest (never overwrites)
 *   node scripts/aek/paths.mjs init --force   # overwrite
 *
 * With no argument it only READS. `init` is the single writing subcommand and
 * refuses to clobber an existing file unless `--force` is passed.
 */
import { existsSync, lstatSync } from 'node:fs'
import { relative, sep } from 'node:path'
import {
  AEK_MANIFEST_FILENAME,
  DEFAULT_DIRS,
  readAekManifest,
  renderManifest,
  writeDefaultManifest,
} from '../../packages/aek/base/coraek/paths.mjs'
import { aekBackupsPath, resolveAekRoot } from '../../packages/aek/base/coraek/home.mjs'
import { slotHome } from '../../packages/aek/base/coraek/slots.mjs'

/**
 * Shorten an absolute path for display, keeping it unambiguous.
 * @param {string} absolute - path to shorten.
 * @returns {string} the display form.
 */
function pretty(absolute) {
  const home = process.env.HOME ?? ''
  if (home && absolute.startsWith(home + sep)) return `~/${relative(home, absolute).split(sep).join('/')}`
  return absolute
}

/**
 * @param {string} path - path to test.
 * @returns {{ exists: boolean, symlink: boolean }} filesystem state.
 */
function inspect(path) {
  try {
    const stat = lstatSync(path)
    return { exists: true, symlink: stat.isSymbolicLink() }
  } catch {
    return { exists: false, symlink: false }
  }
}

/** Print the current manifest and the paths the runtime actually resolves. */
function show() {
  const container = resolveAekRoot()
  const manifest = readAekManifest(container)
  console.log(`container  ${pretty(container)}`)

  if (!manifest) {
    console.log(`manifest   （没有 ${AEK_MANIFEST_FILENAME}，按历史默认布局运行）`)
    console.log(`  运行 "node scripts/aek/paths.mjs init" 生成一份，之后搬家只改它。`)
  } else {
    console.log(`manifest   ${pretty(manifest.file)}`)
    console.log(`root       ${pretty(manifest.root)}${manifest.root === container ? '' : '   ← 与容器不同'}`)
  }

  for (const slot of /** @type {const} */ (['aek', 'next'])) {
    const declared = manifest ? manifest.slots[slot] : slotHome(slot)
    const state = inspect(declared)
    const flags = [state.exists ? '存在' : '缺失', state.symlink ? '软链(禁止)' : '']
      .filter(Boolean)
      .join(' ')
    console.log(`slot ${slot.padEnd(5)}   ${pretty(declared)}   [${flags}]`)
  }

  const backups = aekBackupsPath()
  console.log(`backups    ${pretty(backups)}${existsSync(backups) ? '' : '   [缺失]'}`)

  if (manifest) {
    const moved = Object.entries(manifest.dirs).filter(([name, value]) => value !== name)
    if (moved.length > 0) {
      console.log('dirs 覆盖   ' + moved.map(([name, value]) => `${name} → ${value}`).join(', '))
    } else {
      console.log(`dirs       ${Object.keys(manifest.dirs).length} 项，全部是同名默认值`)
    }
    for (const warning of manifest.warnings) console.log(`warning    ${warning}`)
  }
}

/**
 * Validate the manifest against the filesystem.
 * @returns {number} process exit code.
 */
function check() {
  const json = process.argv.includes('--json')
  const container = resolveAekRoot()
  const manifest = readAekManifest(container)
  /** @type {{ level: 'error' | 'warn', code: string, message: string }[]} */
  const problems = []

  if (!manifest) {
    problems.push({ level: 'warn', code: 'manifest-missing', message: `${pretty(container)}/${AEK_MANIFEST_FILENAME} 不存在，按历史默认布局运行` })
  }
  for (const warning of manifest?.warnings ?? []) {
    problems.push({ level: 'error', code: 'manifest-warning', message: warning })
  }

  const slots = /** @type {Record<'aek' | 'next', string>} */ (
    manifest ? manifest.slots : { aek: slotHome('aek'), next: slotHome('next') }
  )
  if (slots.aek === slots.next) {
    problems.push({ level: 'error', code: 'slots-collide', message: '两个槽指向同一个目录' })
  }

  for (const slot of /** @type {const} */ (['aek', 'next'])) {
    const path = slots[slot]
    const state = inspect(path)
    if (!state.exists) {
      problems.push({ level: 'warn', code: `slot-missing:${slot}`, message: `${pretty(path)} 还不存在（首次启动会自动建）` })
    }
    if (state.symlink) {
      problems.push({ level: 'error', code: `slot-symlink:${slot}`, message: `${pretty(path)} 是软链；槽目录必须是实体目录，否则两槽会互相写入` })
    }
    if (manifest && path !== container && !path.startsWith(manifest.root)) {
      problems.push({ level: 'warn', code: `slot-outside-root:${slot}`, message: `${pretty(path)} 不在 root 之下（允许，但请确认是有意的）` })
    }
  }

  const backups = aekBackupsPath()
  if (manifest && !existsSync(backups)) {
    problems.push({ level: 'warn', code: 'backups-missing', message: `${pretty(backups)} 不存在` })
  }

  const errors = problems.filter((p) => p.level === 'error')
  if (json) {
    console.log(JSON.stringify({ ok: errors.length === 0, container, manifest: manifest?.file ?? null, slots, backups, problems }, null, 2))
  } else if (problems.length === 0) {
    console.log(`paths: OK — ${pretty(container)}，清单 ${manifest ? pretty(manifest.file) : '缺省'}，两槽分离`)
  } else {
    for (const problem of problems) console.log(`${problem.level === 'error' ? '✗' : '!'} [${problem.code}] ${problem.message}`)
    console.log(errors.length > 0 ? `paths: ${errors.length} 个错误` : 'paths: 只有提醒，没有错误')
  }
  return errors.length === 0 ? 0 : 1
}

/**
 * Write the default manifest when absent (or when `--force`).
 * @returns {number} process exit code.
 */
function init() {
  const container = resolveAekRoot()
  const force = process.argv.includes('--force')
  const result = writeDefaultManifest(container, { force })
  if (!result.written) {
    console.log(`${pretty(result.file)} 已存在，未改动。要覆盖加 --force。`)
    console.log('（下面是要写入的内容，供对照）')
    console.log(renderManifest({ container: pretty(container) }))
    return 0
  }
  console.log(`已写入 ${pretty(result.file)}`)
  console.log(`dirs 默认项 ${Object.keys(DEFAULT_DIRS).length} 个；改目录结构只需编辑这个文件。`)
  return check()
}

function usage() {
  console.log('用法: node scripts/aek/paths.mjs [show|check|init] [--json] [--force]')
  console.log('  show   打印清单与运行时实际解析结果（默认，只读）')
  console.log('  check  校验清单与磁盘是否一致，有错误时退出码非 0')
  console.log('  init   生成默认 aek.yaml（已存在则不动，--force 覆盖）')
  return 0
}

/** @type {Record<string, () => number>} */
const COMMANDS = { show, check, init, help: usage }

const command = process.argv[2] ?? 'show'
const normalized = command === '--help' || command === '-h' ? 'help' : command
const run = COMMANDS[normalized]
if (!run) {
  console.error(`未知子命令: ${command}`)
  usage()
  process.exit(1)
}
process.exit(run())
