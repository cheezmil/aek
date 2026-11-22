/**
 * Host-persisted Web Storage for the AEK console (C11+, BI round).
 *
 * The web console's `window.localStorage` is redirected at boot by
 * `@cheezmil/aek-web`'s `host-storage.ts` shim: every read/write lands in an
 * in-memory Map and is flushed to this file, so the SAME value is seen from
 * the Electron shell, a plain browser, and on other machines serving the
 * same data root. Plugin authors keep writing `localStorage.setItem(...)` —
 * they never have to think about where the value lives (user rule, 2026-11-22:
 * "直接让插件现有的 localstorage 存储方式自动变成存储到本地为 yml").
 *
 * On-disk shape: `<AEK_HOME>/preferences/web-storage.yml` — a YAML-subset
 * document the `paths.mjs` parser accepts:
 *
 *     # AEK web storage — auto-migrated from browser localStorage (C11+)
 *     version: 1
 *     entries:
 *       "aek-art-global-theme": "style-aec-base"
 *       "aek-art-favorites": "[\"style-aec-base\",\"uix:Neumorphic\"]"
 *
 * Keys and values are JSON-encoded double-quoted scalars (JSON escaping is a
 * subset of YAML double-quoted-style escaping, and `parseYamlSubset` reads
 * them back with `JSON.parse`), so arbitrary strings — including newlines,
 * quotes, colons and unicode — round-trip exactly.
 *
 * This module is the ONLY place that knows the file location. The web-server
 * half (`@cheezmil/aek-websearch` web-storage routes) and every resolver go
 * through it, so renaming the folder is still a one-line manifest edit.
 *
 * @module @cheezmil/coraek/web-storage
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { aekHomePath } from './home.mjs'
import { parseYamlSubset } from './paths.mjs'

/** The settings directory + file name (relative to the AEK data root). */
export const WEB_STORAGE_DIR = 'preferences'
export const WEB_STORAGE_FILENAME = 'web-storage.yml'

/**
 * Absolute path of the web-storage file for the current data root.
 * @returns {string} `<AEK_HOME>/preferences/web-storage.yml`.
 */
export function webStorageFile() {
  return aekHomePath(WEB_STORAGE_DIR, WEB_STORAGE_FILENAME)
}

/**
 * Read every stored entry. A missing or malformed file is the normal
 * first-run state and reads as "no entries yet" — the console keeps working
 * on its in-memory values.
 * @returns {Record<string, string>} the entries (string values, as Web
 *   Storage mandates).
 */
export function readWebStorageEntries() {
  const file = webStorageFile()
  if (!existsSync(file)) return {}
  let document
  try {
    document = parseYamlSubset(readFileSync(file, 'utf8'), WEB_STORAGE_FILENAME)
  } catch {
    return {}
  }
  const raw = document.entries
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) return {}
  /** @type {Record<string, string>} */
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    out[key] = String(value ?? '')
  }
  return out
}

/**
 * Render the YAML-subset document for a set of entries.
 *
 * Kept next to the reader so the writer can never drift from the parser:
 * this output is exactly what `parseYamlSubset` accepts (JSON-encoded
 * double-quoted scalars + a plain `entries:` block).
 * @param {Record<string, unknown>} entries - the full entry map.
 * @returns {string} file contents.
 */
export function dumpWebStorageYaml(entries) {
  const lines = [
    '# AEK web storage — 由 web 控制台的 localStorage 自动重定向写入（C11+）',
    '# 手改也可以：键值都是 JSON 编码的双引号标量，parseYamlSubset 原样读回。',
    'version: 1',
  ]
  const keys = Object.keys(entries).sort()
  if (keys.length === 0) {
    lines.push('entries: null')
    return `${lines.join('\n')}\n`
  }
  lines.push('entries:')
  for (const key of keys) {
    lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(String(entries[key] ?? ''))}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * Replace the whole entry map (the shim posts the full map on every flush,
 * so a replace is the natural atomic unit).
 * @param {Record<string, string>} entries - the full entry map.
 * @returns {string} the written file path.
 */
export function writeWebStorageEntries(entries) {
  const file = webStorageFile()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, dumpWebStorageYaml(entries), 'utf8')
  renameSync(tmp, file)
  return file
}
