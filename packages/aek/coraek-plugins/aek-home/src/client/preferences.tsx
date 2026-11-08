/**
 * Host-persisted UI settings for the AEK console (C11).
 *
 * PRINCIPLE (user rule, 2026-11-08): no UI setting may ever live in the
 * browser's localStorage. localStorage is scoped to ONE browser, so the same
 * user would see different settings in the Electron shell, in Safari, on
 * another machine — and nothing would follow the AEK data root. Every
 * setting is instead read from / written to the host at
 * `<AEK_HOME>/preferences/aek-home.json` via `/api/aek/preferences`
 * (served by `@cheezmil/aek-websearch/admin`), so the setting belongs to the
 * DATA ROOT, shared by every window and machine that serve it.
 *
 * If the host is unreachable the console degrades to in-memory fallbacks —
 * it never silently falls back to localStorage.
 *
 * @module @cheezmil/aek-home/src/client/preferences
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/** The host settings route (see aek-websearch `registerPreferences`). */
export const PREFS_API = '/api/aek/preferences'

/** Setting keys, namespaced so several AEK surfaces can coexist in one file. */
export const PREF_KEYS = {
  panel: 'aek-home.panel',
  collapsed: 'aek-home.collapsed',
  hoverExpand: 'aek-home.hoverExpand',
  /** Clicking the top logo collapses/expands the sidebar (on by default, C10). */
  logoToggle: 'aek-home.logoToggle',
  locale: 'aek-home.locale',
} as const

/** One storable setting value (JSON primitive, enforced by the host). */
export type PrefValue = string | number | boolean

interface PrefContextValue {
  /** The loaded settings map; `undefined` until the first GET resolves. */
  prefs: Record<string, PrefValue> | undefined
  /** Update one setting: optimistic local write + host POST. */
  set: (key: string, next: PrefValue | ((current: unknown) => PrefValue)) => void
}

const PrefContext = createContext<PrefContextValue | undefined>(undefined)

/**
 * Load the host settings map once and expose optimistic writes.
 * @param props - child tree.
 * @returns the provider.
 */
export function PrefProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Record<string, PrefValue> | undefined>(undefined)
  const prefsRef = useRef(prefs)
  useEffect(() => {
    prefsRef.current = prefs
  }, [prefs])

  useEffect(() => {
    let cancelled = false
    void fetch(PREFS_API, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return await response.json() as Record<string, PrefValue>
      })
      .then((data) => { if (!cancelled) setPrefs(data) })
      .catch(() => { /* host unreachable: stay on fallbacks, never localStorage */ })
    return () => { cancelled = true }
  }, [])

  const set = useCallback((key: string, next: PrefValue | ((current: unknown) => PrefValue)) => {
    const current = prefsRef.current?.[key]
    const resolved = typeof next === 'function' ? next(current) : next
    setPrefs(prev => ({ ...(prev ?? {}), [key]: resolved }))
    void fetch(PREFS_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, value: resolved }),
    }).catch(() => {
      // The optimistic value stays visible; the next GET reconciles.
    })
  }, [])

  return <PrefContext.Provider value={{ prefs, set }}>{children}</PrefContext.Provider>
}

/**
 * Read one host-persisted setting with a typed parser.
 *
 * Before the first host read completes the fallback is used (no flash of the
 * wrong value after one). After it, the host value wins — so a setting changed
 * in another window or on another machine shows up on the next load.
 *
 * @param key - the setting key ({@link PREF_KEYS}).
 * @param fallback - value until/when the host has no storable value for it.
 * @param parse - validator for the raw host value.
 * @returns `[value, update]`, functional updaters supported.
 */
export function usePref<T>(
  key: string,
  fallback: T,
  parse: (raw: unknown) => T | undefined,
): [T, (next: T | ((current: T) => T)) => void] {
  const { prefs, set } = usePrefContext()
  const value: T = prefs === undefined ? fallback : parse(prefs[key]) ?? fallback

  const update = useCallback((next: T | ((current: T) => T)) => {
    set(key, (current: unknown) => {
      const base: T = current === undefined ? value : parse(current) ?? fallback
      const resolved = typeof next === 'function' ? (next as (cur: T) => T)(base) : next
      return resolved as unknown as PrefValue
    })
  }, [key, set, value, parse, fallback])

  return [value, update]
}

/** @returns the settings context. */
function usePrefContext(): PrefContextValue {
  const context = useContext(PrefContext)
  if (context === undefined) throw new Error('usePref must be used inside PrefProvider')
  return context
}

/** @param raw - a raw host value. @returns a boolean, or undefined. */
export function parseBoolean(raw: unknown): boolean | undefined {
  return raw === true || raw === false ? raw : undefined
}

/**
 * Build a validator for a closed set of string literals.
 * @param allowed - accepted values.
 * @returns a parser that rejects everything else.
 */
export function oneOf<T extends string>(allowed: readonly T[]): (raw: unknown) => T | undefined {
  return raw => (typeof raw === 'string' ? allowed.find(item => item === raw) : undefined)
}
