/** Type surface for the dependency-free `@cheezmil/coraek/slots` subpath. */

export declare const AEK_SLOT_ENV: 'AEK_SLOT'
export declare const SLOT_NAMES: readonly ['aek', 'next']

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
  /** Web backend port for this slot. */
  readonly webPort: number
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

export declare function slotHome(
  slot: unknown,
  env?: Record<string, string | undefined>,
): string
