/**
 * AEK web console entry: renders the application root directly into `#root`.
 * The dsh shell / slot system is not involved — the host serves this build as
 * the web surface, and the app talks to the host's REST APIs through
 * same-origin `fetch` (see useConsoleFacts and siblings).
 *
 * BI round: `./host-storage` is deliberately the FIRST import — it replaces
 * `window.localStorage` with the host-data-root redirect (C11+) at module
 * evaluation, before any other module can read or write storage.
 *
 * @module @cheezmil/aek-web/src/main
 */
import { hostStorageReady } from './host-storage.ts'
import { createRoot } from 'react-dom/client'
import { AekHome } from './Home.tsx'
import { TooltipProvider } from './components/ui/tooltip'
import { bootGlobalTheme } from './webui-art-gallery/artGlobalTheme.ts'
import './index.css'

const el = document.getElementById('root')
if (el === null) throw new Error('aek-web: missing #root')

/**
 * Boot sequence. The build target (es2020) does not allow top-level await,
 * so the hydration wait lives inside this function: it guarantees
 * 1. the host web-storage map is live (so the persisted skin value comes
 *    from the data root, not a stale browser profile), and
 * 2. the localStorage proxy is installed before first paint.
 * Rendering without hydration would only flash the native-seed value for a
 * moment; a single same-origin GET is far cheaper than that.
 */
async function boot(): Promise<void> {
  // BP round: re-apply the persisted whole-webui skin before first paint.
  await hostStorageReady
  bootGlobalTheme()
  createRoot(el).render(
    <TooltipProvider>
      <AekHome />
    </TooltipProvider>,
  )
}

void boot()
