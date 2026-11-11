import { existsSync, globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'tsdown'
import { typertPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'
import { WORKSPACE_TYPERT_FACES } from './scripts/typert-faces.ts'
import { workspacePackageGlobs } from './scripts/workspace-package-globs.ts'

/**
 * Only workspace members that participate in the shared Host bundling pass
 * belong in the tsdown workspace. A package qualifies when it either ships its
 * own `tsdown.config.ts` (it overrides the shared entry itself), or its
 * tsconfig emits into `lib/types` — the exact directory the shared entry glob
 * consumes. Standalone packages (their own tsconfig, `outDir: lib`, e.g. the
 * AEK plugin engines) and directories without a manifest are compiled by their
 * own toolchain; including them made tsdown resolve the ROOT config with the
 * root package name and fail on a missing `lib/types/{index,startup}.js`.
 * @param dir - repository-relative package directory.
 * @returns whether the shared workspace bundler should build this member.
 */
function isWorkspaceBundled(dir: string): boolean {
  const cwd = import.meta.dirname
  if (!existsSync(join(cwd, dir, 'package.json'))) return false
  if (existsSync(join(cwd, dir, 'tsdown.config.ts'))) return true
  const tsconfig = join(cwd, dir, 'tsconfig.json')
  if (!existsSync(tsconfig)) return false
  return /"outDir"\s*:\s*"lib\/types"/u.test(readFileSync(tsconfig, 'utf8'))
}

function isBuildFaceClient(value: unknown): boolean {
  if (value === undefined || value === 'host') return false
  if (value === 'client') return true
  throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(value)}`)
}

/**
 * The ordinary workspace build consumes JavaScript emitted by the Host
 * TypeScript project and runs Typert. The Client pass selects packages that
 * declare a browser bundle and lets their package-local configs emit both
 * their Node loader entry and browser artifact. `apps/aek-desktop` bundles after
 * this pass (root package.json `build:lib:host`): its main bundle inlines
 * workspace devDependencies from their lib/ output, and tsdown builds
 * workspace members concurrently without ordering them.
 */
export default defineConfig(({ env }) => {
  const client = isBuildFaceClient(env?.DSH_BUILD_FACE)
  const packages = workspacePackageGlobs(globSync(['vendor/*/package.json', 'packages/*/*/package.json', 'packages/aek/*/*/package.json', 'packages/aek/*/*/*/package.json'], { cwd: import.meta.dirname }))
    .filter(isWorkspaceBundled)
  return {
    workspace: [...packages, 'apps/cli'],
    entry: client ? '' : ['lib/types/{index,startup}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: client ? [] : [typertPlugin({ mode: 'workspace', faces: WORKSPACE_TYPERT_FACES })],
  }
})
