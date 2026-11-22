/**
 * C11+ unified storage (BI round): `window.localStorage` is transparently
 * redirected to the host data root.
 *
 * The red line (verify-aek-storage.mjs, user rule 2026-11-14) is that no
 * setting may live in the browser's localStorage — it is scoped to ONE
 * browser, so the Electron shell, a plain browser and other machines each
 * saw different values. Instead of forcing every plugin author to rewrite
 * `localStorage.getItem(...)` into a host API call, the architecture makes
 * the old spelling land in the right place automatically (user rule,
 * 2026-11-22: "直接让插件现有的 localstorage 存储方式自动变成存储到本地为
 * yml，这样别的开发者开发 coraek 插件就不用揪心了"):
 *
 *   1. At module evaluation (this file is main.tsx's FIRST import, so it
 *      runs before any plugin module touches storage), `window.localStorage`
 *      is replaced with a Proxy over an in-memory Map seeded from the
 *      native storage of THIS window (one-shot legacy migration).
 *   2. Hydration then fetches the shared map from the host —
 *      `GET /api/aek/web-storage`, backed by
 *      `<AEK_HOME>/preferences/web-storage.yml` (`@cheezmil/coraek/web-storage`)
 *      — and merges it OVER the native seed, so every window and machine
 *      serving the same data root converges on one value set.
 *   3. Every mutation is flushed back (debounced full-map POST, plus a
 *      sendBeacon on pagehide). Values persist in the yml, never in a
 *      browser profile.
 *
 * Plugin code keeps calling `localStorage.setItem / getItem / ...`
 * unchanged — that is the point. `sessionStorage` is deliberately NOT
 * redirected: per-session semantics are meaningful and must stay per-window.
 * Cross-tab `storage` events are not broadcast (a documented limitation;
 * the native API only delivers them to OTHER tabs of the same profile,
 * which the shared-host model does not have).
 *
 * @module @cheezmil/aek-web/src/host-storage
 */

/** The host route this shim talks to (see aek-websearch web-storage.ts). */
export const WEB_STORAGE_API = '/api/aek/web-storage'
/** Debounce window between the last mutation and the flush. */
const FLUSH_DEBOUNCE_MS = 700

const map = new Map<string, string>()

/**
 * One-shot native seed: read whatever THIS window's real localStorage still
 * holds (legacy keys from before the redirect existed) so a user who already
 * stored favorites or a skin does not lose them when the host map is empty.
 * Captured synchronously at module evaluation, BEFORE the window property is
 * replaced — after that `window.localStorage` is this module's Proxy.
 */
{
  let native: Storage | null = null
  try {
    native = window.localStorage
  } catch {
    native = null // storage disabled (private mode etc.) — nothing to migrate
  }
  if (native !== null) {
    try {
      for (let i = 0; i < native.length; i += 1) {
        const key = native.key(i)
        if (key !== null) map.set(key, native.getItem(key) ?? '')
      }
    } catch {
      // A half-broken native store must not take the console down with it.
    }
  }
}

let hydrated = false
let lastSent = ''
let timer: ReturnType<typeof setTimeout> | undefined

function serialize(): string {
  return JSON.stringify({ entries: Object.fromEntries(map) })
}

function flushNow(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  const body = serialize()
  if (body === lastSent) return
  lastSent = body
  fetch(WEB_STORAGE_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }).catch(() => {
    // Backend down: keep the in-memory values for this session and retry on
    // the next mutation. The next GET (fresh window) will re-converge.
  })
}

function scheduleFlush(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(flushNow, FLUSH_DEBOUNCE_MS)
}

/** Best-effort flush on the way out: beacons survive `window.close()`. */
function flushOnExit(): void {
  const body = serialize()
  if (body === lastSent) return
  lastSent = body
  // `.bind(navigator)` keeps the method reference bound for the linter and
  // for detached calls alike; the beacon's `this` is the Navigator.
  try {
    const nav = globalThis.navigator
    nav.sendBeacon.bind(nav)(WEB_STORAGE_API, new Blob([body], { type: 'application/json' }))
  } catch {
    // No beacon in this environment — a plain (async) flush still lands it.
    flushNow()
  }
}

window.addEventListener('pagehide', flushOnExit, { passive: true })

/** The Web Storage surface the proxy emulates (method names, not keys). */
interface StorageShim {
  readonly length: number
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
  key(index: number): string | null
  toString(): string
}

function installProxy(): void {
  const target: StorageShim = {
    get length() {
      return map.size
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
      scheduleFlush()
    },
    removeItem(key: string) {
      if (map.delete(key)) scheduleFlush()
    },
    clear() {
      if (map.size > 0) {
        map.clear()
        scheduleFlush()
      }
    },
    key(index: number) {
      const keys = [...map.keys()]
      return keys[index] ?? null
    },
    toString() {
      return '[object Storage]'
    },
  }
  const proxy = new Proxy(target, {
    get(storage, prop) {
      if (typeof prop === 'string') {
        // Property-style read: `localStorage.foo` → the value (native quirk).
        // A stored key that shadows a method name loses the read, exactly
        // like the native API (`localStorage.length` is always the count).
        if (map.has(prop) && !(prop in storage)) return map.get(prop)
      }
      // The catch-all `Reflect.get` overload types its result as `any`;
      // re-bind it to `unknown` before returning out of the trap.
      const value: unknown = Reflect.get(storage, prop)
      return value
    },
    set(storage, prop, value) {
      if (typeof prop === 'string' && !(prop in storage) && typeof value === 'string') {
        // Property-style write: `localStorage.foo = 'x'` (native quirk).
        map.set(prop, value)
        scheduleFlush()
        return true
      }
      return Reflect.set(storage, prop, value)
    },
    has(_, prop) {
      return typeof prop === 'string' ? map.has(prop) : false
    },
    ownKeys() {
      return [...map.keys()]
    },
    getOwnPropertyDescriptor(_, prop) {
      if (typeof prop === 'string' && map.has(prop)) {
        return { value: map.get(prop), enumerable: true, configurable: true, writable: true }
      }
      return undefined
    },
  })
  Object.defineProperty(window, 'localStorage', { value: proxy, configurable: true })
}

installProxy()

/**
 * Hydrate from the host data root: merge the shared map OVER the native seed,
 * then persist any native-only legacy keys (one-shot import). Resolves once
 * the shared values are live — `main.tsx` awaits it before re-applying the
 * persisted skin, so first paint uses the data root's theme.
 */
export const hostStorageReady: Promise<void> = (async () => {
  let res: Response
  try {
    res = await fetch(WEB_STORAGE_API, { cache: 'no-store' })
  } catch {
    // Host unreachable at boot: the console still works on this window's
    // values (in-memory) and the next mutation retries. It NEVER falls back
    // to persisting in localStorage (C11) — the seed read above was the
    // one native access, and only to rescue legacy keys.
    console.warn('[aek-web] host web-storage unreachable — values stay in-memory for this session')
    hydrated = true
    return
  }
  if (!res.ok) {
    console.warn(`[aek-web] host web-storage GET failed (${res.status}) — values stay in-memory for this session`)
    hydrated = true
    return
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  const raw = (body as { entries?: unknown } | undefined)?.entries
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    // Malformed host payload: keep the seed, nothing to import.
    hydrated = true
    return
  }
  const entries = raw as Record<string, unknown>
  const hostKeys = new Set<string>()
  let imported = false
  for (const [key, value] of Object.entries(entries)) {
    hostKeys.add(key)
    // The route contract is string-only (non-strings are rejected at the
    // host); a value that slipped through is skipped, not stringified.
    map.set(key, typeof value === 'string' ? value : '')
  }
  // Legacy keys that exist only in THIS window's native storage are imported
  // into the shared map exactly once (they now live in the yml, so the next
  // boot's seed will find them there instead).
  for (const key of map.keys()) {
    if (!hostKeys.has(key)) {
      imported = true
      break
    }
  }
  if (imported) flushNow()
  hydrated = true
})()

/** True once the shared map is live (or the fallback was accepted). */
export function hostStorageHydrated(): boolean {
  return hydrated
}
