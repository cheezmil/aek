/**
 * Send a console page that was opened on the loopback LITERAL to the slot's own
 * canonical host.
 *
 * Why this exists (2026-11-10): Chromium keeps site zoom per HOST and drops the
 * port, so `127.0.0.1:1685` (AEK) and `127.0.0.1:<any other local app>` share
 * one zoom level — zooming the console also resized the DeepSeek Harness web
 * UI. The console is now served under `aek.localhost` / `aek-next.localhost`;
 * this hop makes an old bookmark, a terminal URL copy-paste or a script that
 * still points at the literal land on the canonical origin instead of silently
 * recreating the shared key.
 *
 * It never runs on the canonical origin, so it cannot loop. The target comes
 * from the host's own endpoint table — the client never guesses a host name.
 *
 * @module @cheezmil/aek-home/src/client/CanonicalHost
 */
import { useEffect } from 'react'
import { useConsoleFacts } from './useConsoleFacts.ts'
import type { SlotEndpoint } from './useConsoleFacts.ts'

/** Names a browser may use instead of the slot's canonical host. */
const LEGACY_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/**
 * @param hostname - `window.location.hostname`.
 * @returns true when this page was opened on a generic loopback name.
 */
export function isLegacyLoopback(hostname: string): boolean {
  return LEGACY_HOSTS.has(hostname)
}

/**
 * Work out the URL to hop to.
 *
 * The slot is identified by the PORT the page was served from, because the
 * endpoint table reports the port each slot listens on; the host is then taken
 * from that endpoint rather than assembled here.
 * @param location - the current location (`window.location`).
 * @param endpoints - the host's per-slot endpoint table.
 * @returns an absolute URL, or undefined when no hop applies.
 */
export function canonicalTarget(
  location: { hostname: string; port: string; pathname: string; search: string; hash: string },
  endpoints: readonly SlotEndpoint[],
): string | undefined {
  if (!isLegacyLoopback(location.hostname)) return undefined
  const port = Number(location.port)
  if (!Number.isInteger(port) || port <= 0) return undefined
  const endpoint = endpoints.find(item => item.webPort === port)
  if (endpoint === undefined || endpoint.url.length === 0) return undefined
  const target = new URL(endpoint.url)
  // Already canonical (a slot table that points at the literal): stay put.
  if (target.hostname === location.hostname) return undefined
  const path = location.pathname.length === 0 ? '/' : location.pathname
  return `${target.origin}${path}${location.search}${location.hash}`
}

/**
 * Hop the current page to its canonical origin when it was opened on a generic
 * loopback name. Renders nothing.
 * @returns always null.
 */
export function CanonicalHostRedirect(): null {
  const { facts } = useConsoleFacts()
  const href = facts === undefined
    ? undefined
    : canonicalTarget(window.location, facts.endpoints)
  useEffect(() => {
    if (href === undefined) return
    // `replace` keeps the legacy URL out of the back history: pressing Back
    // must not bounce the user straight back onto the shared origin.
    window.location.replace(href)
  }, [href])
  return null
}
