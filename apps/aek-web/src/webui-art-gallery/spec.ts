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

/** Derive the 6-slot [bg,surface,text,muted,accent,accent2] palette. */
export const paletteOf = (st: { mode: string; colors: string[] }): string[] => {
  const base: Record<string, string> = MODE_BASE[st.mode] ?? MODE_BASE.saas ?? {}
  const c = st.colors.filter(x => /^#[0-9A-Fa-f]{6}$/.test(x))
  if (!c.length) {
    return [base.bg, base.surface, base.text, base.muted, base.accent, base.accent2]
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
  return [bg, surface, text, muted, accent, accent2]
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
  const styles: GalleryItem[] = ART_STYLES.map(e => ({
    id: e.id,
    kind: 'style',
    spec: styleSpecOf(e),
    desc: e.desc || `${e.kind} · ${e.src}`,
    kindId: e.kindId,
    kindName: e.kind,
    src: e.src,
    srcColor: e.srcColor,
    colors: e.colors,
  }))
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

/** The scanned style entries → comparable specs (346 across 12 kinds). */
export const styleSpecs = (): StageSpec[] => ART_STYLES.map(styleSpecOf)

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
      p: s.p,
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
