import { defineConfig } from 'tsdown'

export default defineConfig({
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
})
