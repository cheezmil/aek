import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// BQ4-4: standalone Vite SPA served by the host /ui/ui-gallery prefix route.
// Alias '@' mirrors the shadcnspace source layout (src/*).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/web/ported', import.meta.url)),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.AEK_UI_GALLERY_SOURCEMAP === '1',
    rollupOptions: {
      output: {
        // Keep lazy demo chunks individually so the 64 categories code-split.
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 1696,
  },
})
