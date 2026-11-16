#!/usr/bin/env node
/**
 * release-assets.mjs — rename + prune the GITHUB cloud-release assets.
 *
 * Background (X5 round): the cloud build's first release shipped with
 * electron-builder's DEFAULT artifact names, which are per-target
 * templates that drop the arch suffix on the default arch and mix three
 * naming schemes on one page (AEK-0.1.0.dmg vs -arm64.dmg,
 * AEK.Setup.0.1.0.exe without arch, aek-desktop_*_amd64.deb dpkg style),
 * plus two kinds of junk (.blockmap differential-update descriptors —
 * we have no auto-update channel — and the builder-debug.yml CI dump).
 * The builder config now sets explicit per-arch names; this tool migrates
 * an ALREADY PUBLISHED release to the same scheme.
 *
 * Community-standard flow (github/cli discussion #3000, GitHub docs
 * "Delete a release asset"): assets cannot be renamed in place, so each
 * rename is: download the old asset → upload it under the new name →
 * delete the old asset via DELETE /repos/{o}/{r}/releases/assets/{id}.
 *
 * Usage:
 *   node scripts/aek/release-assets.mjs [--tag <tag>]
 *     Read-only. Lists the release's assets and prints the migration
 *     plan (legacy name → new name, junk to delete). Zero side effects.
 *
 *   node scripts/aek/release-assets.mjs apply [--tag <tag>]
 *     Dry run: prints the plan and exits 2 without touching anything.
 *
 *   node scripts/aek/release-assets.mjs apply --yes [--tag <tag>]
 *     Executes the migration. Idempotent: pairs where the new name is
 *     already present (or the legacy one already gone) are reported and
 *     skipped. Requires the `gh` CLI authenticated to the repo.
 *
 * The owner/repo are derived from the `github` git remote of this
 * checkout (never hardcoded): the script runs from any clone of aek.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

/**
 * Legacy artifact names → new names, version-agnostic (the version is
 * captured from the legacy file and carried over). The patterns match
 * exactly the default-template output of electron-builder 26.17 that
 * produced the current release (see electron-builder.config.mjs for the
 * scheme these map onto).
 */
const RENAMES = [
  // default-arch DMG has no suffix (x64 is the builder's default arch)
  [/^AEK-(\d+\.\d+\.\d+)\.dmg$/, (v) => `AEK-${v}-mac-x64.dmg`],
  [/^AEK-(\d+\.\d+\.\d+)-arm64\.dmg$/, (v) => `AEK-${v}-mac-arm64.dmg`],
  // GitHub-safe dotted NSIS name, x64 installer (NSIS can't target Win-ARM)
  [/^AEK\.Setup\.(\d+\.\d+\.\d+)\.exe$/, (v) => `AEK-${v}-win-x64-setup.exe`],
  // GitHub-safe dotted portable name, the arm64 binary
  [/^AEK\.(\d+\.\d+\.\d+)\.exe$/, (v) => `AEK-${v}-win-arm64-portable.exe`],
  // default-arch AppImage has no suffix (x64)
  [/^AEK-(\d+\.\d+\.\d+)\.AppImage$/, (v) => `AEK-${v}-linux-x64.AppImage`],
  [/^AEK-(\d+\.\d+\.\d+)-arm64\.AppImage$/, (v) => `AEK-${v}-linux-arm64.AppImage`],
  // dpkg-style deb names (amd64 = x64); the file name is cosmetic —
  // dpkg/apt read the control section, not the file name
  [/^aek-desktop_(\d+\.\d+\.\d+)_amd64\.deb$/, (v) => `AEK-${v}-linux-x64.deb`],
  [/^aek-desktop_(\d+\.\d+\.\d+)_arm64\.deb$/, (v) => `AEK-${v}-linux-arm64.deb`],
]

/** Junk files: never distributables, delete outright. */
const JUNK = [
  /\.blockmap$/,
  /^builder-debug\.yml$/,
]

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: REPO_ROOT })
  if (r.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed (${r.status}): ${r.stderr.trim()}`)
  }
  return r.stdout
}

function repoSlug() {
  let url
  try {
    // read-only inspection of the remote list: plain `git` (cqg has no
    // read-only `remote get-url` subcommand; no repo state is touched)
    url = spawnSync('git', ['remote', 'get-url', 'github'], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    }).stdout.trim()
  } catch {
    url = ''
  }
  if (!url) {
    console.error('[release-assets] no `github` remote — run this from an aek checkout')
    process.exit(1)
  }
  const m = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (!m) throw new Error(`cannot parse owner/repo from remote: ${url}`)
  return `${m[1]}/${m[2]}`
}

function releaseAssets(repo, tag) {
  const out = gh(['api', `repos/${repo}/releases/tags/${tag}`, '--jq', '.assets[] | {id, name, size}'])
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function planFor(assets) {
  const present = new Set(assets.map((a) => a.name))
  const byName = new Map(assets.map((a) => [a.name, a]))
  const renames = []
  const junk = []
  for (const [regex, makeNew] of RENAMES) {
    for (const a of assets) {
      const m = a.name.match(regex)
      if (!m) continue
      const newName = makeNew(m[1])
      if (present.has(newName) && !byName.has(a.name)) continue // legacy already gone
      renames.push({ old: a.name, id: a.id, size: a.size, new: newName, alreadyMigrated: present.has(newName) })
    }
  }
  for (const a of assets) {
    if (JUNK.some((re) => re.test(a.name))) junk.push(a)
  }
  return { renames, junk }
}

function printPlan({ repo, tag, assets, plan }) {
  console.log(`release ${tag} (${repo}) — ${assets.length} assets`)
  console.log('\nrename plan (download → upload new name → delete old asset):')
  for (const r of plan.renames)
    console.log(`  ${r.alreadyMigrated ? '  [already renamed, delete old]' : '↓'} ${r.old}  →  ${r.new}  (${Math.floor(r.size / 1048576)} MB)`)
  if (plan.renames.length === 0) console.log('  (none — no legacy names present)')
  console.log('\njunk to delete (not distributables):')
  for (const j of plan.junk) console.log(`  ${j.name}  (${Math.floor(j.size / 1048576)} MB)`)
  if (plan.junk.length === 0) console.log('  (none)')
}

function apply(repo, tag, plan, yes) {
  const { renames, junk } = plan
  if (!yes) {
    console.log('\n[dry-run] re-run with `apply --yes` to execute')
    process.exit(2)
  }
  const workdir = join(tmpdir(), 'aek-release-assets')
  mkdirSync(workdir, { recursive: true })

  for (const r of renames) {
    if (r.alreadyMigrated) {
      console.log(`[skip] ${r.old} → ${r.new}: new name already live, deleting the old asset`)
      gh(['api', '-X', 'DELETE', `repos/${repo}/releases/assets/${r.id}`])
      continue
    }
    const dir = join(workdir, r.new)
    mkdirSync(dirname(dir), { recursive: true })
    console.log(`↓ ${r.old} (${Math.floor(r.size / 1048576)} MB)`)
    gh(['release', 'download', tag, '--pattern', r.old, '--dir', join(workdir, 'dl')])
    const local = join(workdir, 'dl', r.old)
    if (!existsSync(local)) throw new Error(`download of ${r.old} failed`)
    console.log(`↑ ${r.new}`)
    gh(['release', 'upload', tag, local])
    gh(['api', '-X', 'DELETE', `repos/${repo}/releases/assets/${r.id}`])
    rmSync(local, { force: true })
    console.log(`✓ ${r.old} → ${r.new}`)
  }

  for (const j of junk) {
    gh(['api', '-X', 'DELETE', `repos/${repo}/releases/assets/${j.id}`])
    console.log(`✓ junk deleted: ${j.name}`)
  }
  rmSync(workdir, { recursive: true, force: true })
}

function main() {
  const argv = process.argv.slice(2)
  const applyMode = argv.includes('apply')
  const yes = argv.includes('--yes')
  const tagIdx = argv.indexOf('--tag')
  const repo = repoSlug()

  // default: the LATEST release (the tag the workflow dispatches into)
  let tag = tagIdx !== -1 ? argv[tagIdx + 1] : ''
  if (!tag) tag = gh(['api', `repos/${repo}/releases/latest`, '--jq', '.tag_name']).trim()

  const assets = releaseAssets(repo, tag)
  const plan = planFor(assets)
  printPlan({ repo, tag, assets, plan })

  if (!applyMode) {
    console.log(`\n[read-only] nothing changed. Use \`apply\` for a dry run, \`apply --yes\` to execute.`)
    return
  }

  if (plan.renames.length === 0 && plan.junk.length === 0) {
    console.log('\nnothing to migrate — the release already uses the per-arch scheme')
    return
  }
  apply(repo, tag, plan, yes)

  // verify: re-list and assert the final state
  const final = releaseAssets(repo, tag)
  const bad = final.filter((a) => JUNK.some((re) => re.test(a.name)) || RENAMES.some(([re]) => re.test(a.name)))
  if (bad.length > 0) {
    console.error(`\nverification FAILED — legacy/junk assets still present: ${bad.map((a) => a.name).join(', ')}`)
    process.exit(1)
  }
  console.log(`\n=== final assets (${final.length}) ===`)
  for (const a of final.sort((x, y) => x.name.localeCompare(y.name)))
    console.log(`  ${a.name}  (${Math.floor(a.size / 1048576)} MB)`)
  console.log('\ndone.')
}

main()
