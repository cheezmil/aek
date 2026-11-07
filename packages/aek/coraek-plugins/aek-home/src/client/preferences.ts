/**
 * Tiny persisted-preference primitive for the AEK console.
 *
 * No state library: `localStorage` is the single source of truth for UI
 * preferences (active panel, sidebar lock, hover-to-expand, language). Reads
 * are defensive because the console also runs in hosts where storage is
 * blocked or unavailable.
 *
 * @module @cheezmil/aek-home/src/client/preferences
 */
import { useCallback, useState } from 'react'

/** Preference keys, namespaced so several AEK surfaces can coexist. */
export const PREF_KEYS = {
  panel: 'aek-home.panel',
  collapsed: 'aek-home.collapsed',
  hoverExpand: 'aek-home.hoverExpand',
  locale: 'aek-home.locale',
} as const

/**
 * Read one preference without throwing (private mode / disabled storage).
 * @param key - storage key.
 * @param parse - narrow the raw string to the wanted type.
 * @param fallback - value when missing or invalid.
 * @returns the stored value or the fallback.
 */
function read<T>(key: string, parse: (raw: string) => T | undefined, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (raw === null || raw === undefined) return fallback
    return parse(raw) ?? fallback
  } catch {
    return fallback
  }
}

/**
 * React state backed by localStorage; a blocked storage simply degrades to
 * in-memory state instead of breaking the surface.
 * @param key - storage key.
 * @param fallback - initial value.
 * @param parse - validator for stored strings.
 * @returns `[value, setValue]`, with a functional updater supported.
 */
export function useStoredState<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined,
): [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, parse, fallback))

  const update = useCallback((next: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolved = typeof next === 'function'
        ? (next as (current: T) => T)(current)
        : next
      try { globalThis.localStorage?.setItem(key, String(resolved)) } catch { /* storage disabled */ }
      return resolved
    })
  }, [key])

  return [value, update]
}

/** @param raw - stored string. @returns a boolean, or undefined. */
export function parseBoolean(raw: string): boolean | undefined {
  return raw === 'true' ? true : raw === 'false' ? false : undefined
}

/**
 * Build a validator for a closed set of string literals.
 * @param allowed - accepted values.
 * @returns a parser that rejects everything else.
 */
export function oneOf<T extends string>(allowed: readonly T[]): (raw: string) => T | undefined {
  return raw => allowed.find(item => item === raw)
}
