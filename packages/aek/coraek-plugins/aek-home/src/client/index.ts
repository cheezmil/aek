/**
 * AEK home surface, client half. aek-home IS the application root: it renders
 * directly into `#root` via `createRoot`, bypassing the dsh slot/AppFrame
 * system. react/react-dom come from the shell's frozen module table
 * (`PLATFORM_MODULES`), so they are available regardless of which dsh UI
 * plugins are disabled — including `ui-renderer`, whose `uiRenderer` service
 * is therefore never provided and `mountClient`'s dependency fiber simply
 * stays pending (harmless: aek-home has already mounted).
 *
 * With no dsh shell owning `#root`, aek-home is the base future AEK plugins
 * extend (through aek-home's own slots, not dsh's). The mounted surface is the
 * AEK console: a left navigation rail plus a content column, styled entirely
 * with CSS Modules compiled by lightningcss (no Tailwind / PostCSS / runtime
 * styling dependency).
 * @module @cheezmil/aek-home/src/client/index
 */
import type { Context as ClientContext } from '@cheezmil/coraek/types'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AekHome } from './Home.tsx'

/** aek-home renders directly into `#root`; it consumes no cordis services. */
export const inject: readonly string[] = []

/**
 * Mount the AEK console as the application root. The dsh `uiRenderer` is
 * disabled in the AEK profile, so nothing else renders into `#root`.
 * @param _ctx - Client root context (unused: aek-home needs no services).
 */
export function apply(_ctx: ClientContext): void {
  const el = document.getElementById('root')
  if (el === null) return
  createRoot(el).render(createElement(AekHome))
}
