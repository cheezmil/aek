/** Type surface for the dependency-free `@cheezmil/coraek/slots` subpath. */

export declare const AEK_SLOT_ENV: 'AEK_SLOT'
export declare const SLOT_NAMES: readonly ['aek', 'next']

/**
 * Directory name of each slot inside the container (`~/.aek`), e.g.
 * `{ aek: 'current', next: 'next' }`.
 */
export declare const SLOT_DIRS: Readonly<Record<'aek' | 'next', string>>

export interface AekSlot {
  readonly slot: 'aek' | 'next'
  /** electron-builder appId; becomes CFBundleIdentifier on macOS. */
  readonly appId: string
  /** macOS bundle identity (CFBundleIdentifier). */
  readonly bundleId: string
  /** User-visible app name, e.g. `AEK Next`. */
  readonly productName: string
  /** User-visible name of the development bundle. */
  readonly devAppName: string
  /**
   * C1 one-off migration: retired dev-bundle names (same bundle id) that the
   * swap routine removes from ~/Applications. Empty for new slots.
   */
  readonly legacyDevAppNames: readonly string[]
  /** Web backend port for this slot. */
  readonly webPort: number
  /**
   * Browser-facing host for this slot's console, e.g. `aek.localhost`.
   *
   * Distinct from the bind address on purpose: Chromium keys site zoom by HOST
   * (port excluded), so two local web UIs on `127.0.0.1` share one zoom level.
   * `*.localhost` still resolves to loopback (RFC 6761) and is a trustworthy
   * origin.
   */
  readonly webHost: string
  /** Remote-debugging (CDP) port for this slot. */
  readonly cdpPort: number
}

export declare const SLOTS: {
  readonly aek: AekSlot
  readonly next: AekSlot
}

export declare function isSlot(value: unknown): value is 'aek' | 'next'

export declare function resolveSlot(
  env?: Record<string, string | undefined>,
): 'aek' | 'next'

export declare function slotConfig(slot: unknown): AekSlot

/** Browser-facing console URL of a slot, e.g. `http://aek.localhost:1685`. */
export declare function webUrl(slot: unknown, port?: number): string

/** Host the console socket binds; always the loopback literal. */
export declare function bindHost(): string

export declare function slotHome(
  slot: unknown,
  env?: Record<string, string | undefined>,
): string
