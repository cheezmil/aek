import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // index: Cordis plugin entry. cli: compiled oclif runner — the published
    // bin/aekws.mjs (installed context) imports lib/cli.mjs, which discovers
    // lib/commands/*.mjs relative to itself.
    // Outputs .mjs/.d.mts to match package.json (main/types/exports/files).
    // cosmokit + schemastery are externals so the emitted d.mts names Config
    // portably (their types resolve from declared deps, not inlined).
    entry: ['src/index.ts', 'src/cli.ts', 'src/admin.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    outExtension: () => ({ js: '.js' }),
    dts: true,
    external: ['@deepseek-ai/cordis', '@cheezmil/coraek', '@cheezmil/prevent-agent-directly-seeing-key', '@deepseek-ai/schemastery', 'yaml'],
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
