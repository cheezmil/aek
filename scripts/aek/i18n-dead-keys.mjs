import { readFileSync, readdirSync } from 'node:fs'

const dir = process.argv[2]
const src = readFileSync(`${dir}/i18n.tsx`, 'utf8')
// Keys are defined in the zh/en dictionaries: `'dotted.key': '...'`
const defs = [...new Set([...src.matchAll(/^\s+'([A-Za-z0-9_.]+)'\s*:/gim)].map(m => m[1]))]
const used = new Set()
for (const f of readdirSync(dir)) {
  if (f === 'i18n.tsx' || !/\.(tsx|ts)$/.test(f)) continue
  const t = readFileSync(`${dir}/${f}`, 'utf8')
  // Schema files reference keys as bare string literals ('dotted.key')
  for (const m of t.matchAll(/\b(?:labelKey|hintKey|i18nKey|titleKey|label|hint|title)\s*:\s*'([A-Za-z0-9_.]+)'/g)) used.add(m[1])
  for (const m of t.matchAll(/\b(?:t|tf)\(\s*'([A-Za-z0-9_.]+)'/g)) used.add(m[1])
  for (const m of t.matchAll(/\b(?:t|tf)\(\s*"([A-Za-z0-9_.]+)"/g)) used.add(m[1])
}
// Dynamic keys: some code does t(`ns.${name}`) or passes variables — skip them
const dead = defs.filter(d => !used.has(d))
console.log(`defined=${new Set(defs).size} used=${used.size}`)
console.log('DEAD:', dead.join(', ') || '(none)')
