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

/** The host access-control route (J round: committed through the same flow). */
export const ACCESS_API = '/api/aek/access'

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
  /**
   * I round: the DRAFT layer. Settings-page controls write here instead of
   * straight to the host: the value updates the live view instantly (so the
   * sidebar CSS variables follow the slider in real time) but the host POST
   * only happens at an explicit commit point — one key, "all", or never
   * (auto-save off). The draft lives on the provider (app root), so it
   * survives every panel / route switch within this app session.
   */
  draft: Record<string, PrefValue>
  /** The draft overlaid on the persisted map: what every consumer should read. */
  draftView: Record<string, PrefValue>
  /** Keys whose draft value differs from the persisted one (the dirty set). */
  dirtyKeys: string[]
  /** Write one key into the draft (and to the host at once when auto-save is on). */
  draftSet: (key: string, next: PrefValue) => void
  /** Commit one key ("all" = every dirty key in one POST) to the host. */
  draftSave: (key: string | 'all') => Promise<void>
  /** Discard the draft value of one key (the persisted value comes back). */
  draftUndo: (key: string) => void
  /** The `aek-home.autoSave` switch: on = every draft write is committed at once. */
  autoSave: boolean
  /**
   * J round: the access-control form (public mode / username / password /
   * allowlist) joins the SAME commit system. The form stages edits in a
   * provider-level draft (survives panel switches); the host write to
   * `/api/aek/access` only happens on `accessCommit` (the per-item save in
   * the changed-items box, or save-all). There is deliberately NO
   * standalone save button in the settings UI anymore.
   */
  accessView: AccessView | undefined
  /** The staged access form (`null` = nothing staged, the view is live). */
  accessDraft: AccessDraft | null
  /** True while any access field differs from the last host-answered view. */
  accessDirty: boolean
  /** Merge fields into the staged access form (no host write). */
  accessStage: (patch: Partial<AccessDraft>) => void
  /** Drop the staged access form (the host view comes back). */
  accessUndo: () => void
  /**
   * Commit the staged access form to the host. Rejects on the
   * client-side credential check (public mode needs username + password)
   * or on a non-OK host answer; the draft survives the failure.
   */
  accessCommit: () => Promise<void>
  /** Set by a failed `accessCommit`; cleared by the next successful commit. */
  accessCommitError: string | undefined
}

/** The host-answered access view (GET /api/aek/access). */
export interface AccessView {
  publicMode: boolean
  username: string
  allowlist: string[]
  hasPassword: boolean
}

/** One staged access form: the four inputs the section renders. */
export interface AccessDraft {
  publicMode: boolean
  username: string
  /** Empty = "keep the stored password" (the section renders the hint). */
  password: string
  /** Newline-separated, exactly what the textarea shows. */
  allowlist: string
}

const PrefContext = createContext<PrefContextValue | undefined>(undefined)

/**
 * Load the host settings map once and expose optimistic writes.
 * @param props - child tree.
 * @returns the provider.
 */
export function PrefProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Record<string, PrefValue> | undefined>(undefined)
  // I round: the unsaved draft layer (per key). Lives HERE (app root) so it
  // survives panel / route switches; an app RESTART drops it by design.
  const [draft, setDraft] = useState<Record<string, PrefValue>>({})
  // J round: the host-answered access view + the staged access form.
  const [accessView, setAccessView] = useState<AccessView | undefined>(undefined)
  const prefsRef = useRef(prefs)
  useEffect(() => {
    prefsRef.current = prefs
  }, [prefs])
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    let cancelled = false
    void fetch(PREFS_API, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        return await response.json() as Record<string, PrefValue>
      })
      .then((data) => { if (!cancelled) setPrefs(data) })
      .catch(() => {
        // Host unreachable: land with whatever we have (empty map when
        // nothing was written yet) so `usePrefLanded` consumers still run;
        // the optimistic local values are kept, never clobbered.
        if (!cancelled) setPrefs(prev => prev ?? {})
      })
    return () => { cancelled = true }
  }, [])

  // J round: load the host access view once (the access section no longer
  // owns the fetch — the staging layer needs it here for the dirty check).
  useEffect(() => {
    let cancelled = false
    void fetch(ACCESS_API, { headers: { accept: 'application/json' } })
      .then(async response => await response.json() as AccessView)
      .then((data) => { if (!cancelled) setAccessView(data) })
      .catch(() => { /* no host yet: the section stays inert */ })
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

  /**
   * I round: commit ONE key or ALL dirty keys to the host in one POST, then
   * merge the answered values into the persisted map and drop the committed
   * draft entries. A failed POST keeps the draft (nothing is lost).
   */
  const draftSave = useCallback(async (key: string | 'all'): Promise<void> => {
    const draftNow = draftRef.current
    const single = key === 'all' ? undefined : draftNow[key]
    if (key === 'all' ? Object.keys(draftNow).length === 0 : single === undefined) return
    // The guard above proves `single` is a real PrefValue on the single-key
    // path; the index signature can't be narrowed, so assert it.
    const values: Record<string, PrefValue> = key === 'all' ? { ...draftNow } : { [key]: single as PrefValue }
    const response = await fetch(PREFS_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(key === 'all' ? { values } : { key, value: single }),
    })
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
    const answered: Record<string, PrefValue> = key === 'all' ? values : { [key]: single as PrefValue }
    setPrefs(prev => ({ ...(prev ?? {}), ...answered }))
    setDraft(prev => {
      const drop = new Set(Object.keys(answered))
      const next: Record<string, PrefValue> = {}
      for (const [k, v] of Object.entries(prev)) if (!drop.has(k)) next[k] = v
      return next
    })
  }, [])

  /** I round: discard the draft value of one key (the persisted value shows). */
  const draftUndo = useCallback((key: string): void => {
    setDraft(prev => {
      if (prev[key] === undefined) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  /** I round: write into the draft; with auto-save on the write commits at once. */
  const autoSave = prefs?.['aek-home.autoSave'] === true
  const draftSet = useCallback((key: string, next: PrefValue): void => {
    setDraft(prev => ({ ...prev, [key]: next }))
    if (prefs?.['aek-home.autoSave'] === true) {
      void fetch(PREFS_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, value: next }),
      })
        .then(response => {
          if (!response.ok) return
          setPrefs(prevMap => ({ ...(prevMap ?? {}), [key]: next }))
        })
        .catch(() => { /* the draft stays; the next commit retries */ })
    }
  }, [prefs])

  /** The draft overlaid on the persisted map — what consumers read. */
  const draftView: Record<string, PrefValue> = { ...(prefs ?? {}), ...draft }
  /** J round: stage the access form (provider level, survives panel switches). */
  const [accessDraft, setAccessDraft] = useState<AccessDraft | null>(null)
  const [accessCommitError, setAccessCommitError] = useState<string | undefined>(undefined)
  const accessDraftRef = useRef(accessDraft)
  useEffect(() => {
    accessDraftRef.current = accessDraft
  }, [accessDraft])

  /** J round: merge fields into the staged access form (never the host). */
  const accessStage = useCallback((patch: Partial<AccessDraft>): void => {
    setAccessDraft(prev => ({
      publicMode: prev?.publicMode ?? false,
      username: prev?.username ?? '',
      password: prev?.password ?? '',
      allowlist: prev?.allowlist ?? '',
      ...patch,
    }))
  }, [])

  /** J round: drop the staged form; the last host-answered view shows again. */
  const accessUndo = useCallback((): void => {
    setAccessDraft(null)
    setAccessCommitError(undefined)
  }, [])

  /**
   * J round: commit the staged access form to the host (the ONLY access
   * write path — the section's standalone save button is gone). The
   * credential check runs client-side so a broken form never reaches the
   * host; a failure KEEPS the draft (the user's edits are never lost).
   */
  const accessCommit = useCallback(async (): Promise<void> => {
    const draftNow = accessDraftRef.current
    const viewNow = accessView
    if (draftNow === null) return
    if (draftNow.publicMode
      && (draftNow.username.trim().length === 0 || (draftNow.password.length === 0 && !viewNow?.hasPassword))) {
      setAccessCommitError('needCredentials')
      return
    }
    setAccessCommitError(undefined)
    const entries = draftNow.allowlist.split(/\r?\n/u).map(line => line.trim()).filter(line => line.length > 0)
    const response = await fetch(ACCESS_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        publicMode: draftNow.publicMode,
        username: draftNow.username,
        password: draftNow.password,
        allowlist: entries,
      }),
    })
    const data = await response.json() as AccessView & { message?: string }
    if (!response.ok) {
      setAccessCommitError(data.message ?? `HTTP ${String(response.status)}`)
      return
    }
    setAccessView(data)
    setAccessDraft(null)
  }, [accessView])

  const dirtyKeys = Object.keys(draft).filter(key => draftView[key] !== prefs?.[key])
  // J round: the access form is dirty when any staged field differs from
  // the last host view (an empty password means "keep the stored one";
  // the allowlist compares as TRIMMED ENTRY LISTS, not raw text, so a
  // re-typed identical list is not dirty).
  const accessDirty = accessDraft !== null
    && (accessDraft.publicMode !== accessView?.publicMode
      || accessDraft.username !== accessView?.username
      || (accessDraft.password.length > 0)
      || accessDraft.allowlist.split(/\r?\n/u).map(line => line.trim()).filter(line => line.length > 0).join('|')
        !== (accessView?.allowlist ?? []).join('|'))

  return <PrefContext.Provider
    value={{
      prefs, set, setMany, reload, adopt,
      draft, draftView, dirtyKeys, draftSet, draftSave, draftUndo, autoSave,
      accessView, accessDraft, accessDirty, accessStage, accessUndo, accessCommit, accessCommitError,
    }}>{children}
  </PrefContext.Provider>
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

/**
 * J round: the access-control draft view for the settings surfaces. The
 * section renders `form` (staged fields over the host view) and writes
 * through `accessStage`; the ONLY host write is `accessCommit` (called by
 * the changed-items box, per-item or via save-all).
 * @returns the staged form plus the commit / undo actions.
 */
export function useAccessDraft(): {
  view: AccessView | undefined
  form: { publicMode: boolean; username: string; password: string; allowlist: string; hasPassword: boolean }
  dirty: boolean
  accessStage: (patch: Partial<AccessDraft>) => void
  accessUndo: () => void
  accessCommit: () => Promise<void>
  accessCommitError: string | undefined
  autoSave: boolean
} {
  const { accessView, accessDraft, accessDirty, accessStage, accessUndo, accessCommit, accessCommitError, autoSave } =
    usePrefContext()
  const form = {
    publicMode: accessDraft?.publicMode ?? accessView?.publicMode ?? false,
    username: accessDraft?.username ?? accessView?.username ?? '',
    password: accessDraft?.password ?? '',
    allowlist: accessDraft?.allowlist ?? (accessView?.allowlist ?? []).join('\n'),
    hasPassword: accessView?.hasPassword ?? false,
  }
  return { view: accessView, form, dirty: accessDirty, accessStage, accessUndo, accessCommit, accessCommitError, autoSave }
}

/**
 * I round: the draft/commit view for the settings SURFACES (settings page,
 * web-search settings). Controls read `values` (draft over persisted, so a
 * slider live-previews while staying unsaved) and write with `draftSet`;
 * commits happen via `draftSave` (one key or all). Everything is provider
 * state, so switching panels never loses the unsaved edits.
 * @returns the draft view plus the commit / undo actions.
 */
export function useDraftSettings(): {
  values: Record<string, PrefValue>
  dirtyKeys: string[]
  draftSet: (key: string, next: PrefValue) => void
  draftSave: (key: string | 'all') => Promise<void>
  draftUndo: (key: string) => void
  autoSave: boolean
  setMany: (values: Record<string, PrefValue>) => void
  reload: () => void
  adopt: (values: Record<string, PrefValue>) => void
} {
  const { prefs, draftView, dirtyKeys, draftSet, draftSave, draftUndo, autoSave, setMany, reload, adopt } =
    usePrefContext()
  void prefs
  return { values: draftView, dirtyKeys, draftSet, draftSave, draftUndo, autoSave, setMany, reload, adopt }
}

/**
 * Whether the host settings map has landed (the first GET resolved).
 *
 * `usePref` values are FALLBACKs until then — consumers that must run ONCE
 * after the authoritative map arrives (B round: the URL deep-link wins over
 * the persisted panel) key their effect on this flag instead of guessing.
 *
 * @returns `false` before the first host read resolves, `true` after (or
 * when the host is unreachable — the fallbacks stay, effects must still run).
 */
export function usePrefLanded(): boolean {
  const { prefs } = usePrefContext()
  // `undefined` = still loading. A resolved-but-empty map, or a failed fetch
  // that keeps us on fallbacks, both count as "landed": the deep-link effect
  // must run exactly once, and it must not wait forever for a host that is
  // down.
  return prefs !== undefined
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
