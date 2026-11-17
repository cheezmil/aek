/**
 * gen-icon-manifest — sync the aek-icon-manager data file with the host's
 * icon registry (IV round).
 *
 * Source of truth: `apps/aek-web/src/Icons.tsx` — the `IconName` union is
 * the registry's name list, and every name gets a stable agent-handoff
 * usage line. The manifest feeds the `aekim` CLI
 * (`packages/aek/coraek-plugins/aek-icon-manager/data/icons.json`); the
 * webui panel reads the registry in-process, so the two faces stay in sync
 * as long as this file is regenerated when `Icons.tsx` changes.
 *
 * SAFETY: no arguments = read-only diff + report (the repo's
 * zero-arg-dry-run convention). `--write` updates the data file.
 *
 * @module aek/scripts/aek/gen-icon-manifest
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..', '..')
const registryPath = path.join(root, 'apps', 'aek-web', 'src', 'Icons.tsx')
const manifestPath = path.join(root, 'packages', 'aek', 'coraek-plugins', 'aek-icon-manager', 'data', 'icons.json')

const registry = readFileSync(registryPath, 'utf8')

/** The flat `IconName` union body — the registry's name list. */
const union = registry.match(/export type IconName =\n([\s\S]*?)\n\n/)?.[1] ?? ''
const names = [...union.matchAll(/'([a-zA-Z]+)'/g)].map(match => match[1])
if (names.length === 0) {
  console.error(`gen-icon-manifest: no IconName union found in ${registryPath}`)
  process.exit(1)
}
// Sanity: the fragment map must carry every union member exactly once.
const fragmentBlock = registry.slice(registry.indexOf('export const ICONS: Record<IconName, ReactNode>'))
for (const name of names) {
  const hit = new RegExp(`^  ${name}:`, 'm').test(fragmentBlock)
  if (!hit) console.error(`gen-icon-manifest: WARNING — ${name} is in the IconName union but has no ICONS fragment`)
}

/** One usage line in the exact shape the webui panel copies. */
const usage = name => `<Icon name="${name}" size={18} />`

const manifest = {
  generatedFrom: 'apps/aek-web/src/Icons.tsx',
  generatedAt: new Date().toISOString(),
  source: 'apps/aek-web/src/Icons.tsx (the host webui registry — import { Icon } from it in the host tree)',
  style: 'Lucide stroke style, 24×24 viewBox, stroke-width 2, ISC license (https://lucide.dev/license)',
  usageHeader: 'AEK frontend icons (registry apps/aek-web/src/Icons.tsx, Lucide stroke style, 24×24 viewBox; usage <Icon name="…" size={18} />):',
  icons: names.map(name => ({ name, usage: usage(name) })),
}

const write = process.argv.includes('--write')
if (write) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`gen-icon-manifest: wrote ${manifestPath} (${names.length} icons)`)
  process.exit(0)
}

if (!existsSync(manifestPath)) {
  console.log(`gen-icon-manifest: ${names.length} icons in the registry; no manifest yet at ${manifestPath}\nrun with --write to create it`)
  process.exit(0)
}
const current = JSON.parse(readFileSync(manifestPath, 'utf8'))
const stale = Array.isArray(current.icons) && current.icons.map(icon => icon.name).join('\0') !== names.join('\0')
if (stale) {
  const missing = names.filter(name => !current.icons.some(icon => icon.name === name))
  const extra = (current.icons ?? []).map(icon => icon.name).filter(name => !names.includes(name))
  console.log(`gen-icon-manifest: STALE — registry has ${names.length} icons, manifest ${current.icons?.length ?? 0}`)
  if (missing.length > 0) console.log(`  missing from manifest: ${missing.join(', ')}`)
  if (extra.length > 0) console.log(`  only in manifest (removed from registry): ${extra.join(', ')}`)
  console.log('run with --write to sync it')
  process.exit(0)
}
console.log(`gen-icon-manifest: in sync (${names.length} icons)`)
