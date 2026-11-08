import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // index: Cordis plugin entry. cli: compiled oclif runner — the published
    // bin/aekws.mjs (installed context) imports lib/cli.mjs, which discovers
    // lib/commands/*.mjs relative to itself.
    // Outputs .mjs/.d.mts to match package.json (main/types/exports/files).
    // Config is explicitly annotated in src/config.ts so declaration emit does
    // not have to name schemastery's internal `Dict` (TS2883).
    entry: ['src/index.ts', 'src/cli.ts', 'src/admin.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    outExtension: () => ({ js: '.mjs' }),
    // Declaration emit stays on (TS2883 / TS2339 are fixed at their source,
    // not worked around): Config now has an explicit portable annotation and
    // the web seam is typed in the AEK plugin layer. Keeping dts off would
    // silently ship stale .d.mts next to freshly built runtime .mjs.
    // cosmokit / schemastery are declared deps, so keeping them external lets
    // the emitted .d.mts reference their package names instead of inlining
    // internal types (it does NOT, by itself, fix TS2883).
    dts: true,
    external: ['@deepseek-ai/cordis', '@cheezmil/coraek', '@cheezmil/prevent-agent-directly-seeing-key', '@deepseek-ai/schemastery', '@deepseek-ai/cosmokit', 'yaml'],
    sourcemap: false,
    clean: false,
  },
  {
    entry: {
      search:  'src/commands/search.ts',
      extract: 'src/commands/extract.ts',
      pool:    'src/commands/pool.ts',
      doctor:  'src/commands/doctor.ts',
      use:     'src/commands/use.ts',
      status:  'src/commands/status.ts',
    },
    outDir: 'lib/commands',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    extensionStyle: 'keep-extension',
    outExtension: () => ({ js: '.mjs' }),
    dts: false,
    external: ['@oclif/core'],
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: false,
    clean: false,
  },
])
