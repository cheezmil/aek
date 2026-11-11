/**
 * `@cheezmil/aek-quick-prompt` — A2 local-only plugin scaffold.
 *
 * This is intentionally an EMPTY Cordis-shaped plugin: named exports `name` /
 * `inject` / `apply`, no behaviour yet. It exists so the audience rule has a
 * real A2 member and so the quick-prompt work has a home.
 *
 * A2 means: completely local use. It is excluded from every npm / release
 * publish path (see `scripts/aek/plugin-class.mjs` and
 * `verify-build-rules.mjs`). `private: true` is a second, independent guard.
 * Changing A1 <-> A2 requires the user's explicit permission.
 *
 * Not mounted in any `cordis.patch.yml` yet — a scaffold should not be loaded
 * into a running host. Wire it up when it gains real behaviour.
 *
 * @module @cheezmil/aek-quick-prompt
 */

/** Stable Coraek plugin name. */
export const name = 'aek-quick-prompt'

/** The scaffold consumes no host seam. */
export const inject: string[] = []

/**
 * No-op entry point. The real quick-prompt service will be registered here.
 */
export function apply(): void {
  // Deliberately empty: scaffold only.
}
