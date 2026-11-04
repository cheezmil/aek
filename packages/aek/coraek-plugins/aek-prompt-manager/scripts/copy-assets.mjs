#!/usr/bin/env node
/**
 * Copy the plain-JS engine + its hand-written sidecar declarations into lib/
 * after tsc. tsc only emits the compiled TS host half (lib/index.js,
 * lib/config.js, lib/plugin/prompt-manager-service.js) and their .d.ts — it
 * does NOT emit the .js engine files (allowJs is off) nor re-emit the
 * hand-written .d.ts sidecars. The compiled service in lib/plugin/ imports
 * the engine module-relative as `../core.js` etc., so those files must exist
 * at lib/core.js / lib/platforms.js / lib/project-rules.js at runtime; the
 * sidecar .d.ts are copied so a type-consumer of the package resolves them.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// JS engine runtime files the compiled host half imports module-relative.
const ENGINE_JS = ['core.js', 'platforms.js', 'project-rules.js']
// Hand-written sidecar declarations (copied for type consumers; tsc does not
// re-emit existing .d.ts inputs).
const SIDECAR_DTS = ['core.d.ts', 'platforms.d.ts', 'project-rules.d.ts']

for (const name of [...ENGINE_JS, ...SIDECAR_DTS]) {
  const from = join(root, 'src', name)
  const to = join(root, 'lib', name)
  if (!existsSync(from)) {
    console.error(`copy-assets: missing ${from}`)
    process.exit(1)
  }
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  console.log(`copied src/${name} -> lib/${name}`)
}
