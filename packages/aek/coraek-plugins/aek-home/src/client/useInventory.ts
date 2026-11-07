/**
 * The About page's live source of truth: `GET /api/aek/inventory`, served by
 * `@cheezmil/aek-websearch/admin`'s host half. Versions and the dev/npm
 * install kind are read on the host at request time, never baked into the
 * client bundle. Packages carry a role group instead of an installed flag.
 *
 * @module @cheezmil/aek-home/src/client/useInventory
 */
import { useCallback, useEffect, useState } from 'react'

/** The host route publishing the AEK package inventory. */
export const INVENTORY_API = '/api/aek/inventory'

/** How a package reached this machine. */
export type InstallKind = 'dev' | 'npm'

/** Which section a package belongs to. */
export type InventoryGroup = 'plugin' | 'base'

/** One package row. */
export interface InventoryPackage {
  /** Package id. */
  name: string
  /** Version from its own package.json. */
  version: string
  /** dev checkout or npm install. */
  kind: InstallKind
  /** AEK plugin or base environment. */
  group: InventoryGroup
}

/** The inventory snapshot. */
export interface InventorySnapshot {
  /** Overall install kind. */
  installKind: InstallKind
  /** How the host determined it. */
  source: string
  /** Displayed AEK packages. */
  packages: InventoryPackage[]
}

/** Live inventory state. */
export interface InventoryState {
  /** Snapshot, `undefined` until the first read completes. */
  snapshot: InventorySnapshot | undefined
  /** Last error message. */
  error: string | undefined
  /** Force a fresh read. */
  refresh: () => void
}

/** @param cause - unknown thrown value. @returns a displayable message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Read the inventory once per revision and expose a refresh action.
 * @returns the live state.
 */
export function useInventory(): InventoryState {
  const [snapshot, setSnapshot] = useState<InventorySnapshot | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetch(INVENTORY_API, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return await response.json() as InventorySnapshot
      })
      .then((value) => { if (!cancelled) { setSnapshot(value); setError(undefined) } })
      .catch((cause: unknown) => { if (!cancelled) setError(messageOf(cause)) })
    return () => { cancelled = true }
  }, [revision])

  const refresh = useCallback(() => setRevision(value => value + 1), [])
  return { snapshot, error, refresh }
}
