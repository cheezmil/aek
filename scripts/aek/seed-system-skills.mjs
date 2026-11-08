#!/usr/bin/env node
/**
 * Seed the EXTRA AEK system skills into the AEK slot's hub.
 *
 * `packages/aek/coraek-plugins/aek-skill-manager/aek-system-ohter-skills/`
 * holds the system skills that are NOT bundled inside a plugin's own
 * `skills/` directory. Every subdirectory containing a `SKILL.md` here is
 * copied to `<AEK_HOME>/skill-manager/aek-system-skill/<name>/`, which is the
 * path the console shows as the copyable skill path.
 *
 * `aek-system-skills.yml` declares the names so `aeksm doctor` / bootstrap
 * never quarantine them as undeclared. We do NOT extend the manifest parser:
 * that package has its own behavior tests and a `seed: false` rule for the
 * manager skill, so a separate, explicit seeder is the smaller and safer seam.
 *
 * SAFETY: no arguments = read-only plan, zero side effects. `--yes` performs
 * the copy. A changed hub copy is first staged, verified, then the old copy is
 * moved to `.backups/` (never deleted) before the new one is swapped in. On
 * failure the backup is restored.
 *
 * @module scripts/aek/seed-system-skills
 */
import { createHash } from 'node:crypto'
import { cpSync as copyDirSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slotHome } from '../../packages/aek/base/coraek/slots.mjs'

/** Walk up from this script to the workspace root. */
function findRoot(start) {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error('workspace root not found (pnpm-workspace.yaml)')
    dir = parent
  }
}

const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)))
const SOURCE = join(ROOT, 'packages', 'aek', 'coraek-plugins', 'aek-skill-manager', 'aek-system-ohter-skills')
const HUB = join(slotHome('aek'), 'skill-manager', 'aek-system-skill')
const STAMP = new Date().toISOString().replace(/[-:.TZ]/gu, '')

/** Hash one directory's files, so an unchanged hub copy is left alone. */
function fingerprint(dir) {
  const hash = createHash('sha256')
  const walk = current => {
    for (const name of readdirSync(current).sort()) {
      const file = join(current, name)
      if (!statSync(file).isFile()) continue
      hash.update(name)
      hash.update(readFileSync(file))
    }
  }
  walk(dir)
  return hash.digest('hex')
}

/** @returns the skill directories that carry a SKILL.md. */
function skills() {
  if (!existsSync(SOURCE)) return []
  return readdirSync(SOURCE, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(SOURCE, entry.name, 'SKILL.md')))
    .map(entry => entry.name)
    .sort()
}

const yes = process.argv.includes('--yes')
const names = skills()
if (names.length === 0) {
  process.stdout.write('[seed] no extra system skills found; nothing to do\n')
  process.exit(0)
}

const planned = names.map(name => {
  const source = join(SOURCE, name)
  const target = join(HUB, name)
  const exists = existsSync(join(target, 'SKILL.md'))
  const same = exists && fingerprint(source) === fingerprint(target)
  return { name, source, target, action: same ? 'up-to-date' : (exists ? 'refresh' : 'seed') }
})

process.stdout.write(`[seed] mode = ${yes ? 'EXECUTE' : 'DRY RUN (no side effects)'}\n`)
process.stdout.write(`[seed] source = ${SOURCE}\n`)
process.stdout.write(`[seed] hub    = ${HUB}\n`)
for (const item of planned) {
  process.stdout.write(`  - ${item.name}: ${item.action} → ${item.target}\n`)
}
if (!yes) {
  process.stdout.write('[seed] dry run complete; pass --yes to seed.\n')
  process.exit(0)
}

mkdirSync(HUB, { recursive: true })
const backups = join(HUB, '.backups')
mkdirSync(backups, { recursive: true })

for (const item of planned) {
  if (item.action === 'up-to-date') {
    process.stdout.write(`[seed] ${item.name}: up-to-date\n`)
    continue
  }
  const staging = join(HUB, `.staging-${item.name}-${STAMP}`)
  let backup
  try {
    rmSync(staging, { recursive: true, force: true })
    copyDirSync(item.source, staging, { recursive: true })
    if (!existsSync(join(staging, 'SKILL.md'))) throw new Error('staged copy has no SKILL.md')
    // Prepare the new resource and validate it BEFORE touching the old one.
    if (existsSync(item.target)) {
      backup = join(backups, `${item.name}.bak.${STAMP}`)
      renameSync(item.target, backup)
    }
    renameSync(staging, item.target)
    process.stdout.write(`[seed] ${item.name}: ${item.action} ok${backup ? ` (old copy → ${backup})` : ''}\n`)
  } catch (error) {
    // Roll back to the state before this item: never leave "old gone, new absent".
    try { if (backup && existsSync(backup) && !existsSync(item.target)) renameSync(backup, item.target) } catch { /* report below */ }
    try { rmSync(staging, { recursive: true, force: true }) } catch { /* best effort */ }
    process.stderr.write(`[seed] ${item.name}: FAILED ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
process.stdout.write('[seed] done\n')
