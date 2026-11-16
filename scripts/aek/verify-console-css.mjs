#!/usr/bin/env node
/**
 * Static check (FF round, 2026-11-17): the AEK console has fully migrated to
 * Tailwind CSS v4 — `apps/aek-web` must have ZERO CSS Modules residue:
 *   1. no `*.module.css` files under `apps/aek-web/src`
 *   2. no imports of `*.module.css` anywhere in the console source
 *   3. no `css.<key>` module-map member access in the console source
 *
 * This gate's predecessor (2026-11-09) verified that every `css.*` key used
 * by the console had a rule in `Home.module.css` (a missing key rendered as
 * `undefined` and silently dropped a className). The 11-07 "CSS Modules
 * only" stack decision was overruled by the user in the FF round, the
 * console now styles with Tailwind utilities enforced by `@shadcn/lint`, and
 * this gate proves the migration is complete: once module CSS is gone there
 * is nothing left for the old missing-key failure class to bite.
 *
 * READ-ONLY; exits 1 while any residue remains so it gates the FF migration
 * close-out. `--json` prints machine-readable output.
 *
 * Usage:
 *   node scripts/aek/verify-console-css.mjs            # report (exit 1 on residue)
 *   node scripts/aek/verify-console-css.mjs --json
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENT = join(HERE, '..', '..', 'apps', 'aek-web', 'src')
const json = process.argv.includes('--json')

/** @returns {string[]} */
function listFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full))
    else out.push(full)
  }
  return out
}

const violations = []

// 1. module CSS files must not exist.
for (const file of listFiles(CLIENT)) {
  if (file.endsWith('.module.css')) violations.push(`${join('apps/aek-web', file.slice(CLIENT.length + 1))}: CSS Modules file residue — the FF migration styles with Tailwind utilities`)
}

// 2. no imports of module CSS + 3. no css.* member access.
for (const file of listFiles(CLIENT)) {
  if (!/\.(?:ts|tsx|mjs|js|jsx)$/.test(file)) continue
  const text = readFileSync(file, 'utf-8')
  const rel = `apps/aek-web/${file.slice(CLIENT.length + 1)}`
  for (const match of text.matchAll(/['"]\.[^'"]*\.module\.css['"]/gu)) {
    violations.push(`${rel}: imports ${match[0]} — CSS Modules residue`)
  }
  // `css.` is only residue when it is a BARE identifier member access —
  // "index.css." / "module.css." in comments or strings are false positives.
  for (const match of text.matchAll(/(?<![\w.])css\.[A-Za-z_$][\w$]*/gu)) {
    violations.push(`${rel}: ${match[0]} — css.* module-map access residue`)
  }
}

if (json) {
  console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2))
} else {
  console.log(`[css] aek-web CSS Modules residue check (FF migration proof)`)
  if (violations.length === 0) console.log('[css] zero residue: no *.module.css, no module imports, no css.* access')
  for (const line of violations) console.log(`RESIDUE  ${line}`)
}
process.exit(violations.length === 0 ? 0 : 1)
