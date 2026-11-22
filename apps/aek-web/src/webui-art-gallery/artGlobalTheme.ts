/**
 * Whole-webui skinning (BP round m10318 item 6 → BQ m10857 item 4 → BR
 * m11298 item ④ → **BS m11967 item ③**: the 5-slot override was widened to
 * the FULL aek source-token set). Apply a gallery spec's palette to the ENTIRE
 * aek webui — the shadcn mapping layer and every panel resolve `var(--aek-*)`,
 * so the whole console repaints. Root fix for "some elements not applying the
 * style": the chrome reads not just the 5 core colors but also
 * surface-subtle / border / border-strong / accent-soft / accent-ink /
 * text-secondary / danger, which the old 5-token write left at base values,
 * mixing a dark skin with light borders. `deriveTokens` now fills every one of
 * those from the spec's 5 core slots (+ the spec's dark flag + status colors).
 *
 * The AEK base entries (style-aec-base[-dark]) are the escape hatch back to the
 * default look; the brand logo stays locked to fixed --color-logo-* tokens
 * (BQ-1) so it never follows a skin. The active spec id persists in
 * localStorage and boot() restores it on app start (main.tsx calls it
 * before render).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/artGlobalTheme
 */
import { allSpecs, ensureContrast, normRadius, type StageSpec } from './spec.ts'

const GLOBAL_KEY = 'aek-art-global-theme'

/* ---- pure color helpers (P16: same math as spec.ts's paletteOf kit) ---- */
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

/**
 * Every aek source token this module overrides (cleared, all of them, on
 * reset). Matches exactly the `var(--aek-*)` the shadcn mapping layer reads
 * (index.css §2) plus the direct-consumer extras.
 */
const ALL_KEYS: ReadonlyArray<string> = [
  '--aek-bg', '--aek-surface', '--aek-surface-subtle', '--aek-surface-hover',
  '--aek-border', '--aek-border-strong',
  '--aek-text', '--aek-text-secondary', '--aek-text-muted', '--aek-text-inverse',
  '--aek-accent', '--aek-accent-hover', '--aek-accent-soft', '--aek-accent-border', '--aek-accent-ink',
  '--aek-success', '--aek-success-soft', '--aek-success-border',
  '--aek-danger', '--aek-danger-soft', '--aek-danger-border',
]

/** Derive the FULL aek source-token set from a spec's 5 core slots. */
const deriveTokens = (spec: StageSpec): Record<string, string> => {
  // BH round: the 5 core slots pass through the contrast floor so a stale or
  // low-contrast persisted spec (boot path / external write) can never pin
  // the whole console to an unreadable skin.
  const [bg, surface, text, muted, accent] = ensureContrast(spec.p)
  const dark = spec.dark
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

/**
 * Write (or, with `null`, clear) the live overrides on <html>. All keys in
 * ALL_KEYS are removed first so a reset / narrower-spec switch never leaks a
 * stale derived token. When the `aek-home.skinAnim` setting is on, a one-shot
 * `.aek-skin-anim` class (see index.css) glides every surface through the
 * swap — the BS round (m11967 ④) "needs an animation" requirement — without
 * permanently retiming the app's hover transitions. The no-motion setting
 * still crushes it.
 *
 * BT round (m12567 ①): the glide is OFF by default (the user felt it janky).
 * The flag below is synced from the persisted setting by the gallery panel
 * (`setSkinAnimEnabled`); boot (pre-React) keeps it off.
 *
 * BU round (m12968 ①): with the glide off the swap is instant, but the app
 * carries 1600+ `transition-all` / `transition-colors` components (a CDP
 * census of the running webui), so the 21-token flip used to ripple as a
 * per-element animation wave = the jank the user kept reporting. When the
 * glide is off, the write is bracketed by the one-shot `.aek-skin-swap`
 * class (see index.css) which pins `transition: none` on everything for ~120ms
 * so the whole window swaps colors in a single frame; with the glide on the
 * `.aek-skin-anim` universal 280ms transition is the deliberate animation.
 */
let skinAnimEnabled = false

/** The art panel syncs the persisted `aek-home.skinAnim` setting here. */
export const setSkinAnimEnabled = (on: boolean): void => {
  skinAnimEnabled = on
  if (!on) {
    document.documentElement.classList.remove('aek-skin-anim')
    document.documentElement.classList.remove('aek-skin-swap')
  }
}

/**
 * BJ round (m04565): the skin-switch glide duration in ms, from the user
 * setting `aek-home.skinAnimMs` (基础设置 → 动画). The art panel syncs it
 * here; 0 forces the instant-swap path even while `aek-home.skinAnim` is on.
 * The CSS variable below carries it to the `.aek-skin-anim` longhands in
 * index.css (that class lives on <html>, so a layout-root variable from
 * sidebarCssVars could not reach it — which is why the schema field has no
 * `cssVar` of its own).
 */
let skinAnimMs = 320
export const setSkinAnimMs = (ms: number): void => {
  skinAnimMs = Number.isFinite(ms) ? Math.max(0, ms) : 320
  const el = document.documentElement
  el.style.setProperty('--aek-skin-anim-ms', `${skinAnimMs}ms`)
  if (skinAnimMs === 0) el.classList.remove('aek-skin-anim')
}

let skinAnimTimer: ReturnType<typeof setTimeout> | undefined

export const applyGlobalTheme = (spec: StageSpec | null): void => {
  const el = document.documentElement
  const glide = skinAnimEnabled && skinAnimMs > 0
  if (glide) {
    el.classList.add('aek-skin-anim')
  } else {
    // BU round (m12968 ①): the instant swap must not let the app's ~1600
    // transition-all / transition-colors components animate the 21-token
    // flip as a 280ms wave (the "太卡了" jank the user kept reporting) —
    // pin every transition off for ~120ms around the write.
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
    const font = FONT_STACKS[spec.font]
    if (font) el.style.setProperty('--font-sans', font)
    else el.style.removeProperty('--font-sans')
  }
  if (skinAnimTimer) clearTimeout(skinAnimTimer)
  if (glide) {
    skinAnimTimer = setTimeout(() => {
      el.classList.remove('aek-skin-anim')
    }, skinAnimMs)
  } else {
    skinAnimTimer = setTimeout(() => {
      el.classList.remove('aek-skin-swap')
    }, 120)
  }
}

/** Remember the spec in localStorage (degrades silently on quota errors). */
export const saveGlobalTheme = (spec: StageSpec): void => {
  applyGlobalTheme(spec)
  try {
    localStorage.setItem(GLOBAL_KEY, spec.id)
  } catch {
    // localStorage unavailable — the live override still applies.
  }
}

/** Clear the live override and the persisted spec. */
export const resetGlobalTheme = (): void => {
  applyGlobalTheme(null)
  try {
    localStorage.removeItem(GLOBAL_KEY)
  } catch {
    // nothing persisted to remove.
  }
}

/** The persisted spec id (null when the default look is active). */
export const globalThemeId = (): string | null => {
  try {
    return localStorage.getItem(GLOBAL_KEY)
  } catch {
    return null
  }
}

/** Boot hook (main.tsx): re-apply the persisted skin before first paint. */
export const bootGlobalTheme = (): void => {
  const id = globalThemeId()
  if (!id) return
  const spec = allSpecs().find(s => s.id === id)
  if (spec) applyGlobalTheme(spec)
}
