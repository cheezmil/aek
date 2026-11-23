// BQ10: install the host-storage localStorage Proxy FIRST — every storage read
// (panel state, tone marks, the persisted global theme) then converges on the
// host's web-storage yml instead of the iframe's native localStorage.
import './host-storage.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import App from './App'
import { I18nProvider } from './i18n.tsx'
// Ported shadcnspace global theme (tailwind v4 tokens, light + dark).
import './ported/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <App />
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
)
