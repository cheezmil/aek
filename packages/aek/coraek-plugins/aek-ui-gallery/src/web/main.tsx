import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import App from './App'
// Ported shadcnspace global theme (tailwind v4 tokens, light + dark).
import './ported/globals.css'
// BQ8: receive the embedding console's selected art style (UI 风格设置).
import { initAekThemeBridge } from './theme-bridge'

initAekThemeBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <App />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  </StrictMode>,
)
