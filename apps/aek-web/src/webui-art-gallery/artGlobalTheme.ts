/**
 * Whole-webui skinning (BP round, m10318 item 6): apply a gallery spec to
 * the entire aek webui, not just the stage. The webui's cascade is two
 * layers — the aek source tokens (`--aek-*`, index.css :root) drive the
 * shadcn mapping layer (`--background: var(--aek-bg)` …) and Tailwind's
 * `--font-sans` — so writing inline overrides on
 * `document.documentElement` flips every mapping from one spot. The
 * active spec id persists in localStorage and boot() restores it on app
 * start (main.tsx calls it before render).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/artGlobalTheme
 */
import { allSpecs, normRadius, type StageSpec } from './spec.ts'

const GLOBAL_KEY = 'aek-art-global-theme'

/** [bg, surface, text, muted, accent] → the aek source tokens to override. */
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
