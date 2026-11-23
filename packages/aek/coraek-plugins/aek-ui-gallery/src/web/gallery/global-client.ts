/**
 * BQ10: the SPA-side client of the host's whole-console skin engine
 * (`apps/aek-web/src/art-global-theme.ts`).
 *
 * The moved panel persists the SELECTED SPEC VALUE (JSON, not just the id —
 * the spec data now lives in the SPA, the host can no longer resolve ids
 * against it) under `GLOBAL_KEY` in localStorage. That storage is the
 * host-storage Proxy (src/web/host-storage.ts, installed by main.tsx), so the
 * write converges on `<AEK_HOME>/preferences/web-storage.yml` and the host's
 * own `bootGlobalTheme` reads it back on the next boot.
 *
 * For the LIVE session the SPA additionally posts the spec to the embedding
 * console (`{ type: 'aek-art-global-theme', spec }`); the host applies it to
 * its `<html>` immediately. A standalone page load (no embedding parent) is a
 * harmless no-op for the post.
 *
 * @module @cheezmil/aek-ui-gallery/src/web/gallery/global-client
 */
import { type StageSpec } from './spec.ts'

/** MUST stay byte-identical to the host art-global-theme.ts key. */
const GLOBAL_KEY = 'aek-art-global-theme'
const MSG_TYPE = 'aek-art-global-theme'

/** Post the spec up to the embedding console (no-op when standalone). */
const postHost = (spec: StageSpec | null): void => {
  if (window.parent === window) return
  window.parent.postMessage({ type: MSG_TYPE, spec }, window.location.origin)
}

/** Persist the spec value and push it live to the host engine. */
export const saveGlobalTheme = (spec: StageSpec): void => {
  try {
    window.localStorage.setItem(GLOBAL_KEY, JSON.stringify(spec))
  } catch {
    // storage unavailable (private mode / quota) — the live post still applies.
  }
  postHost(spec)
}

/** Clear the persisted spec and push the reset live to the host engine. */
export const resetGlobalTheme = (): void => {
  try {
    window.localStorage.removeItem(GLOBAL_KEY)
  } catch {
    // nothing persisted to remove.
  }
  postHost(null)
}

/** The persisted spec id (null when the default look is active). */
export const globalThemeId = (): string | null => {
  try {
    const raw = window.localStorage.getItem(GLOBAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: unknown } | null
    return parsed !== null && typeof parsed === 'object' && typeof parsed.id === 'string'
      ? parsed.id
      : null
  } catch {
    return null
  }
}
