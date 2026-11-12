import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // cli: the oclif primitives other AEK plugins import from
    // '@cheezmil/coraek/cli' (Command / Args / Flags / run / AEKCommand).
    entry: { cli: 'src/cli.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    sourcemap: false,
    clean: false,
    // @oclif/core is a runtime dep — keep as import
    deps: { neverBundle: () => true },
  },
  {
    // aek-cli: the `aek` operator CLI runner. The published bin/aek.mjs
    // imports lib/aek-cli.mjs (installed context); in a dev checkout the bin
    // runs src/aek-cli.ts through tsx.
    entry: { 'aek-cli': 'src/aek-cli.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    outExtension: () => ({ js: '.mjs' }),
    dts: false,
    sourcemap: false,
    clean: false,
    external: ['@oclif/core'],
  },
  {
    // commands: oclif command modules, discovered relative to the CLI runner
    // (oclif's `commands` option points at lib/commands).
    entry: { web: 'src/commands/web.ts', external: 'src/commands/external.ts', runtime: 'src/commands/runtime.ts' },
    outDir: 'lib/commands',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    outExtension: () => ({ js: '.mjs' }),
    dts: false,
    sourcemap: false,
    clean: false,
    external: ['@oclif/core'],
  },
])
