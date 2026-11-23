/**
 * Shared clipboard write for the webui (V round: promoted from the
 * icon-manager panel so the About page's "copy for the agent" button and
 * every future copy affordance use ONE implementation).
 *
 * The Electron shell serves the webui from a localhost origin (a secure
 * context), so the async Clipboard API is always available; a failed
 * write simply reports false to the caller.
 *
 * @module @cheezmil/aek-web/src/clipboard
 */

/**
 * @param text - the snippet to copy.
 * @returns whether the write succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
