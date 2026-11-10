#!/usr/bin/env node
/**
 * Seed the EXTRA AEK system skills into each slot's hub.
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
 * WHY BOTH SLOTS: this used to hard-wire `slotHome('aek')`, so `next` never
 * received the system skills at all. Anyone developing in the next slot then
 * saw a half-populated hub and hand-copied folders into it — which is exactly
 * how the two slots started drifting apart. The default is now `both`; a
 * single slot stays available for tests.
 *
 * SAFETY: no arguments = read-only plan, zero side effects. `--yes` performs
 * the copy. A changed hub copy is first staged, verified, then the old copy is
 * moved to `.backups/` (never deleted) before the new one is swapped in. On
 * failure the backup is restored. Symlinks inside a skill are preserved as
 * links (never dereferenced).
 *
 * Usage:
 *   node scripts/aek/seed-system-skills.mjs                     # plan, both slots
 *   node scripts/aek/seed-system-skills.mjs --slot next         # plan, one slot
 *   node scripts/aek/seed-system-skills.mjs --yes               # seed both slots
 *   node scripts/aek/seed-system-skills.mjs --yes --slot aek
 *
 * @module scripts/aek/seed-system-skills
 */
import { createHash } from 'node:crypto'
import { cpSync as copyDirSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOT_NAMES, slotHome } from '../../packages/aek/base/coraek/slots.mjs'

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
const STAMP = new Date().toISOString().replace(/[-:.TZ]/gu, '')

/**
 * Parse `--slot aek|next|both`. Defaults to every slot: a seeder that only
 * feeds one slot guarantees the other one drifts.
 * @returns {('aek' | 'next')[]} the target slots, in canonical order.
 */
function parseSlots() {
  const i = process.argv.indexOf('--slot')
  if (i === -1) return [...SLOT_NAMES]
  const raw = (process.argv[i + 1] ?? '').trim()
  if (raw === 'both') return [...SLOT_NAMES]
  if (!SLOT_NAMES.includes(raw)) {
    throw new Error(`--slot must be one of ${SLOT_NAMES.join(' | ')} | both (got "${raw}")`)
  }
  return [/** @type {'aek' | 'next'} */ (raw)]
}

/** Hash one directory's files, so an unchanged hub copy is left alone. */
function fingerprint(dir) {
  const hash = createHash('sha256')
  const walk = current => {
    for (const name of readdirSync(current).sort()) {
      const file = join(current, name)
      // A symlink is hashed as its target text: dereferencing would make two
      // different links to the same file look identical.
      const stat = statSync(file, { throwIfNoEntry: false })
      if (!stat || stat.isDirectory()) continue
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
const targets = parseSlots()
const names = skills()
if (names.length === 0) {
  process.stdout.write('[seed] no extra system skills found; nothing to do\n')
  process.exit(0)
}

process.stdout.write(`[seed] mode   = ${yes ? 'EXECUTE' : 'DRY RUN (no side effects)'}\n`)
process.stdout.write(`[seed] source = ${SOURCE}\n`)
process.stdout.write(`[seed] slots  = ${targets.join(' + ')}\n`)

/** @type {Map<string, { name: string, source: string, target: string, action: string }[]>} */
const plan = new Map()
for (const slot of targets) {
  const hub = join(slotHome(slot), 'skill-manager', 'aek-system-skill')
  plan.set(
    slot,
    names.map(name => {
      const source = join(SOURCE, name)
      const target = join(hub, name)
      const exists = existsSync(join(target, 'SKILL.md'))
      const same = exists && fingerprint(source) === fingerprint(target)
      return { name, source, target, action: same ? 'up-to-date' : (exists ? 'refresh' : 'seed') }
    }),
  )
  process.stdout.write(`[seed]   ${slot.padEnd(4)} hub = ${hub}\n`)
  for (const item of plan.get(slot)) {
    process.stdout.write(`  - [${slot}] ${item.name}: ${item.action}\n`)
  }
}

if (!yes) {
  process.stdout.write('[seed] dry run complete; pass --yes to seed.\n')
  process.exit(0)
}

for (const [slot, items] of plan) {
  const hub = join(slotHome(slot), 'skill-manager', 'aek-system-skill')
  mkdirSync(hub, { recursive: true })
  const backups = join(hub, '.backups')
  mkdirSync(backups, { recursive: true })

  for (const item of items) {
    if (item.action === 'up-to-date') {
      process.stdout.write(`[seed] [${slot}] ${item.name}: up-to-date\n`)
      continue
    }
    const staging = join(hub, `.staging-${item.name}-${STAMP}`)
    let backup
    try {
      rmSync(staging, { recursive: true, force: true })
      // `dereference:false` (the default) keeps symlinks as symlinks: a skill
      // that links a file from the checkout must stay linked, not be expanded.
      copyDirSync(item.source, staging, { recursive: true, dereference: false })
      if (!existsSync(join(staging, 'SKILL.md'))) throw new Error('staged copy has no SKILL.md')
      // Prepare the new resource and validate it BEFORE touching the old one.
      if (existsSync(item.target)) {
        backup = join(backups, `${item.name}.bak.${STAMP}`)
        renameSync(item.target, backup)
      }
      renameSync(staging, item.target)
      process.stdout.write(`[seed] [${slot}] ${item.name}: ${item.action} ok${backup ? ` (old copy → ${backup})` : ''}\n`)
    } catch (error) {
      // Roll back to the state before this item: never leave "old gone, new absent".
      try { if (backup && existsSync(backup) && !existsSync(item.target)) renameSync(backup, item.target) } catch { /* report below */ }
      try { rmSync(staging, { recursive: true, force: true }) } catch { /* best effort */ }
      process.stderr.write(`[seed] [${slot}] ${item.name}: FAILED ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    }
  }
}
process.stdout.write('[seed] done\n')
