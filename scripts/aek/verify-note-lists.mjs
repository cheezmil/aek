#!/usr/bin/env node
/**
 * R24 note/document half: every list in AEK notes must be unordered (`-`).
 *
 * The UI half lives in `verify-console-round.mjs` (no `<ol>` / `<table>` in
 * `.tsx`). This script scans markdown notes for leading numeric enumerations
 * (`1. `, `1、` , `1) `) and, only with `--fix --yes`, rewrites those markers
 * to `- `. Fenced code blocks are skipped.
 *
 * SAFETY:
 *  - no arguments → read-only help / no-op.
 *  - `--notes=<dir>` is required (never hardcoded; the notes live outside the
 *    repository and the repo must not spell out a machine path).
 *  - default is a REPORT. `--fix` alone is still a dry run; `--yes` is needed
 *    for writes, and a timestamped backup of every changed file is written
 *    first (rollback point before any system-level config-like edit).
 *  - `--include-archive` opts into historical snapshots; by default `archive/`
 *    and `todos/archive/` are kept verbatim as historical records.
 *
 * Usage:
 *   node scripts/aek/verify-note-lists.mjs --notes=/path/to/aek-dev-notes
 *   node scripts/aek/verify-note-lists.mjs --notes=/path/to/aek-dev-notes --fix
 *   node scripts/aek/verify-note-lists.mjs --notes=/path/to/aek-dev-notes --fix --yes
 *
 * @module scripts/aek/verify-note-lists
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const args = process.argv.slice(2)
const notesArg = args.find(arg => arg.startsWith('--notes='))
const fix = args.includes('--fix')
const yes = args.includes('--yes')
const includeArchive = args.includes('--include-archive')
for (const arg of args) {
  if (arg !== '--fix' && arg !== '--yes' && arg !== '--include-archive' && !arg.startsWith('--notes=')) {
    throw new Error(`unknown argument: ${arg}`)
  }
}
if (notesArg === undefined) {
  process.stdout.write('[note-lists] no-op: pass --notes=<dir> to scan markdown notes (read-only by default).\n')
  process.exit(0)
}
const NOTES = notesArg.slice('--notes='.length)
if (!existsSync(NOTES)) throw new Error(`notes directory does not exist: ${NOTES}`)

/** @param {string} dir @returns {string[]} every .md file below dir */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.md') && !name.endsWith('.bak')) out.push(path)
  }
  return out
}

const enumerated = /^(\s*)\d+[.、)]\s+/u
// The blockquoted "仍有效的硬规则" registry is cited everywhere as 硬规则 N.
// Keep N as an inline identifier while still making the item an unordered
// bullet, so cross-references survive the R24 conversion.
const quotedRule = /^(\s*>\s*)(\d+)[.、)]\s+/u
const SEP = process.platform === 'win32' ? '\\' : '/'
const files = walk(NOTES).filter((file) => {
  const rel = relative(NOTES, file)
  if (includeArchive) return true
  return !rel.startsWith(`archive${SEP}`)
    && !rel.startsWith(`backup${SEP}`)
    && !rel.includes(`${SEP}archive${SEP}`)
})

let total = 0
const changed = []
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  let inFence = false
  let hits = 0
  const lines = source.split('\n')
  const next = lines.map((line) => {
    if (/^\s*```/u.test(line)) { inFence = !inFence; return line }
    if (inFence) return line
    if (quotedRule.test(line)) {
      hits++
      return line.replace(quotedRule, '$1- **$2.** ')
    }
    if (!enumerated.test(line)) return line
    hits++
    return line.replace(enumerated, '$1- ')
  })
  if (hits === 0) continue
  total += hits
  changed.push({ file, hits, text: next.join('\n') })
  process.stdout.write(`${String(hits).padStart(3)}  ${relative(NOTES, file)}\n`)
}
process.stdout.write(`[note-lists] ${String(total)} numbered-list lines in ${String(changed.length)}/${String(files.length)} files (archive ${includeArchive ? 'included' : 'excluded'})\n`)

if (!fix) {
  process.stdout.write('[note-lists] report only; pass --fix --yes to rewrite markers to "- ".\n')
  process.exit(0)
}
if (!yes) {
  process.stdout.write(`[note-lists] DRY RUN: would rewrite ${String(total)} lines in ${String(changed.length)} files; pass --yes to apply.\n`)
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/[-:T]/gu, '').slice(0, 14)
for (const item of changed) {
  const backup = `${item.file}.bak.${stamp}-pre-list-fix`
  copyFileSync(item.file, backup)
  writeFileSync(item.file, item.text, 'utf8')
  process.stdout.write(`[note-lists] fixed ${relative(NOTES, item.file)} (backup ${backup.split('/').pop()})\n`)
}
process.stdout.write(`[note-lists] applied ${String(total)} replacements in ${String(changed.length)} files.\n`)
