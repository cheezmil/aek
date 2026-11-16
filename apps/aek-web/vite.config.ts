/**
 * AEK web console build: a plain React single-page app served by the host's
 * `frontend-static` fallback seat. Styling stack (FF round, 2026-11-17, user
 * decision supersedes the 11-07 "no Tailwind" pinning): Tailwind CSS v4 via
 * `@tailwindcss/vite` (build-time, zero runtime JS) + shadcn/ui design
 * tokens (CSS custom properties in `src/index.css`) + `@shadcn/lint`
 * (agent-first rules, wired through the repo's oxlint). `base: './'` keeps
 * asset URLs relative so the host-injected `<base href="./">` and the
 * dist-root serving resolve them correctly.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

/**
 * BB round: the source-map build flag. The console's 构建开关 persists it
 * (`<AEK_HOME>/build-flags.json`, the host route in
 * `@cheezmil/coraek/build-flags-api`); the build scripts read that file and
 * export `AEK_WEB_SOURCEMAP=1` for the aek-web build. It is opt-in: when the
 * env var is absent the build keeps the historical shape (no maps).
 */
const sourcemap = process.env.AEK_WEB_SOURCEMAP === '1'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap,
  },
})
