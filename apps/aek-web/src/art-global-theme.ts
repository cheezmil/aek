/**
 * BQ10: the whole-webui skinning engine, self-contained in the host.
 *
 * The art-gallery panel (「UI 风格设置」) moved into the aek-ui-gallery
 * coraek plugin SPA (m04367 — "别在 aek-web 里面写啊"); an iframe document
 * cannot write the parent DOM, so the SPA now posts the selected spec up
 * (`{ type: 'aek-art-global-theme', spec }`, see the plugin's global-client.ts)
 * and THIS module applies it to the host `<html>`. The SPA persists the SPEC
 * VALUE (JSON, not an id — the spec data is SPA-side now) under `GLOBAL_KEY`
 * in the shared host-storage, and `bootGlobalTheme` restores it on start.
 *
 * Everything the old `webui-art-gallery/artGlobalTheme.ts` did (21 --aek-*
 * source-token overrides, the contrast floor, the one-shot `.aek-skin-anim`
 * glide / `.aek-skin-swap` instant-pin) is preserved here, inlined so the
 * host has ZERO imports from the SPA. The `aek-home.skinAnim` toggle is now
 * synced by the periodic animation-variable writer (anim-vars.ts), which
 * also feeds {@link setSkinAnimMs}.
 *
 * @module @cheezmil/aek-web/src/art-global-theme
 */

/** Structural copy of the SPA's StageSpec (only the fields this engine uses). */
export interface HostThemeSpec {
  id: string
  /** [bg, surface, text, muted, accent, accent2] */
  p: string[]
  radius?: string
  dark?: boolean
  /** `sans` | `mono` | `serif` | `hand`. */
  font?: string
  /** optional [ok, bad, warn] semantic colors. */
  status?: string[]
}

const GLOBAL_KEY = 'aek-art-global-theme'
const MSG_TYPE = 'aek-art-global-theme'

/* ---- pure color helpers (same math as the SPA spec.ts palette kit) ---- */

const hexRgb = (hex: string): [number, number, number] | null => {
  const h = hex.replace('#', '')
  if (h.length !== 6) return null
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return null
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Relative luminance (0..1); malformed input degrades to mid-gray. */
const lum = (hex: string): number => {
  const rgb = hexRgb(hex)
  if (!rgb) return 0.5
  const p = rgb.map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
}

/** Linear mix of two hex colors; malformed input keeps `a`. */
const mix = (a: string, b: string, t: number): string => {
  const pa = hexRgb(a)
  const pb = hexRgb(b)
  if (!pa || !pb) return a
  return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('')
}

/** Hex → rgba() string at the given alpha (malformed input returns the input). */
const rgba = (hex: string, a: number): string => {
  const c = hexRgb(hex)
  if (!c) return hex
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`
}

/** Relative luminance of an already-decoded [r,g,b] triple. */
const lumRgb = (c: [number, number, number]): number => {
  const p = c.map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
}

/** WCAG-style contrast ratio between two hex colors (0..21). */
const contrastOf = (a: string, b: string): number => {
  const pa = hexRgb(a)
  const pb = hexRgb(b)
  if (!pa || !pb) return 99
  const la = lumRgb(pa)
  const lb = lumRgb(pb)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** BH round: a spec whose bg/text pair sits under 4.5:1 must never pin the
 *  console to an unreadable skin — clamp text and re-derive surface/muted. */
const CONTRAST_FLOOR = 4.5

const ensureContrast = (p: string[]): string[] => {
  if (p.length < 3) return p
  const [bg, , text] = p
  if (!bg || !text || contrastOf(bg, text) >= CONTRAST_FLOOR) return p
  const rgb = hexRgb(bg)
  const dark = !rgb || lumRgb(rgb) < 0.45
  const fixedText = dark ? '#f4f4f5' : '#18181b'
  return [
    bg,
    mix(bg, fixedText, dark ? 0.10 : 0.06),
    fixedText,
    mix(fixedText, bg, 0.45),
    p[4],
    p[5],
  ]
}

/** A radius token like `8` or `0.5rem` → the px-normalized form. */
const normRadius = (raw: string): string => (/px|rem|%$/.test(raw) ? raw : `${raw}px`)

/** Every aek source token this module overrides (cleared, all of them, on
 *  reset) — matches the `var(--aek-*)` the shadcn mapping layer reads. */
const ALL_KEYS: ReadonlyArray<string> = [
  '--aek-bg', '--aek-surface', '--aek-surface-subtle', '--aek-surface-hover',
  '--aek-border', '--aek-border-strong',
  '--aek-text', '--aek-text-secondary', '--aek-text-muted', '--aek-text-inverse',
  '--aek-accent', '--aek-accent-hover', '--aek-accent-soft', '--aek-accent-border', '--aek-accent-ink',
  '--aek-success', '--aek-success-soft', '--aek-success-border',
  '--aek-danger', '--aek-danger-soft', '--aek-danger-border',
]

/** Derive the FULL aek source-token set from a spec's 5 core slots. */
const deriveTokens = (spec: HostThemeSpec): Record<string, string> => {
  const [bg, surface, text, muted, accent = '#888888'] = ensureContrast(spec.p)
  const dark = !!spec.dark
  const aLum = lum(accent)
  const ok = spec.status?.[0] ?? (dark ? '#34d399' : '#16a34a')
  const bad = spec.status?.[1] ?? (dark ? '#f87171' : '#dc2626')
  return {
    '--aek-bg': bg,
    '--aek-surface': surface,
    '--aek-text': text,
    '--aek-text-muted': muted,
    '--aek-accent': accent,
    '--aek-surface-subtle': mix(bg, surface, 0.5),
    '--aek-surface-hover': mix(surface, text, dark ? 0.06 : 0.045),
    '--aek-border': mix(bg, text, dark ? 0.15 : 0.13),
    '--aek-border-strong': mix(bg, text, dark ? 0.26 : 0.28),
    '--aek-text-secondary': mix(text, bg, 0.42),
    '--aek-text-inverse': aLum > 0.45 ? '#18181b' : '#ffffff',
    '--aek-accent-hover': mix(accent, dark ? '#ffffff' : '#000000', dark ? 0.16 : 0.14),
    '--aek-accent-soft': rgba(accent, dark ? 0.16 : 0.13),
    '--aek-accent-border': rgba(accent, 0.42),
    '--aek-accent-ink': mix(accent, dark ? '#ffffff' : '#000000', dark ? 0.4 : 0.34),
    '--aek-success': ok,
    '--aek-success-soft': rgba(ok, 0.14),
    '--aek-success-border': rgba(ok, 0.4),
    '--aek-danger': bad,
    '--aek-danger-soft': rgba(bad, 0.14),
    '--aek-danger-border': rgba(bad, 0.4),
  }
}

const FONT_STACKS: Record<string, string> = {
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
  hand: '"Comic Sans MS", "Segoe Script", cursive',
}

let skinAnimEnabled = false

/** The `aek-home.skinAnim` setting sync (anim-vars.ts feeds this per tick). */
export const setSkinAnimEnabled = (on: boolean): void => {
  skinAnimEnabled = on
  if (!on) {
    document.documentElement.classList.remove('aek-skin-anim')
    document.documentElement.classList.remove('aek-skin-swap')
  }
}

/** BJ round: the glide duration in ms, from the `aek-home.skinAnimMs` setting.
 *  0 forces the instant-swap path even while the switch is on. */
let skinAnimMs = 320
export const setSkinAnimMs = (ms: number): void => {
  skinAnimMs = Number.isFinite(ms) ? Math.max(0, ms) : 320
  const el = document.documentElement
  el.style.setProperty('--aek-skin-anim-ms', `${skinAnimMs}ms`)
  if (skinAnimMs === 0) el.classList.remove('aek-skin-anim')
}

let skinAnimTimer: ReturnType<typeof setTimeout> | undefined

/** The last spec id actually applied — the panel re-saves the same spec on
 *  every style step, so a re-apply of the identical spec skips the DOM write
 *  (and its class pinning) instead of re-rippling the 21-token flip. */
let lastAppliedId: string | null = null

export const applyGlobalTheme = (spec: HostThemeSpec | null): void => {
  if (spec && spec.id === lastAppliedId) return
  lastAppliedId = spec?.id ?? null
  const el = document.documentElement
  const glide = skinAnimEnabled && skinAnimMs > 0
  if (glide) {
    el.classList.add('aek-skin-anim')
  } else {
    // BU round: the instant swap must not let the app's ~1600
    // transition-all / transition-colors components animate the 21-token
    // flip as a 280ms wave — pin every transition off for ~120ms around it.
    el.classList.add('aek-skin-swap')
  }
  for (const k of ALL_KEYS) el.style.removeProperty(k)
  el.style.removeProperty('--aek-radius')
  el.style.removeProperty('--font-sans')
  if (spec) {
    const t = deriveTokens(spec)
    for (const [k, v] of Object.entries(t)) if (v) el.style.setProperty(k, v)
    const radius = spec.radius ? normRadius(spec.radius) : ''
    if (radius) el.style.setProperty('--aek-radius', radius)
    else el.style.removeProperty('--aek-radius')
    const font = FONT_STACKS[spec.font ?? '']
    if (font) el.style.setProperty('--font-sans', font)
    else el.style.removeProperty('--font-sans')
  }
  if (skinAnimTimer) clearTimeout(skinAnimTimer)
  const cls = glide ? 'aek-skin-anim' : 'aek-skin-swap'
  const dur = glide ? skinAnimMs : 120
  skinAnimTimer = setTimeout(() => {
    el.classList.remove(cls)
  }, dur)
}

/* ---- persistence: the SPA writes the SPEC VALUE; the host boots from it ---- */

/** Parse the persisted spec value (legacy bare-id strings degrade to null). */
const readPersistedSpec = (): HostThemeSpec | null => {
  try {
    const raw = localStorage.getItem(GLOBAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: unknown; p?: unknown } | null
    if (parsed === null || typeof parsed !== 'object') return null
    return typeof parsed.id === 'string' && Array.isArray(parsed.p) ? (parsed as HostThemeSpec) : null
  } catch {
    return null
  }
}

/** Boot hook (main.tsx): re-apply the persisted skin before first paint. */
export const bootGlobalTheme = (): void => {
  const spec = readPersistedSpec()
  if (spec) applyGlobalTheme(spec)
}

/** Live channel: the SPA posts the selected spec whenever it changes. The
 *  host also re-persists it so a host-side reload restores the same skin. */
window.addEventListener('message', (e: MessageEvent) => {
  const d = e.data as { type?: unknown; spec?: unknown } | null
  if (!d || d.type !== MSG_TYPE) return
  const spec = d.spec as { id?: unknown; p?: unknown } | null | undefined
  if (spec === null || spec === undefined) {
    applyGlobalTheme(null)
    try {
      localStorage.removeItem(GLOBAL_KEY)
    } catch {
      // nothing persisted to remove.
    }
    return
  }
  if (typeof spec !== 'object' || typeof spec.id !== 'string' || !Array.isArray(spec.p)) return
  applyGlobalTheme(spec as HostThemeSpec)
  try {
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(spec))
  } catch {
    // storage unavailable — the live override still applies.
  }
})
