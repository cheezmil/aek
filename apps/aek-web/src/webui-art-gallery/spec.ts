/**
 * The style gallery's data-plane helpers — the BO-7 rewrite (m08802): the
 * panel now mirrors the style-gallery reference's frontend IA (top-bar tabs +
 * grouped sidebar + compare grid + 4-tab stage demo). These helpers are
 * shared between the panel shell and the stage; the DATA (57 skill mappings +
 * 88 builtin themes + the 43-texture skin table) is ported, P16 keeps the
 * components aek-web's own.
 *
 * Iron rule (stage.css header): inline styles carry ONLY the raw `--p-*`
 * values; the live `--sg-*` values derive from them and the data-mode skins
 * may override. Writing `--sg-*` / `--radius` inline would freeze every skin.
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/spec
 */
import type { CSSProperties } from 'react'
import { SKILL_STYLES, REPO_FALLBACK } from './data/skill-styles.ts'
import { STYLE_THEMES } from './data/style-themes.ts'
import { ART_STYLES, ART_STYLE_KINDS, type ArtStyleEntry, type ArtStyleKind } from './data/all-styles.ts'

/** One comparable entry: a builtin theme or a skill's style mapping. */
export interface StageSpec {
  id: string
  kind: 'theme' | 'skill'
  name: string
  sub: string
  mode: string
  font: string
  radius: string
  blur: number
  dark: boolean
  /** [bg, surface, text, muted, accent, accent2] */
  p: string[]
  /** optional [ok, bad, warn] semantic colors. */
  status?: string[]
}

/** One sidebar/compare row: a builtin style or a skill mapping. */
export interface GalleryItem {
  id: string
  kind: 'style' | 'skill'
  spec: StageSpec
  desc: string
  repoId?: string
  repoName?: string
  repoColor?: string
  kindId?: string
  kindName?: string
  src?: string
  srcColor?: string
  /** Raw scanned hex colors (may be empty; palette is derived, see paletteOf). */
  colors?: string[]
}

/** The texture-skin count in stage.css (its 43 `[data-mode]` skin blocks). */
export const MODE_COUNT = 43

/** The 12 scanned style families (generated data; the reference's kind chips). */
export const STYLE_KINDS: ArtStyleKind[] = ART_STYLE_KINDS

/** BR round (m11298 ③): the original AEK webui base look (light + dark,
 *  straight from index.css :root / .dark) is ALSO an exposable entry — the
 *  escape hatch that restores the default appearance from the gallery. */
export const AEC_BASE_KIND: ArtStyleKind = { id: 'base', name: 'AEK 基础', src: 'aek-web index.css', color: '#ea580c', count: 2 }
export const ALL_STYLE_KINDS: ArtStyleKind[] = [...ART_STYLE_KINDS, AEC_BASE_KIND]

export const AEC_BASE_SPECS: StageSpec[] = [
  {
    id: 'style-aec-base',
    kind: 'theme',
    name: 'AEK 基础样式',
    sub: 'aek-web index.css :root · 浅色默认',
    mode: 'layer',
    font: 'sans',
    radius: '12px',
    blur: 0,
    dark: false,
    p: ['#f6f7f9', '#ffffff', '#18181b', '#a1a1aa', '#ea580c', '#c2410c'],
  },
  {
    id: 'style-aec-base-dark',
    kind: 'theme',
    name: 'AEK 基础样式 · 深色',
    sub: 'aek-web index.css .dark',
    mode: 'layer',
    font: 'sans',
    radius: '12px',
    blur: 0,
    dark: true,
    p: ['#131519', '#1b1e24', '#e8eaef', '#6e717c', '#f8843c', '#e06a26'],
  },
]

// ---------------------------------------------------------------------------
// paletteOf + helpers — aek's own port of the reference's 6-slot palette
// derivation (lib.ts paletteOf/MODE_BASE/lum/sat/mix, P16: logic ported,
// code rewritten aek-house-style). Scanned entries carry at most 5 raw hex
// colors; the missing slots fall back to the mode's builtin base palette.
// ---------------------------------------------------------------------------

/** Per-mode base palette: first builtin theme of each mode (the reference's MODE_BASE). */
const MODE_BASE: Record<string, Record<string, string> | undefined> = (() => {
  const m: Record<string, Record<string, string>> = {}
  for (const t of STYLE_THEMES) {
    if (!(t.mode in m)) m[t.mode] = t.vars
  }
  return m
})()

const hexRgb = (hex: string): [number, number, number] | null => {
  const h = hex.replace('#', '')
  if (h.length !== 6) return null
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
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

/** Saturation (0..1); malformed input degrades to gray. */
const sat = (hex: string): number => {
  const rgb = hexRgb(hex)
  if (!rgb) return 0
  const mx = Math.max(...rgb)
  const mn = Math.min(...rgb)
  return mx === 0 ? 0 : (mx - mn) / mx
}

/** Linear mix of two hex colors; malformed input keeps `a`. */
const mix = (a: string, b: string, t: number): string => {
  const pa = hexRgb(a)
  const pb = hexRgb(b)
  if (!pa || !pb) return a
  return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('')
}

/** Relative luminance of an already-decoded [r,g,b] triple. */
const lumRgb = (c: [number, number, number]): number => {
  const p = c.map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
}

/**
 * WCAG-style contrast ratio between two hex colors (0..21). Malformed input
 * reports "fine" (99) so a bad value can never trigger the guard.
 */
export const contrastOf = (a: string, b: string): number => {
  const pa = hexRgb(a)
  const pb = hexRgb(b)
  if (!pa || !pb) return 99
  const la = lumRgb(pa)
  const lb = lumRgb(pb)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * BH round (m03619): the contrast floor. A spec whose bg/text pair sits under
 * 4.5:1 renders the WHOLE webui unreadable when applied (BP/BQ whole-webui
 * skinning + ArtGalleryPanel's auto-apply on every spec change) — the user
 * saw exactly that: 41 of the 348 "按 UI 样式" entries are sub-3.0 (several
 * 1.00, e.g. logo:Calligraphic = #000 on #000, genre:modern minimal = #FFF on
 * #FFF) and browsing to one repaints the entire console black-on-black. The
 * palette derivation (paletteOf) and every hand-written skill palette are
 * pushed through this guard: when bg and text are too close, text is clamped
 * to near-white / near-black by bg luminance and surface / muted re-derived,
 * so no spec can ever pin the console to an unreadable skin.
 */
const CONTRAST_FLOOR = 4.5

export const ensureContrast = (p: string[]): string[] => {
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

/** Derive the 6-slot [bg,surface,text,muted,accent,accent2] palette. */
export const paletteOf = (st: { mode: string; colors: string[] }): string[] => {
  const base: Record<string, string> = MODE_BASE[st.mode] ?? MODE_BASE.saas ?? {}
  const c = st.colors.filter(x => /^#[0-9A-Fa-f]{6}$/.test(x))
  if (!c.length) {
    return ensureContrast([base.bg, base.surface, base.text, base.muted, base.accent, base.accent2])
  }
  const byL = c.slice().sort((a, b) => lum(a) - lum(b))
  const dark = byL[0]
  const bright = byL[byL.length - 1]
  const isDark = lum(bright) < 0.35
  const bg = isDark ? dark : bright
  const text = isDark ? bright : dark
  const rest = c.filter(x => x !== bg && x !== text)
  const byS = rest.slice().sort((a, b) => sat(b) - sat(a))
  const accent = byS.length ? byS[0] : base.accent
  const accent2 = byS.length > 1 ? byS[1] : (byS.length ? byS[0] : base.accent2)
  const surface = isDark ? mix(bg, text, 0.10) : mix(bg, text, 0.06)
  const muted = mix(text, bg, 0.45)
  // BH round: guarantee a readable bg/text pair (surface / muted re-derived
  // inside the guard from the clamped text).
  return ensureContrast([bg, surface, text, muted, accent, accent2])
}

/** A scanned style entry → one comparable spec (palette derived, P16). */
export const styleSpecOf = (e: ArtStyleEntry): StageSpec => {
  const p = paletteOf({ mode: e.mode || 'saas', colors: e.colors })
  return {
    id: e.id,
    kind: 'theme',
    name: e.name,
    sub: `${e.kind} · ${e.src}`,
    mode: e.mode || 'saas',
    font: e.font || 'sans',
    radius: e.radius || '12px',
    blur: e.blur ?? 0,
    dark: lum(p[0]) < 0.35,
    p,
  }
}

/** Assemble the two item families (style rows first, the reference's order).
 *  The style family is the scanned 346-entry library (12 kinds), not the 88
 *  builtin fallback — the reference uses the scanner whenever it can. */
export function galleryItems(): { styles: GalleryItem[]; skills: GalleryItem[] } {
  const base: GalleryItem[] = AEC_BASE_SPECS.map((spec): GalleryItem => ({
    id: spec.id,
    kind: 'style',
    spec,
    desc: spec.sub,
    kindId: AEC_BASE_KIND.id,
    kindName: AEC_BASE_KIND.name,
    src: AEC_BASE_KIND.src,
    srcColor: AEC_BASE_KIND.color,
    colors: spec.p,
  }))
  const styles: GalleryItem[] = [
    ...base,
    ...ART_STYLES.map((e): GalleryItem => ({
      id: e.id,
      kind: 'style',
      spec: styleSpecOf(e),
      desc: e.desc || `${e.kind} · ${e.src}`,
      kindId: e.kindId,
      kindName: e.kind,
      src: e.src,
      srcColor: e.srcColor,
      colors: e.colors,
    })),
  ]
  const skills: GalleryItem[] = skillSpecs().map((spec) => {
    const key = spec.id.slice('skill-'.length)
    const repoId = key.split('::')[0]
    const repoMeta = REPO_FALLBACK[repoId]
    return {
      id: spec.id,
      kind: 'skill',
      spec,
      desc: spec.sub,
      repoId,
      repoName: repoMeta.name,
      repoColor: repoMeta.color,
    }
  })
  return { styles, skills }
}

export const FAV_KEY = 'aek-art-favorites'

/** A radius token like `8` or `0.5rem` → the px-normalized form. */
export const normRadius = (raw: string): string => (/px|rem|%$/.test(raw) ? raw : `${raw}px`)

/** The scanned style entries → comparable specs (346 across 12 kinds),
 *  with the two AEK base entries (light / dark) first. */
export const styleSpecs = (): StageSpec[] => [...AEC_BASE_SPECS, ...ART_STYLES.map(styleSpecOf)]

/** The skill mappings → comparable specs (repo fallback fills the gaps). */
export const skillSpecs = (): StageSpec[] =>
  Object.entries(SKILL_STYLES).map(([key, s]) => {
    const repo = key.split('::')[0]
    const name = key.split('::')[1]
    const repoMeta = REPO_FALLBACK[repo]
    return {
      id: `skill-${key}`,
      kind: 'skill',
      name,
      sub: s.tag || [repoMeta.name, repoMeta.note].filter(Boolean).join(' · ') || repo,
      mode: s.m,
      font: s.f || 'sans',
      radius: s.r || '12px',
      blur: parseInt(String(s.b ?? 0), 10) || 0,
      dark: s.d === 1,
      // BH round: hand-written palettes go through the same floor (several
      // repos ship sub-4.5:1 pairs that would repaint the console unreadable).
      p: ensureContrast(s.p),
      status: s.s,
    }
  })

/** Every comparable entry, styles first (the reference's order). */
export const allSpecs = (): StageSpec[] => [...styleSpecs(), ...skillSpecs()]

/**
 * The iron rule (stage.css header): inline carries ONLY the raw `--p-*`
 * values; the live `--sg-*` values derive from them and the skins may
 * override.
 */
export const specStyle = (spec: StageSpec): CSSProperties => {
  const raw: Record<string, string> = {
    '--p-bg': spec.p[0],
    '--p-surface': spec.p[1],
    '--p-text': spec.p[2],
    '--p-muted': spec.p[3],
    '--p-accent': spec.p[4],
    '--p-accent2': spec.p[5],
    '--sg-radius': normRadius(spec.radius),
    '--sg-blur': `${spec.blur}px`,
  }
  if (spec.status) {
    raw['--ok'] = spec.status[0]
    raw['--bad'] = spec.status[1]
    raw['--warn'] = spec.status[2]
  }
  return raw
}

/** The CSS snippet the copy button puts on the clipboard. */
export const cssSnippet = (spec: StageSpec): string =>
  [
    `/* ${spec.name} — ${spec.mode}${spec.dark ? ' (dark)' : ''} */`,
    '.aek-stage {',
    spec.p.map((c, i) => `  --p-${['bg', 'surface', 'text', 'muted', 'accent', 'accent2'][i]}: ${c};`).join('\n'),
    `  --sg-radius: ${normRadius(spec.radius)};`,
    `  --sg-blur: ${spec.blur}px;`,
    ...(spec.status ? spec.status.map((c, i) => `  --${['ok', 'bad', 'warn'][i]}: ${c};`) : []),
    '}',
  ].join('\n')

/** The persisted favorites (spec ids); broken storage degrades to none. */
export const readFavorites = (): ReadonlySet<string> => {
  try {
    const raw = window.localStorage.getItem(FAV_KEY)
    const list = raw ? (JSON.parse(raw) as unknown[]) : []
    return new Set(list.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

/** Persist the favorites set; storage refusals degrade to in-memory only. */
export const writeFavorites = (next: ReadonlySet<string>): void => {
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify([...next]))
  } catch {
    /* private-mode storage may refuse; favorites stay in-memory */
  }
}
