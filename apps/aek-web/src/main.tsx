/**
 * AEK web console entry: renders the application root directly into `#root`.
 * The dsh shell / slot system is not involved — the host serves this build as
 * the web surface, and the app talks to the host's REST APIs through
 * same-origin `fetch` (see useConsoleFacts and siblings).
 *
 * @module @cheezmil/aek-web/src/main
 */
import { createRoot } from 'react-dom/client'
import { AekHome } from './Home.tsx'

const el = document.getElementById('root')
if (el === null) throw new Error('aek-web: missing #root')
createRoot(el).render(<AekHome />)
