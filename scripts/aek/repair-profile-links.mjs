#!/usr/bin/env node
/**
 * Repair profile package links after the data root gained a container level.
 *
 * A dsh profile is a tiny pnpm workspace under `<data root>/profiles/<name>/`.
 * Its `package.json` points at this checkout with `link:` specs and its
 * `node_modules/@cheezmil/*` entries are RELATIVE symlinks. Both were written
 * for `~/.aek/profiles/web/…`; once the root moved to `~/.aek/current/`, every
 * one of those relative paths is one level short and resolves to a directory
 * that does not exist. The symptom is subtle: the web server boots and serves
 * the page shell, but every AEK plugin fails to import and all `/api/aek/*`
 * routes answer 404.
 *
 * The fix is layout-independent: each link is re-pointed at the package it
 * names, computed with `relative()` from where the link actually lives. Nothing
 * is guessed from string prefixes, so the script keeps working if the container
 * moves again.
 *
 * SAFETY: read-only by default (prints the plan), `--yes` applies it. Every
 * `package.json` it rewrites is first copied to
 * `package.json.bak.<ts>-pre-relink` in the same directory.
 *
 * Usage:
 *   node scripts/aek/repair-profile-links.mjs            # plan, read-only
 *   node scripts/aek/repair-profile-links.mjs --yes      # repair
 */
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLOTS, slotHome } from '../../packages/aek/base/coraek/slots.mjs'

const APPLY = process.argv.includes('--yes')
const HERE = dirname(fileURLToPath(import.meta.url))

/** @param {string} start @returns {string} */
function findProjectRoot(start) {
  let dir = start
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}

const PROJECT_ROOT = findProjectRoot(HERE)
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'lib', 'coverage'])

/** Walk the workspace packages and return `package name -> directory`. */
function packageIndex() {
  /** @type {Map<string, string>} */
  const index = new Map()
  /** @param {string} dir */
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    if (entries.some((e) => e.isFile() && e.name === 'package.json')) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        if (typeof pkg.name === 'string') index.set(pkg.name, dir)
      } catch { /* unreadable manifest: not a package we can point at */ }
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      walk(join(dir, entry.name))
    }
  }
  walk(join(PROJECT_ROOT, 'packages'))
  return index
}

const PACKAGES = packageIndex()

/** @param {string} p @returns {boolean} */
function exists(p) { return existsSync(p) }

/** @param {string} p @returns {boolean} */
function isLink(p) {
  try { return lstatSync(p).isSymbolicLink() } catch { return false }
}

/** @param {string} p @returns {boolean} */
function isDir(p) {
  try { return statSync(p).isDirectory() } catch { return false }
}

/**
 * Resolve a `link:`/`file:` spec to a package directory, or `null`.
 * @param {string} spec - the dependency spec.
 * @param {string} profileDir - the profile that owns the manifest.
 * @returns {string | null}
 */
function targetForSpec(spec, profileDir) {
  const raw = spec.replace(/^(?:link|file):/u, '')
  const absolute = resolve(profileDir, raw)
  if (isDir(absolute)) return absolute
  // Broken: the spec is one level short after the layout change. Recover the
  // intent from its tail — the trailing workspace-relative path — and re-anchor
  // it at the project root.
  const parts = raw.split('/').filter((p) => p !== '' && p !== '.' && p !== '..')
  for (let i = 0; i < parts.length; i++) {
    const candidate = join(PROJECT_ROOT, ...parts.slice(i))
    if (isDir(candidate)) return candidate
  }
  return null
}

/** @param {string} dir @returns {string} */
function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`
}

/** @type {string[]} */
const changes = []
/** @type {string[]} */
const problems = []

/**
 * Repair one profile directory.
 * @param {string} profileDir - absolute profile path.
 * @param {string} label - slot/profile label for messages.
 */
function repairProfile(profileDir, label) {
  const manifestPath = join(profileDir, 'package.json')
  if (!exists(manifestPath)) return

  let manifest
  let original
  try {
    original = readFileSync(manifestPath, 'utf8')
    manifest = JSON.parse(original)
  } catch (error) {
    problems.push(`${label}: unreadable package.json (${/** @type {Error} */ (error).message})`)
    return
  }

  let dirty = false
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = manifest[field]
    if (deps === null || typeof deps !== 'object') continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string' || !/^(?:link|file):/u.test(spec)) continue
      const target = targetForSpec(spec, profileDir)
      if (target === null) {
        problems.push(`${label}: ${name} -> ${spec} (target not found)`)
        continue
      }
      const wanted = `link:${relative(profileDir, target).split('\\').join('/')}`
      if (wanted === spec) continue
      changes.push(`${label}: ${name}  ${spec}  ->  ${wanted}`)
      deps[name] = wanted
      dirty = true
    }
  }

  if (dirty) {
    if (APPLY) {
      copyFileSync(manifestPath, `${manifestPath}.bak.${stamp()}-pre-relink`)
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    }
  }

  // node_modules/@cheezmil/* and any other relative symlink into the checkout.
  const modules = join(profileDir, 'node_modules')
  if (!isDir(modules)) return
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    const paths = []
    if (entry.isSymbolicLink()) paths.push(join(modules, entry.name))
    else if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const child of readdirSync(join(modules, entry.name), { withFileTypes: true })) {
        if (child.isSymbolicLink()) paths.push(join(modules, entry.name, child.name))
      }
    }
    for (const linkPath of paths) {
      const current = readlinkSync(linkPath)
      const absolute = resolve(dirname(linkPath), current)
      if (isDir(absolute)) continue
      /** @type {string | undefined} */
      let target
      const name = relative(modules, linkPath).split('/').filter((p) => !p.startsWith('@')).pop()
      if (name !== undefined && PACKAGES.has(name)) target = PACKAGES.get(name)
      if (target === undefined) {
        const parts = current.split('/').filter((p) => p !== '' && p !== '.' && p !== '..')
        for (let i = 0; i < parts.length && target === undefined; i++) {
          const candidate = join(PROJECT_ROOT, ...parts.slice(i))
          if (isDir(candidate)) target = candidate
        }
      }
      if (target === undefined) {
        problems.push(`${label}: broken symlink ${relative(profileDir, linkPath)} -> ${current}`)
        continue
      }
      const wanted = relative(dirname(linkPath), target).split('\\').join('/')
      changes.push(`${label}: symlink ${relative(profileDir, linkPath)}  ->  ${wanted}`)
      if (APPLY) {
        unlinkSync(linkPath)
        symlinkSync(wanted, linkPath)
      }
    }
  }
}

for (const slot of Object.keys(SLOTS)) {
  const profilesDir = join(slotHome(slot), 'profiles')
  if (!isDir(profilesDir)) continue
  for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    repairProfile(join(profilesDir, entry.name), `${slot}/${entry.name}`)
  }
}

for (const line of changes) console.log(`${APPLY ? 'FIXED ' : 'WOULD '} ${line}`)
for (const line of problems) console.error(`PROBLEM  ${line}`)
console.log('')
if (changes.length === 0 && problems.length === 0) {
  console.log('all profile links already resolve; nothing to do.')
} else if (APPLY) {
  console.log(`repaired ${String(changes.length)} link(s), ${String(problems.length)} problem(s).`)
  if (problems.length > 0) process.exitCode = 1
} else {
  console.log(`dry run: ${String(changes.length)} link(s) to repair, ${String(problems.length)} problem(s). Re-run with --yes to apply.`)
}
