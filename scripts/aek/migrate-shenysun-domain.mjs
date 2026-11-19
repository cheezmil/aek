#!/usr/bin/env node
/**
 * One-time (re-runnable) migration helper: port the shenysun skills-manager
 * dashboard "domain" tier (pure TS UI-state logic + its vitest specs) into
 * @cheezmil/aek-web.
 *
 * Provenance: ~/MyDurio/aek-skill-manager-candidates/shenysun-skills-manager
 * (MIT; already recorded in packages/aek/coraek-plugins/aek-skill-manager/NOTICE).
 * Only the framework-free `dashboard-web/src/domain/` tier is copied. The Vue
 * component tier and the fastify server tier are intentionally NOT ported
 * (P15: we borrow the webui tier only; host service + in-process engine stay
 * on the aek-skill-manager plugin).
 *
 * Layout target:
 *   apps/aek-web/src/skill-manager/domain/*.ts        (18 modules, .test.ts excluded)
 *   apps/aek-web/src/skill-manager/domain/types.ts    (3 shared wire types, cut from api/client.ts)
 *   apps/aek-web/tests/skill-manager/*.spec.ts       (18 specs, .test.ts renamed .spec.ts)
 *
 * Import rewrites:
 *   src modules:   from '../api/client'  ->  from './types'
 *   spec files:    from './<m>'           ->  from '../../src/skill-manager/domain/<m>'
 *                  from '../api/client'  ->  from '../../src/skill-manager/domain/types'
 *
 * Usage:
 *   node scripts/aek/migrate-shenysun-domain.mjs                 # read-only: print plan, write nothing
 *   node scripts/aek/migrate-shenysun-domain.mjs --from <dir>   # point at a different dashboard-web/src
 *   node scripts/aek/migrate-shenysun-domain.mjs --from <dir> --yes   # actually copy + rewrite
 *
 * No arguments is a safe read-only no-op (repo rule: default is safe/read-only).
 * <dir> must contain a `domain/` subdirectory; it is provided by the operator,
 * never hardcoded here.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const repo = root

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const optVal = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const yes = flag('--yes')
const fromArg = optVal('--from')

// The shenysun repo lives OUTSIDE this repository (an operator-local clone).
// It is never hardcoded into source; the operator passes it via --from.
const from = fromArg ? path.resolve(fromArg) : undefined
const fromDomain = from ? path.join(from, 'domain') : undefined
const fromApi = from ? path.join(from, 'api') : undefined

const toSrcDomain = path.join(repo, 'apps/aek-web/src/skill-manager/domain')
const toTests = path.join(repo, 'apps/aek-web/tests/skill-manager')

const TYPES_HEADER = [
  '/**',
  ' * Shared wire types cut from shenysun skills-manager `dashboard-web/src/api/client.ts`',
  ' * (MIT; provenance in packages/aek/coraek-plugins/aek-skill-manager/NOTICE).',
  ' * Only the three types the domain tier consumes are mirrored here so the domain',
  ' * stays framework-free; the fetch layer (`api()`) is intentionally not ported -',
  ' * our webui talks to the aek-skill-manager host service, not a fastify endpoint.',
  ' */',
  '',
].join('\n')

const buildTypesModule = () => {
  const client = readFileSync(path.join(fromApi, 'client.ts'), 'utf8')
  // Grab `export type NAME = …` up to the semicolon that balances the type's
  // braces (single-line aliases and multi-line object types alike).
  const grab = (name) => {
    const lines = client.split('\n')
    const start = lines.findIndex((l) => l.startsWith(`export type ${name} =`))
    if (start < 0) throw new Error(`type ${name} not found in api/client.ts`)
    let depth = 0
    let ended = false
    let out = []
    for (let i = start; i < lines.length; i++) {
      const l = lines[i]
      out.push(l)
      for (const ch of l) {
        if (ch === '{' || ch === '(') depth++
        else if (ch === '}' || ch === ')') depth--
      }
      if (depth <= 0 && /;?\s*$/.test(l)) {
        if (l.trimEnd().endsWith(';') || l.trim().endsWith('};')) {
          ended = true
          break
        }
        if (i === start) break // single-line alias ending in `;`
      }
      if (depth === 0 && i > start && l.trimEnd() === '};') {
        ended = true
        break
      }
    }
    if (!ended) throw new Error(`type ${name}: could not find closing boundary`)
    return out.join('\n')
  }
  return (
    TYPES_HEADER +
    [grab('UrlPayloadFormat'), grab('DiscoveredSkill'), grab('MarketplacePlugin')].join('\n\n') +
    '\n'
  )
}

/** Rewrite import specifiers in one file's source text. */
const rewriteSrc = (text) =>
  text.replace(/from\s+['"]\.\.\/api\/client['"]/g, "from './types'")

const rewriteSpec = (text, allModules) =>
  text
    .replace(
      new RegExp(
        `from\\s+['"]\\.\\/(${allModules.join('|')})['"]`,
        'g',
      ),
      (match, mod) => `from '../../src/skill-manager/domain/${mod}'`,
    )
    .replace(/from\s+['"]\.\.\/api\/client['"]/g, "from '../../src/skill-manager/domain/types'")

// ── Plan (always computed) ────────────────────────────────────────────────
if (!from || !fromDomain || !existsSync(fromDomain)) {
  console.log(
    'migrate-shenysun-domain: read-only plan (no --from, or --from has no domain/).\n' +
      '  run with:  node scripts/aek/migrate-shenysun-domain.mjs --from <dashboard-web/src> [--yes]\n' +
      '  target src : apps/aek-web/src/skill-manager/domain/  (modules + types.ts)\n' +
      '  target spec: apps/aek-web/tests/skill-manager/       (*.test.ts -> *.spec.ts)',
  )
  process.exit(0)
}

const modules = readdirSync(fromDomain).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort()
const specs = readdirSync(fromDomain).filter((f) => f.endsWith('.test.ts')).sort()

console.log(`migrate-shenysun-domain: ${modules.length} domain modules, ${specs.length} specs`)
for (const m of modules) console.log(`  src   domain/${m}`)
for (const s of specs) console.log(`  spec  tests/skill-manager/${s.replace('.test.ts', '.spec.ts')}`)
console.log('  + src/skill-manager/domain/types.ts (3 wire types, cut from api/client.ts)')

if (!yes) {
  console.log('\nread-only plan only. Re-run with --yes to copy and rewrite.')
  process.exit(0)
}

// ── Apply ─────────────────────────────────────────────────────────────────
mkdirSync(toSrcDomain, { recursive: true })
mkdirSync(toTests, { recursive: true })
writeFileSync(path.join(toSrcDomain, 'types.ts'), buildTypesModule(), 'utf8')

for (const m of modules) {
  const text = rewriteSrc(readFileSync(path.join(fromDomain, m), 'utf8'))
  writeFileSync(path.join(toSrcDomain, m), text, 'utf8')
}

for (const s of specs) {
  const modName = s.replace('.test.ts', '')
  // all known target module bases (domain modules + the generated types.ts),
  // so cross-module `./selection`-style imports in a spec also resolve.
  const text = rewriteSpec(readFileSync(path.join(fromDomain, s), 'utf8'), [
    ...modules.map((m) => m.replace('.ts', '')),
    'types',
  ])
  writeFileSync(path.join(toTests, `${modName}.spec.ts`), text, 'utf8')
}

// ── Style normalization ─────────────────────────────────────────────────
// shenysun writes with semicolons; this repo is `@stylistic/semi: never`
// (oxlint). Each `--fix` pass may leave cascades the next pass clears, and
// exits 1 while anything remains — so fix passes ignore the exit code and
// the final read-only check is what must be clean (exit 0).
const { spawnSync } = await import('node:child_process')
const LINT_TARGETS = ['apps/aek-web/src/skill-manager/', 'apps/aek-web/tests/skill-manager/']
for (let pass = 1; pass <= 3; pass++) {
  spawnSync('npx', ['oxlint', ...LINT_TARGETS, '--fix'], { cwd: repo, stdio: 'inherit' })
}
const check = spawnSync('npx', ['oxlint', ...LINT_TARGETS], { cwd: repo, stdio: 'inherit' })
if (check.status !== 0) throw new Error('oxlint check after fix: errors remain')

console.log('\nstyle: oxlint --fix + clean check')
console.log('next: run the aek-web domain specs via the repo vitest, then wire the panel (BG-3).')
