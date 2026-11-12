import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { dirname, join } from 'node:path'
import { clientBundle } from '../../../client/tsdown.client.ts'

const dir = import.meta.dirname

/**
 * The node half is tsc-emitted into `lib/types/`, where the host modules
 * import the package-root `.mjs` modules as `../<name>.mjs`. That specifier
 * only resolves from the OUTPUT location (`lib/<file>.js` → package root),
 * never from `lib/types/` during bundling — so those specifiers stay
 * verbatim imports in the emitted artifact instead of being resolved here.
 */
const ROOT_MJS = /^\.\.\/[a-z0-9-]+\.mjs$/u

/** Production dependencies the way the preset defines them: `dependencies`,
 *  `peerDependencies`, and `optionalDependencies` names, matched by bare
 *  specifier (name or `name/subpath`). */
const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}
const productionNames = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
]
const isProductionDependency = (specifier: string): boolean =>
  productionNames.some(name => specifier === name || specifier.startsWith(`${name}/`))

export default clientBundle(dir, ['lib/types/index.js'], {
  lib: {
    // Mirror the preset's deps policy (production deps stay imports,
    // everything else inlines) and keep the root `.mjs` specifiers verbatim.
    deps: {
      neverBundle: (specifier: string) => isProductionDependency(specifier) || ROOT_MJS.test(specifier),
      alwaysBundle: (specifier: string) => !isBuiltin(specifier) && !isProductionDependency(specifier) && !ROOT_MJS.test(specifier),
    },
  },
})
