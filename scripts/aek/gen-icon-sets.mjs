#!/usr/bin/env node
/**
 * Generator for the open-source icon-set catalog (V6 round: 图标管理 → 图标大全).
 *
 * Sourcing rule (user, 2026-11-18): open-source icon data comes from GitHub
 * repositories fetched through the `gh` CLI (repo tarballs), never from the
 * Iconify web service. The Iconify public API hosts are unreliable (200 with
 * body "404", HTML placeholder pages) — recorded in the dev notes.
 *
 * Without arguments this script is a read-only dry run: it prints the planned
 * sets, the exact `gh` commands it would run, and the write targets, then
 * exits 0 with no side effects. `--download` performs the fetch, converts
 * each set's SVGs into one compact JSON catalog per set, and writes them
 * into the aek-icon-manager plugin data directory (single source of truth
 * shared by the webui panel and the `aekim` CLI).
 *
 * Usage:
 *   node scripts/aek/gen-icon-sets.mjs               # dry run (read-only)
 *   node scripts/aek/gen-icon-sets.mjs --download    # fetch + convert + write
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATA_DIR = join(REPO_ROOT, 'packages/aek/coraek-plugins/aek-icon-manager/data/icon-sets')

/**
 * One curated open-source icon set: where its SVGs live in the GitHub repo
 * and how the consuming code imports them. `usage` is the agent-handoff
 * snippet template; `{pascal}` / `{name}` are filled per icon.
 */
const SETS = [
  {
    prefix: 'lucide',
    name: 'Lucide',
    repo: 'lucide-icons/lucide',
    branch: 'main',
    svgDir: 'icons',
    npm: 'lucide-react',
    license: 'ISC',
    licenseUrl: 'https://lucide.dev/license',
    usage: "import { {pascal} } from 'lucide-react'; // <{pascal} size={18} />",
    note: 'The style the AEK framework registry (Icons.tsx) is based on.',
  },
  {
    prefix: 'tabler',
    name: 'Tabler Icons',
    repo: 'tabler/tabler-icons',
    branch: 'main',
    svgDir: 'icons/outline',
    npm: '@tabler/icons-react',
    license: 'MIT',
    licenseUrl: 'https://github.com/tabler/tabler-icons/blob/master/LICENSE',
    usage: "import { Icon{pascal} } from '@tabler/icons-react'; // <Icon{pascal} size={18} />",
    note: 'Outline variant; the filled variant (tabler-filled) is a follow-up.',
  },
  {
    prefix: 'phosphor',
    name: 'Phosphor',
    repo: 'phosphor-icons/core',
    branch: 'main',
    svgDir: 'assets/regular',
    npm: '@phosphor-icons/react',
    license: 'MIT',
    licenseUrl: 'https://github.com/phosphor-icons/core/blob/master/LICENSE',
    usage: "import { {pascal} } from '@phosphor-icons/react'; // <{pascal} size={18} weight='regular' />",
    note: 'Regular weight; the 6 phosphor weights are follow-ups.',
  },
  {
    prefix: 'heroicons',
    name: 'Heroicons',
    repo: 'tailwindlabs/heroicons',
    branch: 'master',
    svgDir: 'src/24/outline',
    npm: '@heroicons/react',
    license: 'MIT',
    licenseUrl: 'https://github.com/tailwindlabs/heroicons/blob/master/LICENSE.md',
    usage: "import { {pascal} } from '@heroicons/react/24/outline'; // <{pascal} className='h-[18px] w-[18px]' />",
    note: 'Tailwind-labs set; outline 24px variant.',
  },
  {
    prefix: 'bootstrap',
    name: 'Bootstrap Icons',
    repo: 'twbs/icons',
    branch: 'main',
    svgDir: 'icons',
    npm: 'react-bootstrap-icons',
    license: 'MIT',
    licenseUrl: 'https://github.com/twbs/icons/blob/main/LICENSE',
    usage: "import { {pascal} } from 'react-bootstrap-icons'; // <{pascal} size={18} />",
    note: 'Usage names are guidance-grade: digit-leading names (0-circle) do not map to the component name verbatim.',
  },
]

/** @param name - icon file name without extension. @returns PascalCase guidance name. */
function pascalOf(name) {
  return name
    .split(/[-_]+/)
    .filter(part => part.length > 0)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('')
}

/**
 * Read-only preview of one tarball extraction plan.
 * @param set - set descriptor.
 * @returns the lines of the dry-run plan.
 */
function planFor(set) {
  return [
    `gh api "repos/${set.repo}/tarball/${set.branch}" > <tmp>.tar.gz`,
    `tar -xzf <tmp>.tar.gz (extract ${set.svgDir}/**.svg only)`,
    `write ${join('data/icon-sets', `${set.prefix}.json`)} (repo-relative: packages/aek/coraek-plugins/aek-icon-manager)`,
  ]
}

async function main() {
  const download = process.argv.includes('--download')
  console.log(`gen-icon-sets: ${String(SETS.length)} curated sets — ${download ? 'DOWNLOAD' : 'dry run (read-only)'}\n`)
  for (const set of SETS) {
    console.log(`  ${set.prefix}  ${set.name}  (${set.repo}@${set.branch}, ${set.license}, npm ${set.npm})`)
    for (const line of planFor(set)) console.log(`      ${line}`)
  }
  if (!download) {
    console.log('\ngen-icon-sets: dry run — no files written. Pass --download to fetch and write.')
    return
  }

  mkdirSync(DATA_DIR, { recursive: true })
  const manifest = {
    protocol: 'aek-icon-sets/1',
    generatedAt: new Date().toISOString(),
    generator: 'scripts/aek/gen-icon-sets.mjs (gh CLI tarballs — GitHub source only, no web icon services)',
    sets: [],
  }
  const tempRoot = join(tmpdir(), `aek-icon-sets-${String(process.pid)}`)
  rmSync(tempRoot, { recursive: true, force: true })
  mkdirSync(tempRoot, { recursive: true })

  try {
    for (const set of SETS) {
      const tarball = join(tempRoot, `${set.prefix}.tar.gz`)
      // The tarball endpoint streams binary gzip: `-q .` would make gh parse it
      // as JSON and fail, so capture the raw stdout instead.
      const fetch = () => spawnSync('gh', ['api', `repos/${set.repo}/tarball/${set.branch}`], {
        stdio: ['ignore', 'pipe', 'inherit'],
        // The default 1MB stdout maxBuffer SIGPIPEs `gh` the moment a tarball
        // exceeds it (lucide is 3.5MB): the child dies and exits null.
        maxBuffer: 512 * 1024 * 1024,
      })
      // GitHub tarball downloads flake (one observed `gh` exit-1 on a 34MB
      // transfer that succeeds immediately after): retry with a short pause.
      let attempt = 0
      let result = fetch()
      while ((result.status !== 0 || result.stdout === undefined) && attempt < 3) {
        attempt += 1
        console.log(`  ${set.prefix}: gh fetch failed (exit ${String(result.status)}) — retry ${String(attempt)}/3 in 5s`)
        await new Promise(resolve => { setTimeout(resolve, 5_000) })
        result = fetch()
      }
      if (result.status !== 0 || result.stdout === undefined) {
        throw new Error(`gen-icon-sets: gh tarball fetch failed for ${set.repo} after 4 attempts (gh exited ${String(result.status)})`)
      }
      const bytes = result.stdout
      if (bytes.length === 0 || bytes.slice(0, 2).toString('latin1') !== '\x1f\x8b') {
        throw new Error(`gen-icon-sets: tarball for ${set.repo} is not gzip data — GitHub API error payload: ${String(bytes.slice(0, 200))}`)
      }
      writeFileSync(tarball, bytes)
      const extractTo = join(tempRoot, set.prefix)
      mkdirSync(extractTo, { recursive: true })
      const untar = spawnSync('tar', ['-xzf', tarball, '-C', extractTo], { stdio: ['ignore', 'ignore', 'inherit'] })
      if (untar.status !== 0) throw new Error(`gen-icon-sets: tar extraction failed for ${set.repo}`)
      // Tarballs unpack under a single `<repo>-<branchish>/` top directory.
      const top = readDirSafe(extractTo).find(entry => statSync(join(extractTo, entry)).isDirectory())
      if (top === undefined) throw new Error(`gen-icon-sets: no unpacked directory for ${set.repo}`)
      const svgDirAbs = join(extractTo, top, set.svgDir)
      if (!existsSync(svgDirAbs)) {
        throw new Error(`gen-icon-sets: ${set.svgDir}/ not found in ${set.repo} (branch ${set.branch}) — repo layout changed; re-point the set descriptor`)
      }
      const icons = {}
      for (const file of readDirSafe(svgDirAbs).filter(entry => entry.endsWith('.svg')).sort()) {
        const raw = readFileSync(join(svgDirAbs, file), 'utf8').trim()
        // Some sets (tabler) open with an XML declaration or license comment
        // before the <svg> tag; slice from the tag itself.
        const svgStart = raw.indexOf('<svg')
        if (svgStart === -1) continue
        icons[file.replace(/\.svg$/, '')] = raw.slice(svgStart).replace(/\s+/gu, ' ')
      }
      if (Object.keys(icons).length === 0) throw new Error(`gen-icon-sets: zero icons parsed from ${set.svgDir}/ in ${set.repo}`)
      const out = {
        protocol: 'aek-icon-set/1',
        prefix: set.prefix,
        name: set.name,
        source: set.repo,
        branch: set.branch,
        license: set.license,
        licenseUrl: set.licenseUrl,
        npm: set.npm,
        usage: set.usage,
        note: set.note,
        iconCount: Object.keys(icons).length,
        generatedAt: manifest.generatedAt,
        pascalOf,
        icons,
      }
      writeFileSync(join(DATA_DIR, `${set.prefix}.json`), `${JSON.stringify(out, null, 0)}\n`)
      manifest.sets.push({
        prefix: set.prefix,
        name: set.name,
        repo: set.repo,
        branch: set.branch,
        license: set.license,
        npm: set.npm,
        usage: set.usage,
        note: set.note,
        iconCount: out.iconCount,
        file: `${set.prefix}.json`,
      })
      console.log(`  ${set.prefix}: ${String(out.iconCount)} icons → ${join('data/icon-sets', `${set.prefix}.json`)}`)
    }
    writeFileSync(join(DATA_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`\ngen-icon-sets: wrote ${String(manifest.sets.length)} set catalogs + manifest to ${DATA_DIR}`)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

/** @param dir - directory. @returns entries, or [] when absent (caller validates layout). */
function readDirSafe(dir) {
  try {
    return readDir(dir)
  } catch {
    return []
  }
}

// Indirect so the dry-run module graph never touches the real fs lister at import time.
import { readdirSync as readDir } from 'node:fs'

main().then(() => undefined).catch(error => { console.error(String(error instanceof Error ? error.stack : error)); process.exitCode = 1 })
