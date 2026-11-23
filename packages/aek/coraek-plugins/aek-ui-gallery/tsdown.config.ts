import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // Host face: the cordis plugin entry that registers the /ui/ui-gallery
    // prefix route on the host webserver. Outputs .mjs/.d.mts to match
    // package.json (main/types/exports/files). @cheezmil/coraek is a
    // declared dep; cordis stays external.
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    outExtension: () => ({ js: '.mjs' }),
    dts: true,
    external: ['@deepseek-ai/cordis', '@cheezmil/coraek'],
    sourcemap: false,
    clean: false,
  },
])
