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
  /** Web Search: mandatory exclusive first-level display filter (default "yes"). */
  websearchFreeTier: 'aek-home.websearch.freeTier',
  /** Web Search: second-level "requires a phone number" (multi-select). */
  websearchPhone: 'aek-home.websearch.reqPhone',
  /** Web Search: second-level "requires a credit card" (multi-select). */
  websearchCard: 'aek-home.websearch.reqCard',
  /**
   * Web Search plugin setting (Q round): how often the remote ranking board is
   * re-fetched, in hours (default 24). Manual refresh always bypasses it.
   */
  websearchRankingTtlHours: 'aek-home.websearch.rankingTtlHours',
  /**
   * Y round: the Web Search plugin's "不进行任何排行分类" switch — when
   * `true` the panel never fetches, displays or updates the ranking and
   * shows a flat provider list instead.
   */
  websearchNoRanking: 'aek-home.websearch.noRanking',
  /**
   * Y round: per-plugin memory of the last visited third-level board.
   * Stored as `parent:child,parent:child` panel ids; clicking a
   * second-level row re-opens the remembered board instead of the
   * default "首页" (which only applies until the first visit).
   */
  lastSub: 'aek-home.lastSub',
  /**
   * Y round: fade the sidebar's floating refresh/pin action box in and out
   * on hover (default `true`); `false` shows / hides it instantly.
   */
  navActionsFade: 'aek-home.navActionsFade',
  /**
   * Path display style (Q round): `abbreviated` shows `~/…` (posix) or
   * `%USERPROFILE%\…` (Windows, backslashes); `full` shows the raw absolute
   * path. Copy buttons always copy the raw path, never the display form.
   */
  pathStyle: 'aek-home.pathStyle',
} as const

/** One storable setting value (JSON primitive, enforced by the host). */
export type PrefValue = string | number | boolean

interface PrefContextValue {
  /** The loaded settings map; `undefined` until the first GET resolves. */
  prefs: Record<string, PrefValue> | undefined
  /** Update one setting: optimistic local write + host POST. */
  set: (key: string, next: PrefValue | ((current: unknown) => PrefValue)) => void
  /** Update several settings in ONE host request (presets / group reset). */
  setMany: (values: Record<string, PrefValue>) => void
  /** Re-read the whole settings map from the host (settings-page refresh). */
  reload: () => void
  /**
   * Merge a host-answered settings map INTO the local state (undo-restore,
   * Q round: the "restore defaults" flow gets the authoritative file back).
   */
  adopt: (values: Record<string, PrefValue>) => void
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

  const setMany = useCallback((values: Record<string, PrefValue>) => {
    setPrefs(prev => ({ ...(prev ?? {}), ...values }))
    void fetch(PREFS_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values }),
    }).catch(() => {
      // Optimistic values stay visible; the next GET reconciles.
    })
  }, [])

  /** Re-read the authoritative map from the host (settings-page refresh). */
  const reload = useCallback((): void => {
    let cancelled = false
    void fetch(PREFS_API, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return await response.json() as Record<string, PrefValue>
      })
      .then((data) => { if (!cancelled) setPrefs(data) })
      .catch(() => { /* host unreachable: keep the local values */ })
  }, [])

  /**
   * Merge a host-answered map into the local state — used by the
   * "undo restore defaults" flow, where the RESTORE route hands back the
   * whole authoritative file and the UI must stop showing the optimistic
   * defaults it just wrote.
   * @param values - the settings map the host read back.
   */
  const adopt = useCallback((values: Record<string, PrefValue>): void => {
    setPrefs(prev => ({ ...(prev ?? {}), ...values }))
  }, [])

  return <PrefContext.Provider value={{ prefs, set, setMany, reload, adopt }}>{children}</PrefContext.Provider>
}

/**
 * Read the whole settings map for schema-generated surfaces (settings page,
 * sidebar CSS variables). No parser needed: {@link coerce} validates per field.
 * @returns the raw map plus the single/batch writers.
 */
export function useSettings(): {
  prefs: Record<string, PrefValue>
  set: (key: string, next: PrefValue) => void
  setMany: (values: Record<string, PrefValue>) => void
  /** Re-read the authoritative map from the host. */
  reload: () => void
  /** Merge a host-answered map back in (undo-restore flow). */
  adopt: (values: Record<string, PrefValue>) => void
} {
  const { prefs, set, setMany, reload, adopt } = usePrefContext()
  return {
    prefs: prefs ?? {},
    set: (key, next) => set(key, next),
    setMany,
    reload,
    adopt,
  }
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
