/**
 * Whole-webui skinning (BP round, m10318 item 6; BQ round m10857 item 4;
 * BR round m11298 item ④ fully restored the 5-color override): apply a
 * gallery spec's palette (bg/surface/text/muted/accent) + radius + font to
 * the ENTIRE aek webui — the shadcn mapping layer and every panel follow the
 * aek source variables. The AEK base entries (style-aec-base[-dark], BR
 * round m11298 ③) are the escape hatch back to the default look; the brand
 * logo stays locked to fixed --color-logo-* tokens (BQ-1) so it never
 * follows a skin. The active spec id persists in localStorage and boot()
 * restores it on app start (main.tsx calls it before render).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/artGlobalTheme
 */
import { allSpecs, normRadius, type StageSpec } from './spec.ts'

const GLOBAL_KEY = 'aek-art-global-theme'

/** Full palette override — spec p[] slots are [bg, surface, text, muted, accent, accent2]. */
const TOKENS: ReadonlyArray<{ key: string; slot: number }> = [
  { key: '--aek-bg', slot: 0 },
  { key: '--aek-surface', slot: 1 },
  { key: '--aek-text', slot: 2 },
  { key: '--aek-text-muted', slot: 3 },
  { key: '--aek-accent', slot: 4 },
]

const FONT_STACKS: Record<string, string> = {
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
  hand: '"Comic Sans MS", "Segoe Script", cursive',
}

/** Write (or, with `null`, clear) the inline overrides on <html>. */
export const applyGlobalTheme = (spec: StageSpec | null): void => {
  const el = document.documentElement
  for (const t of TOKENS) {
    const v = spec ? spec.p[t.slot] : ''
    if (v) el.style.setProperty(t.key, v)
    else el.style.removeProperty(t.key)
  }
  const radius = spec && spec.radius ? normRadius(spec.radius) : ''
  if (radius) el.style.setProperty('--aek-radius', radius)
  else el.style.removeProperty('--aek-radius')
  const font = spec ? FONT_STACKS[spec.font] : ''
  if (font) el.style.setProperty('--font-sans', font)
  else el.style.removeProperty('--font-sans')
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
