/**
 * AEK web console build: a plain React single-page app served by the host's
 * `frontend-static` fallback seat. CSS is compiled by lightningcss (the AEK
 * web stack — no Tailwind / PostCSS / runtime styling dependency). `base:
 * './'` keeps asset URLs relative so the host-injected `<base href="./">` and
 * the dist-root serving resolve them correctly.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
  css: {
    transformer: 'lightningcss',
  },
  build: {
    outDir: 'dist',
    sourcemap,
  },
})
