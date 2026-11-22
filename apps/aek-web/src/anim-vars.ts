import { setSkinAnimMs } from './webui-art-gallery/artGlobalTheme.ts'
import type { PrefValue } from './preferences.tsx'

/**
 * BJ round (m04565 + m04792): the PERIODIC writer for the web UI's
 * animation CSS variables. The user's ruling (m04792): "用 interval 定时器
 * 周期性的写入变量，就不用开开关的时候才生效了" — the animation durations
 * must track the live settings continuously, independent of any switch or
 * panel (re)mount:
 *
 * - `aek-home.skinAnimMs` → `--aek-skin-anim-ms` on `<html>` (the
 *   `.aek-skin-anim` one-shot glide class lives on `<html>`, so a
 *   layout-root variable from `sidebarCssVars` can not reach it; the
 *   writer also feeds the artGlobalTheme module timer via
 *   {@link setSkinAnimMs});
 * - `aek-home.animHoverFade` → `--aek-row-actions-fade` on `<html>`
 *   (the row hover-action card fade; writing it on the document root
 *   keeps every rail consistent, even where the sidebar div-level
 *   variable from `sidebarCssVars` would not cascade).
 *
 * The interval reads the DRAFT settings map (sliders live-preview while
 * unsaved), clamps to the schema ranges, and only touches the DOM when a
 * value actually changed (no style churn on every tick).
 *
 * @module @cheezmil/aek-web/src/anim-vars
 */

/** The 基础设置 → 动画 group's two CSS-variable-driven fields (schema `animation` group). */
const SKIN_ANIM_MS_KEY = 'aek-home.skinAnimMs'
const ANIM_HOVER_FADE_KEY = 'aek-home.animHoverFade'

/** Schema defaults (settings-schema.ts), used before the host map lands. */
const SKIN_ANIM_MS_DEFAULT = 320
const ANIM_HOVER_FADE_DEFAULT = 200

/** The writer's cadence — fast enough to feel live, cheap enough to be a no-op. */
const SYNC_INTERVAL_MS = 250

const clampMs = (raw: unknown, min: number, max: number, fallback: number): number => {
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/**
 * Start the periodic animation-variable writer.
 * @param readPrefs - returns the CURRENT draft settings map (may be
 *   `undefined` before the first host read lands — the defaults apply).
 * @returns the stop function (clears the interval).
 */
export function startAnimVarsSync(readPrefs: () => Record<string, PrefValue> | undefined): () => void {
  const el = document.documentElement
  let lastSkinMs = -1
  let lastFadeMs = -1
  const tick = (): void => {
    const prefs = readPrefs() ?? {}
    const skinMs = clampMs(prefs[SKIN_ANIM_MS_KEY], 0, 1000, SKIN_ANIM_MS_DEFAULT)
    const fadeMs = clampMs(prefs[ANIM_HOVER_FADE_KEY], 0, 500, ANIM_HOVER_FADE_DEFAULT)
    if (skinMs !== lastSkinMs) {
      lastSkinMs = skinMs
      // Writes `--aek-skin-anim-ms` on <html> AND carries the number into
      // the artGlobalTheme module timer (the one-shot glide class removal).
      setSkinAnimMs(skinMs)
    }
    if (fadeMs !== lastFadeMs) {
      lastFadeMs = fadeMs
      el.style.setProperty('--aek-row-actions-fade', `${fadeMs}ms`)
    }
  }
  tick()
  const id = window.setInterval(tick, SYNC_INTERVAL_MS)
  return (): void => {
    window.clearInterval(id)
  }
}
