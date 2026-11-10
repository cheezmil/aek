#!/usr/bin/env node
/**
 * The AEK path manifest: where every AEK folder actually lives.
 *
 * `~/.aek` used to be a data root, then became a CONTAINER holding one
 * directory per slot (`current/`, `next/`) plus `backups/`. Every time the
 * shape changed, the derived paths were rebuilt by CODE — `join(container,
 * 'current')` was spelled out in `home.mjs`, `slots.mjs`, `cqg`, the quick
 * prompt app and several scripts — so moving one parent folder meant editing
 * every repository at once.
 *
 * That is a configuration problem, not a code problem. This module reads
 *
 *     <container>/aek.yaml
 *
 * and answers "where is slot X", "where is the backups folder", "where does
 * `skill-manager` live inside a slot" from that file alone. Inserting a parent
 * folder (`current/` → `v2/current/`) is then a ONE-LINE edit to the manifest,
 * with zero code changes anywhere.
 *
 * The manifest is optional. When it is absent the module falls back to the
 * historical defaults (`<container>/current`, `<container>/next`,
 * `<container>/backups`), so a fresh install and an old install both work.
 *
 * Deliberately dependency-free plain ESM: `@cheezmil/coraek/home` is imported
 * directly by bin bootstraps and installed tarballs, where no `node_modules`
 * of the workspace exists. That is also why the YAML reader below is a tiny
 * subset parser rather than `js-yaml`; the subset it accepts is exactly what
 * `renderManifest()` emits (nested maps, scalars, comments, simple lists), and
 * a line-numbered error is raised instead of guessing on anything else. A file
 * that begins with `{` is parsed as JSON, since JSON is a subset of YAML and
 * gives users an escape hatch.
 *
 * @module @cheezmil/coraek/paths
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'

/** File name of the manifest inside the container. */
export const AEK_MANIFEST_FILENAME = 'aek.yaml'

/** Manifest schema version understood by this module. */
export const AEK_MANIFEST_VERSION = 1

/**
 * Directory name of each slot when the manifest says nothing.
 *
 * `current` is the default slot: it is the only word that pairs with `next`
 * without implying anything about stability.
 */
export const DEFAULT_SLOT_DIRS = /** @type {const} */ ({ aek: 'current', next: 'next' })

/** Backups directory name when the manifest says nothing. */
export const DEFAULT_BACKUPS_DIR = 'backups'

/**
 * Named folders inside a slot, with the identity mapping as the default.
 *
 * Keys are the names callers pass to `aekHomePath()` — `aekHomePath('websearch',
 * 'providers.yml')` resolves the `websearch` key through the manifest before
 * joining the rest of the segments. That is what makes the twenty-odd existing
 * call sites manifest-aware without touching any of them: renaming a folder is
 * a manifest edit, not a code edit.
 */
export const DEFAULT_DIRS = /** @type {Record<string, string>} */ ({
  browser: 'browser',
  desktop: 'desktop',
  'desktop-dev': 'desktop-dev',
  dev: 'dev',
  logs: 'logs',
  mcp: 'mcp',
  preferences: 'preferences',
  profiles: 'profiles',
  'prompt-manager': 'prompt-manager',
  'quick-git': 'quick-git',
  'quick-prompt': 'quick-prompt',
  rollback: 'rollback',
  sessions: 'sessions',
  shots: 'shots',
  'skill-manager': 'skill-manager',
  storages: 'storages',
  test: 'test',
  websearch: 'websearch',
})

/** @typedef {object} AekManifest
 * @property {string} file - absolute path of the manifest file.
 * @property {string} container - directory the manifest was found in.
 * @property {number} version - schema version declared by the file.
 * @property {string} root - absolute base for every relative path in the file.
 * @property {Record<'aek' | 'next', string>} slots - absolute data root per slot.
 * @property {string} backups - absolute path of the backups directory.
 * @property {Record<string, string>} dirs - folder name inside a slot → path (relative to the slot root unless absolute).
 * @property {string[]} warnings - non-fatal problems found while reading.
 */

/** @type {Map<string, { key: string, manifest: AekManifest | null }>} */
const MANIFEST_CACHE = new Map()

/**
 * Expand `~` and resolve a manifest path value against a base directory.
 * @param {string} base - directory relative values are resolved against.
 * @param {unknown} value - raw scalar from the manifest.
 * @returns {string} an absolute path.
 */
export function resolveManifestPath(base, value) {
  const raw = String(value ?? '').trim()
  if (raw === '' || raw === '.' || raw === './') return resolve(base)
  if (raw === '~') return homedir()
  if (raw.startsWith('~/') || raw.startsWith('~' + '\\')) return resolve(join(homedir(), raw.slice(2)))
  return resolve(base, raw)
}

/**
 * Drop a trailing comment from a YAML line, honouring quotes.
 * @param {string} line - raw line.
 * @returns {string} the line without its comment.
 */
function stripComment(line) {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === '#' && !inSingle && !inDouble && (i === 0 || /\s/u.test(line[i - 1]))) {
      return line.slice(0, i)
    }
  }
  return line
}

/**
 * Interpret a scalar token.
 * @param {string} raw - trimmed token.
 * @returns {string | number | boolean | null} the value.
 */
function parseScalar(raw) {
  const text = raw.trim()
  if (text === '' || text === '~' || text === 'null') return null
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^-?\d+$/u.test(text)) return Number.parseInt(text, 10)
  if (/^-?\d*\.\d+$/u.test(text)) return Number.parseFloat(text)
  if ((text.startsWith('"') && text.endsWith('"') && text.length > 1)) {
    return text.slice(1, -1).replace(/\\"/gu, '"')
  }
  if ((text.startsWith("'") && text.endsWith("'") && text.length > 1)) {
    return text.slice(1, -1).replace(/''/gu, "'")
  }
  return text
}

/**
 * Parse the YAML subset used by the manifest.
 *
 * Supported: nested mappings by indentation, `<key>: <scalar>` pairs, `- item`
 * lists, `#` comments, single/double quoted strings, `~`/`null`, booleans and
 * numbers. Anything else (anchors, flow collections, multi-line scalars) is
 * rejected with a line number instead of being silently misread — a manifest
 * that half-works is worse than one that refuses.
 * @param {string} text - file contents.
 * @param {string} [file] - file name used in error messages.
 * @returns {Record<string, unknown>} the parsed document.
 */
export function parseYamlSubset(text, file = '<manifest>') {
  const trimmedAll = text.trimStart()
  if (trimmedAll.startsWith('{')) {
    try {
      return /** @type {Record<string, unknown>} */ (JSON.parse(text))
    } catch (error) {
      throw new SyntaxError(`${file}: 看起来是 JSON 但解析失败 — ${String(error)}`)
    }
  }

  /** @type {{ indent: number, text: string, line: number }[]} */
  const rows = []
  text.split(/\r?\n/u).forEach((raw, index) => {
    const withoutComment = stripComment(raw)
    if (withoutComment.trim() === '') return
    rows.push({
      indent: withoutComment.length - withoutComment.trimStart().length,
      text: withoutComment.trim(),
      line: index + 1,
    })
  })

  let cursor = 0

  /** @param {number} indent @returns {unknown} */
  function parseBlock(indent) {
    if (rows[cursor] && /^-\s|^-$/u.test(rows[cursor].text)) return parseList(indent)
    /** @type {Record<string, unknown>} */
    const obj = {}
    while (cursor < rows.length && rows[cursor].indent === indent) {
      const row = rows[cursor]
      if (row.text.startsWith('- ')) {
        throw new SyntaxError(`${file}:${row.line}: 同一层混用了映射和列表`)
      }
      const match = /^([^:]+):(?:\s+(.*))?$/u.exec(row.text)
      if (!match) throw new SyntaxError(`${file}:${row.line}: 期望 "key: value"，实际 "${row.text}"`)
      const key = String(parseScalar(match[1].trim()) ?? '').trim()
      const rest = (match[2] ?? '').trim()
      cursor++
      if (rest === '') {
        if (cursor < rows.length && rows[cursor].indent > indent) {
          obj[key] = parseBlock(rows[cursor].indent)
        } else {
          obj[key] = null
        }
      } else {
        obj[key] = parseScalar(rest)
        if (cursor < rows.length && rows[cursor].indent > indent) {
          throw new SyntaxError(`${file}:${rows[cursor].line}: 意外的缩进（"${key}" 已经有了标量值）`)
        }
      }
    }
    return obj
  }

  /** @param {number} indent @returns {unknown[]} */
  function parseList(indent) {
    /** @type {unknown[]} */
    const list = []
    while (cursor < rows.length && rows[cursor].indent === indent && rows[cursor].text.startsWith('-')) {
      const row = rows[cursor]
      cursor++
      list.push(parseScalar(row.text.replace(/^-\s*/u, '')))
    }
    return list
  }

  const document = parseBlock(rows.length > 0 ? rows[0].indent : 0)
  if (cursor < rows.length) {
    const row = rows[cursor]
    throw new SyntaxError(`${file}:${row.line}: 无法解析 "${row.text}"（缩进不一致？）`)
  }
  return /** @type {Record<string, unknown>} */ (document && typeof document === 'object' ? document : {})
}

/**
 * Normalise a parsed document into a manifest.
 * @param {string} file - manifest path.
 * @param {Record<string, unknown>} document - parsed YAML/JSON.
 * @returns {AekManifest} the normalised manifest.
 */
function normaliseManifest(file, document) {
  const container = dirname(file)
  /** @type {string[]} */
  const warnings = []

  const version = Number(document.version ?? AEK_MANIFEST_VERSION)
  if (!Number.isFinite(version) || version !== AEK_MANIFEST_VERSION) {
    warnings.push(`version: ${String(document.version)} 不是本模块认识的 ${AEK_MANIFEST_VERSION}，按 ${AEK_MANIFEST_VERSION} 处理`)
  }

  const rootValue = document.root ?? '.'
  const root = resolveManifestPath(container, rootValue)

  const rawSlots = /** @type {Record<string, unknown>} */ (
    document.slots && typeof document.slots === 'object' ? document.slots : {}
  )
  /** @type {Record<'aek' | 'next', string>} */
  const slots = {
    aek: resolveManifestPath(root, rawSlots.aek ?? DEFAULT_SLOT_DIRS.aek),
    next: resolveManifestPath(root, rawSlots.next ?? DEFAULT_SLOT_DIRS.next),
  }
  for (const key of Object.keys(rawSlots)) {
    if (key !== 'aek' && key !== 'next') warnings.push(`slots.${key}: 未知槽名，已忽略（只支持 aek / next）`)
  }

  const backups = resolveManifestPath(root, document.backups ?? DEFAULT_BACKUPS_DIR)

  /** @type {Record<string, string>} */
  const dirs = { ...DEFAULT_DIRS }
  const rawDirs = /** @type {Record<string, unknown>} */ (
    document.dirs && typeof document.dirs === 'object' ? document.dirs : {}
  )
  for (const [key, value] of Object.entries(rawDirs)) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text === '') continue
    dirs[key] = text
  }

  if (slots.aek === slots.next) warnings.push('slots.aek 与 slots.next 指向同一个目录：两个槽会互相覆盖')

  return { file, container, version: AEK_MANIFEST_VERSION, root, slots, backups, dirs, warnings }
}

/**
 * Read (and cache) the manifest of a container.
 *
 * The cache is keyed by the resolved file path and invalidated by mtime+size,
 * so editing `aek.yaml` takes effect on the next process without a restart of
 * anything long-lived.
 * @param {string} container - directory that may hold `aek.yaml`.
 * @returns {AekManifest | null} the manifest, or null when the file is absent.
 */
export function readAekManifest(container) {
  const file = join(resolve(container), AEK_MANIFEST_FILENAME)
  if (!existsSync(file)) return null

  let stat
  try {
    stat = statSync(file)
  } catch {
    return null
  }
  const key = `${String(stat.mtimeMs)}:${String(stat.size)}`
  const cached = MANIFEST_CACHE.get(file)
  if (cached && cached.key === key) return cached.manifest

  let manifest = null
  try {
    const document = parseYamlSubset(readFileSync(file, 'utf8'), file)
    manifest = normaliseManifest(file, document)
  } catch (error) {
    // A broken manifest must never brick the app: fall back to defaults, but
    // say so loudly on stderr so `paths check` / the console can surface it.
    console.error(`[aek] ${AEK_MANIFEST_FILENAME} 解析失败，回退到默认布局：${String(error instanceof Error ? error.message : error)}`)
    manifest = normaliseManifest(file, {})
    manifest.warnings.push(`解析失败，已按默认布局运行：${String(error instanceof Error ? error.message : error)}`)
  }
  MANIFEST_CACHE.set(file, { key, manifest })
  return manifest
}

/**
 * Find the container a slot data root belongs to.
 *
 * Walks up to four ancestor levels looking for an `aek.yaml` that declares the
 * given path as one of its slots. This is what makes nested parents work: with
 * `slots.aek: v2/current`, a process that only knows `~/.aek/v2/current` can
 * still find `~/.aek/aek.yaml` — and therefore the sibling slot — instead of
 * guessing from the directory name.
 * @param {string} home - absolute data-root path.
 * @returns {AekManifest | null} the manifest that claims this path, if any.
 */
export function findManifestFor(home) {
  const abs = resolve(home)
  let dir = abs
  for (let depth = 0; depth < 4; depth++) {
    const manifest = readAekManifest(dir)
    if (manifest && (manifest.slots.aek === abs || manifest.slots.next === abs)) return manifest
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Container that a given data root lives in.
 *
 * A manifest that claims the path wins. Without one, the historical rule
 * applies: `<container>/current` and `<container>/next` recover their parent,
 * and anything else is its own container.
 * @param {string} home - absolute data-root path.
 * @returns {string} the container path.
 */
export function containerOf(home) {
  const abs = resolve(home)
  const manifest = findManifestFor(abs)
  if (manifest) return manifest.container
  const name = basename(abs)
  if (name === DEFAULT_SLOT_DIRS.aek || name === DEFAULT_SLOT_DIRS.next) return dirname(abs)
  return abs
}

/**
 * Manifest that governs a data root: the one claiming it, else the container's.
 * @param {string} home - absolute data-root path.
 * @returns {AekManifest | null} the governing manifest, or null.
 */
export function manifestFor(home) {
  return findManifestFor(home) ?? readAekManifest(containerOf(home))
}

/**
 * Resolve a named folder inside a slot.
 * @param {Record<string, string>} dirs - the manifest `dirs` table.
 * @param {string} home - the slot data root.
 * @param {string} name - folder name as used in code (`websearch`, `skill-manager`, …).
 * @returns {string} absolute path, honouring absolute overrides.
 */
export function resolveDir(dirs, home, name) {
  const configured = dirs[name]
  if (configured === undefined || configured === '') return join(home, name)
  if (isAbsolute(configured)) return configured
  if (configured === name) return join(home, name)
  return join(home, configured)
}

/**
 * Render the default manifest for a container.
 *
 * Kept next to the reader so the writer can never drift from the parser: this
 * output is exactly the subset `parseYamlSubset` accepts.
 *
 * The template is deliberately path-free: it must never embed the absolute
 * container path of whichever machine generated the file. Users on every
 * platform get this file, so a `/Users/<someone>` or `C:\Users\<someone>`
 * comment would leak one developer's home directory into everyone's install —
 * and it would be wrong the moment the container is moved or mounted elsewhere.
 * "Relative to this file" is the only statement that stays true.
 * @returns {string} manifest contents.
 */
export function renderManifest() {
  const dirs = Object.keys(DEFAULT_DIRS)
    .sort()
    .map((key) => `  ${key}: ${DEFAULT_DIRS[key]}`)
    .join('\n')
  return `# AEK 路径清单 —— 「文件夹到底在哪」的唯一真相
#
# 改这个文件即可搬家，不用改任何代码。所有相对路径都以本文件所在目录
# 为基准；也接受绝对路径和 ~ 开头。
#
# 想插一层父文件夹：把 slots 的值从 current 改成比如 v2/current，
# 再把目录挪过去就行。想放到外置盘：root 写绝对路径。
version: ${AEK_MANIFEST_VERSION}

# 相对路径的基准目录。"." 表示就是本文件所在的目录。
root: .

# 每个槽的数据根。
slots:
  aek: ${DEFAULT_SLOT_DIRS.aek}
  next: ${DEFAULT_SLOT_DIRS.next}

# 迁移快照 / 回滚清单，不算数据根。
backups: ${DEFAULT_BACKUPS_DIR}

# 槽内各数据目录。改这里等于给目录改名或外挂，代码无需改动。
dirs:
${dirs}
`
}

/**
 * Write the default manifest into a container, if it does not exist yet.
 * @param {string} container - target container directory.
 * @param {{ force?: boolean }} [options] - `force` overwrites an existing file.
 * @returns {{ file: string, written: boolean }} what happened.
 */
export function writeDefaultManifest(container, options = {}) {
  const dir = resolve(container)
  const file = join(dir, AEK_MANIFEST_FILENAME)
  if (existsSync(file) && options.force !== true) return { file, written: false }
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, renderManifest(), 'utf8')
  MANIFEST_CACHE.delete(file)
  return { file, written: true }
}
