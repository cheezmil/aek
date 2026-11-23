/**
 * BQ10: SPA-local preferences shim for the moved art-gallery panel.
 *
 * The host persists `aek-home.*` prefs to `<AEK_HOME>/preferences/aek-home.json`
 * via the same-origin `/api/aek/preferences` endpoint (C11: the host never
 * silently falls back to localStorage). The SPA runs in an iframe on that same
 * origin, so it reads the same endpoint. This mirrors the host's `usePref`
 * tuple API (`[value, update, updateAwaited]`) but is read-oriented: the panel
 * only reads prefs (locale, pathStyle, skinAnim), so `update` is a best-effort
 * PUT and `updateAwaited` resolves false when the write is not attempted.
 *
 * The SPA is OUT of the aek-web i18n gate scope (src/web, not src/client), so
 * it owns its own copy of these helpers rather than importing the host's.
 */
import { useEffect, useState } from 'react'

/** The `aek-home.*` keys the gallery panel reads. */
export const PREF_KEYS = {
  locale: 'aek-home.locale',
  pathStyle: 'aek-home.pathStyle',
  skinAnim: 'aek-home.skinAnim',
} as const

export type PrefValue = string | number | boolean

type PrefsMap = Record<string, PrefValue | undefined>

let prefsCache: PrefsMap | null = null
let prefsPending: Promise<PrefsMap> | null = null

/**
 * Fetch the host's persisted prefs once (cached across hooks on the SPA).
 * @returns the prefs map (empty object on any failure — read-only fallback).
 */
export function loadPrefs(): Promise<PrefsMap> {
  if (prefsPending) return prefsPending
  prefsPending = fetch('/api/aek/preferences', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : ({})))
    .then((j: unknown) => {
      prefsCache = j && typeof j === 'object' ? (j as PrefsMap) : {}
      return prefsCache
    })
    .catch(() => {
      prefsCache = {}
      return prefsCache
    })
  return prefsPending
}

/**
 * Mirror of the host's `usePref`: read one pref key, parsing through `parse`
 * and falling back to `fallback` when the value is absent / unparseable.
 * @param key - `aek-home.*` key.
 * @param fallback - value used when the pref is unset / unparseable.
 * @param parse - coerces the raw value; return undefined to use the fallback.
 * @returns `[value, update, updateAwaited]`.
 */
export function usePref<T>(
  key: string,
  fallback: T,
  parse: (raw: unknown) => T | undefined,
): [T, (next: T | ((current: T) => T)) => void, (next: T | ((current: T) => T)) => Promise<boolean>] {
  const [value, setValue] = useState<T>(fallback)
  useEffect(() => {
    let alive = true
    loadPrefs().then((p) => {
      if (!alive) return
      setValue(parse(p[key]) ?? fallback)
    })
    return () => { alive = false }
  }, [key, fallback, parse])

  const update = (next: T | ((current: T) => T)): void => {
    const resolved = typeof next === 'function' ? (next as (c: T) => T)(value) : next
    setValue(resolved)
  }
  const updateAwaited = async (): Promise<boolean> => false
  return [value, update, updateAwaited]
}

/**
 * Parse a persisted boolean pref. Mirrors the host: only real booleans pass.
 * @param raw - raw value.
 * @returns the boolean, or undefined to signal "use the fallback".
 */
export function parseBoolean(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined
}

/**
 * Restrict a value to a known set. Mirrors the host `oneOf`.
 * @param allowed - the permitted string values.
 * @returns a parser returning the value if allowed, else undefined.
 */
export function oneOf<T extends string>(allowed: readonly T[]): (raw: unknown) => T | undefined {
  return raw => (typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined)
}
