#!/usr/bin/env node
/**
 * Static check: every `css.<name>` used by the AEK console client must have a
 * rule in `Home.module.css`.
 *
 * Why this exists (2026-11-09): two classes — `.accessActions` and
 * `.accessTextarea` — were referenced from JSX but had NO rule in the module
 * file. `css` is a small lookup object, so a missing key silently yields
 * `undefined`: the element renders with no class, which is exactly how the
 * settings page ended up with a button glued to the hint above it and a
 * 140px-wide textarea. TypeScript cannot catch it because the lookup accepts
 * any string.
 *
 * READ-ONLY by default; exits 1 when something is missing so it can be used as
 * a gate. `--json` prints machine-readable output.
 *
 * Usage:
 *   node scripts/aek/verify-console-css.mjs            # report (exit 1 on miss)
 *   node scripts/aek/verify-console-css.mjs --json
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENT = join(HERE, '..', '..', 'packages', 'aek', 'coraek-plugins', 'aek-home', 'src', 'client')
const CSS_FILE = join(CLIENT, 'Home.module.css')
const json = process.argv.includes('--json')

const cssText = readFileSync(CSS_FILE, 'utf-8')
// Class names in the module, ignoring anything inside a comment.
const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '')
const defined = new Set([...stripped.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => match[1]))

const sources = readdirSync(CLIENT).filter(name => name.endsWith('.tsx'))
const used = new Map()
for (const name of sources) {
  const text = readFileSync(join(CLIENT, name), 'utf-8')
  for (const match of text.matchAll(/\bcss\.([A-Za-z_][\w]*)/g)) {
    const key = match[1]
    if (!used.has(key)) used.set(key, new Set())
    used.get(key).add(name)
  }
}

const missing = [...used.keys()].filter(key => !defined.has(key)).sort()
const unused = [...defined].filter(key => !used.has(key)).sort()

if (json) {
  console.log(JSON.stringify({ checked: used.size, missing, unused }, null, 2))
} else {
  console.log(`[css] ${String(sources.length)} tsx files, ${String(used.size)} css.* keys, ${String(defined.size)} class rules`)
  if (missing.length === 0) console.log('[css] every css.* key has a rule')
  for (const key of missing) console.log(`MISSING  .${key}  used by ${[...(used.get(key) ?? [])].join(', ')}`)
  if (unused.length > 0) console.log(`[css] ${String(unused.length)} unused rule(s): ${unused.join(', ')}`)
}
process.exit(missing.length === 0 ? 0 : 1)
