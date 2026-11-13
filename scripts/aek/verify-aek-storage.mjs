#!/usr/bin/env node
/**
 * Web Storage red-line gate for AEK-owned code (A round).
 *
 * User rules (re-asserted 2026-11-14, third warning):
 *   1. NO setting may live in the browser's localStorage/sessionStorage —
 *      nothing at all in localStorage.
 *   2. Persistence must not depend on ANY Electron ecosystem: AEK is a web
 *      UI, the Electron shell is just one container (the same build also
 *      runs in a plain browser). Storage belongs to the HOST: the node web
 *      backend writes `<AEK_HOME>/preferences/<plugin>.json`, served through
 *      the thin `/api/aek/preferences` API (read = one fetch + in-memory
 *      cache, write = one-key PATCH). No electron-store, no electron APIs,
 *      no polling, no database — one small JSON file per settings group.
 *
 * This gate makes rule 1 machine-enforced: it scans AEK-owned product source
 * for runtime uses of the Web Storage APIs and fails on a hit. Comment and
 * docstring mentions of the API (the "never use localStorage" principle is
 * documented throughout the codebase) are allowed — comments are stripped
 * before matching, so only CODE-POSITION usage counts.
 *
 * Scope: `packages/aek/**` and `apps/aek-desktop/src/**` (TS/TSX/JS/MJS),
 * excluding node_modules, build output and spec files. Upstream `apps/web`
 * test fixtures that seed `dsh.*` keys exercise the inherited DSH web app,
 * not AEK settings — out of scope on purpose.
 *
 * Read-only. Usage:
 *   node scripts/aek/verify-aek-storage.mjs          # run the gate
 *   node scripts/aek/verify-aek-storage.mjs --quiet  # only print violations
 *
 * @module scripts/aek/verify-aek-storage
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** @returns the repo root (nearest pnpm-workspace.yaml). */
function findRoot(start) {
  let dir = start
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('cannot locate pnpm-workspace.yaml above scripts/aek')
}

const ROOT = findRoot(HERE)
const SCOPES = ['packages/aek', join('apps', 'aek-desktop', 'src')]
const EXCLUDED_DIR = new Set(['node_modules', 'lib', 'dist', 'build', '__tests__', '.git'])
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs'])

/** @param {string} root @returns AEK-owned source files in scope. */
function walk(root, out = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR.has(entry.name)) continue
      walk(full, out)
    } else if (entry.isFile() && EXT.has(full.slice(full.lastIndexOf('.'))) && !/\.spec\.[tm]?[j]sx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Mask comments and string-literal contents with spaces, preserving string
 * LENGTH and every newline — so matched line numbers stay aligned with the
 * source. The API name inside a docstring or a string literal is documentation
 * of the principle, not a use; only code-position text survives the mask.
 * @param {string} source
 * @returns {string} masked source (same length, same newlines).
 */
function maskNonCode(source) {
  const out = source.split('')
  let i = 0
  let state = 'code' // code | sq | dq | tpl | line | block
  while (i < source.length) {
    const ch = source[i]
    const two = source.slice(i, i + 2)
    if (state === 'code') {
      if (two === '//') {
        state = 'line'
        while (i < source.length && source[i] !== '\n') { out[i] = ' '; i += 1 }
        state = 'code'
        continue
      }
      if (two === '/*') {
        state = 'block'
        out[i] = ' '; out[i + 1] = ' '; i += 2
        while (i < source.length && source.slice(i, i + 2) !== '*/') {
          if (source[i] !== '\n') out[i] = ' '
          i += 1
        }
        if (i < source.length) { out[i] = ' '; out[i + 1] = ' '; i += 2 }
        state = 'code'
        continue
      }
      if (ch === "'") state = 'sq'
      else if (ch === '"') state = 'dq'
      else if (ch === '`') state = 'tpl'
      i += 1
    } else if (state === 'sq' || state === 'dq') {
      const q = state === 'sq' ? "'" : '"'
      if (ch === '\\') { out[i + 1] = ' '; i += 2; continue }
      if (ch === q) { state = 'code'; i += 1; continue }
      out[i] = ' '
      i += 1
    } else if (state === 'tpl') {
      if (ch === '\\') { out[i + 1] = ' '; i += 2; continue }
      if (ch === '`') { state = 'code'; i += 1; continue }
      if (ch === '$' && source[i + 1] === '{') { i += 2; continue }   // ${...} contents stay code
      out[i] = ' '
      i += 1
    }
  }
  return out.join('')
}

const USAGE = /(?:localStorage|sessionStorage)\s*[.\[]|window\s*\[\s*['"](?:localStorage|sessionStorage)['"]|globalThis\s*\.\s*(?:localStorage|sessionStorage)/
/** @type {string[]} */
const violations = []
let scanned = 0
for (const scope of SCOPES) {
  const base = join(ROOT, scope)
  if (!existsSync(base)) continue
  for (const file of walk(base)) {
    scanned += 1
    const masked = maskNonCode(readFileSync(file, 'utf8'))
    masked.split('\n').forEach((line, n) => {
      if (USAGE.test(line)) violations.push(`${relative(ROOT, file)}:${n + 1}: ${line.trim().slice(0, 120)}`)
    })
  }
}

if (violations.length > 0) {
  for (const v of violations) console.error(`  ✗ ${v}`)
  console.error(`verify-aek-storage: FAIL — ${violations.length} Web Storage API use(s) in AEK-owned code. Settings belong on the host: /api/aek/preferences → <AEK_HOME>/preferences/ (no Electron, no localStorage).`)
  process.exit(1)
}
if (!process.argv.includes('--quiet')) {
  console.log(`verify-aek-storage: OK — no Web Storage API use in AEK-owned product source (${scanned} files; scopes: ${SCOPES.join(', ')}).`)
}
process.exit(0)
