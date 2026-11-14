/**
 * AEK web console build: a plain React single-page app served by the host's
 * `frontend-static` fallback seat. CSS is compiled by lightningcss (the AEK
 * web stack — no Tailwind / PostCSS / runtime styling dependency). `base:
 * './'` keeps asset URLs relative so the host-injected `<base href="./">` and
 * the dist-root serving resolve them correctly.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  css: {
    transformer: 'lightningcss',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
