#!/usr/bin/env node
/**
 * verify-builder-config.mjs — validate the electron-builder config against the
 * INSTALLED builder schema, for every host shape, before pushing to CI.
 *
 * Background: 2026-11-16 (X5b) — the cloud build failed on config/schema
 * mistakes that local `import`-and-print never caught:
 * (a) `pnpm --filter aek-desktop build` (the CI tsc gate) is the gate that
 *     must run after electron-layer changes (retro section 112, 白干 1), and
 * (b) per-arch `artifactName` was put ON TARGET ENTRIES — 26.17's scheme
 *     (`app-builder-lib/scheme.json`) only allows `{ target, arch }` there
 *     (`TargetConfiguration`, additionalProperties: false), so the PACKAGING
 *     step (`Packager.build` → `validateConfiguration`) blew up while the
 *     config module itself imported fine.
 *
 * This script closes both blind spots mechanically:
 *   1. Runs the SAME `validateConfiguration` (app-builder-lib, installed in
 *      this repo) the CI packaging step runs, against the config as each of
 *      the three hosts (darwin / win32 / linux) would assemble it — host
 *      blocks are gated on `process.platform` inside the config, so each
 *      shape is produced by re-importing the config module with a spoofed
 *      platform.
 *   2. Prints the expected release file names by expanding each
 *      target-type section's `artifactName` template the way the builder
 *      does (`getArtifactArchName`: dmg/exe → x64/arm64, AppImage →
 *      x86_64/arm64, deb → amd64/arm64) — and for linux, also the name
 *      after the workflow's "Unify arch labels" step (x86_64/amd64 → x64,
 *      user ruling 2026-11-16), so the release-page names are visible
 *      locally instead of only after the cloud build.
 *
 * Read-only: it writes nothing and changes no state — no flags needed.
 *
 *   node scripts/aek/verify-builder-config.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const APP_DIR = join(REPO_ROOT, 'apps', 'aek-desktop', 'v0')
const CONFIG_MODULE = join(APP_DIR, 'electron-builder.config.mjs')

// Resolve app-builder-lib the way electron-builder resolves it (pnpm layout:
// both live side-by-side in node_modules/.pnpm, reachable from electron-builder).
const appRequire = createRequire(join(APP_DIR, 'package.json'))
const electronBuilderPath = appRequire.resolve('electron-builder')
const ebRequire = createRequire(electronBuilderPath)
const { validateConfiguration } = ebRequire(
  join(dirname(ebRequire.resolve('app-builder-lib')), 'util/config/config.js'), // main entry = out/index.js
)
const { getArtifactArchName, Arch } = ebRequire('builder-util')

const HOSTS = [
  { platform: 'darwin', platKey: 'mac', exts: { dmg: 'dmg' } },
  { platform: 'win32', platKey: 'win', exts: { nsis: 'exe', portable: 'exe' } },
  { platform: 'linux', platKey: 'linux', exts: { AppImage: 'AppImage', deb: 'deb' } },
]

/** Simulate `computeArtifactName` for our templates (macros we use: productName/version/arch/ext). */
function expandTemplate(template, productName, version, archName) {
  return template
    .replace(/\$\{productName\}/g, productName.replace(/\s+/g, '')) // sanitize like the builder
    .replace(/\$\{version\}/g, version)
    .replace(/\$\{arch\}/g, String(archName ?? ''))
}

/** Import a FRESH copy of the config module as if the host were `platform`. */
async function loadConfigFor(platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  process.env.AEK_SLOT = 'aek'
  process.env.AEK_CI_UNSIGNED = '1' // CI shape: unsigned profile, no keychain assert
  try {
    const mod = await import(`file://${CONFIG_MODULE}?host=${platform}&t=${Date.now()}`)
    return mod.default
  } finally {
    delete process.platform // drop the own property → the real getter comes back
  }
}

function targetEntries(platKey, cfg) {
  const t = cfg[platKey]?.target
  if (t == null) return []
  const arr = Array.isArray(t) ? t : [t]
  return arr.map((entry) => ({
    target: typeof entry === 'string' ? entry : entry.target,
    archs: typeof entry === 'string' ? ['x64'] : Array.isArray(entry.arch) ? entry.arch : [entry.arch ?? 'x64'],
  }))
}

async function main() {
  const packageJson = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8'))
  let failed = false

  for (const host of HOSTS) {
    const cfg = await loadConfigFor(host.platform)
    try {
      // The exact validator the CI packaging step runs (throws on schema error)
      await validateConfiguration(cfg, { isEnabled: false, add() {} })
      console.log(`[verify-builder-config] ${host.platform} schema OK`)
    } catch (error) {
      failed = true
      console.error(`[verify-builder-config] ${host.platform} FAILED: ${error.message}`)
      continue
    }

    for (const entry of targetEntries(host.platKey, cfg)) {
      // Root section keys are camelCase: AppImage → cfg.appImage, all others match
      const sectionKey = entry.target === 'AppImage' ? 'appImage' : entry.target
      const template = cfg[sectionKey]?.artifactName
      const ext = host.exts[sectionKey] ?? entry.target
      if (template == null) {
        console.warn(`  ⚠ ${entry.target}: no artifactName on the ${sectionKey} section — default template (arch may be dropped on the default arch)`)
        continue
      }
      for (const arch of entry.archs) {
        const archName = getArtifactArchName(Arch[arch], ext)
        const builderName = expandTemplate(template, cfg.productName, packageJson.version, archName)
        if (host.platform === 'linux') {
          // Simulate the workflow's "Unify arch labels" step (release names)
          const releaseName = builderName.replace(/-x86_64\./, '-x64.').replace(/-amd64\./, '-x64.')
          if (releaseName !== builderName) {
            console.log(`  ${builderName}  → release: ${releaseName}`)
            continue
          }
        }
        console.log(`  ${builderName}`)
      }
    }
  }

  if (failed) {
    console.error('\n[verify-builder-config] FAILED — the cloud build would reject this config at the packaging step')
    process.exit(1)
  }
  console.log('\n[verify-builder-config] all three host shapes pass the 26.17 builder schema')
}

main().catch((error) => {
  console.error('[verify-builder-config]', error)
  process.exit(1)
})
