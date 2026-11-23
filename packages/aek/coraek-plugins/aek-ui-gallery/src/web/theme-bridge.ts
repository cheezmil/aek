/**
 * BQ8 round: the embedding aek-web console posts the currently selected art
 * spec (the "UI 风格设置" panel) so the component gallery renders in the
 * user's chosen style. The parent sends `{ type: 'aek-theme', spec }`
 * whenever the selection changes; we override the globals.css token block
 * inline on <html> so it wins over both the :root and .dark defaults, and
 * toggle the dark class to match the spec.
 */

export interface AekThemeSpec {
  /** [bg, surface, text, muted, accent, accent2] */
  p: string[]
  radius?: string
  dark?: boolean
}

const set = (k: string, v: string): void => {
  document.documentElement.style.setProperty(k, v)
}

export function applyAekTheme(spec: AekThemeSpec): void {
  const root = document.documentElement
  if (!Array.isArray(spec.p) || spec.p.length < 6) return
  const [bg, surface, text, muted, accent, accent2] = spec.p
  root.classList.toggle('dark', !!spec.dark)
  // next-themes' ThemeProvider re-asserts its class on its first post-mount
  // effect; re-assert ours one frame later so `dark:` utility variants in the
  // ported demos track the selected style, not the system appearance.
  requestAnimationFrame(() => { root.classList.toggle('dark', !!spec.dark) })
  set('--background', bg)
  set('--foreground', text)
  set('--card', surface)
  set('--popover', surface)
  set('--primary', accent)
  set('--primary-foreground', bg)
  set('--secondary', surface)
  set('--secondary-foreground', text)
  set('--muted', surface)
  set('--muted-foreground', muted)
  set('--accent', accent2)
  set('--accent-foreground', text)
  // subtle borders: a low-alpha wash of the muted tone reads well on both palettes
  set('--border', `color-mix(in srgb, ${muted} 25%, transparent)`)
  set('--input', `color-mix(in srgb, ${muted} 30%, transparent)`)
  set('--ring', accent)
  // secondary semantic tokens: derived from the 6-slot palette so the whole
  // page follows the selected style, not just the core set.
  set('--destructive', accent)
  set('--chart-1', accent)
  set('--chart-2', accent2)
  set('--chart-3', text)
  set('--chart-4', muted)
  set('--chart-5', surface)
  // sidebar family (shadcn sidebar component tokens)
  set('--sidebar', bg)
  set('--sidebar-foreground', text)
  set('--sidebar-primary', accent)
  set('--sidebar-primary-foreground', bg)
  set('--sidebar-accent', accent2)
  set('--sidebar-accent-foreground', text)
  set('--sidebar-border', `color-mix(in srgb, ${muted} 25%, transparent)`)
  set('--sidebar-ring', accent)
  // `8`, `0.5rem`, `12px` → px form (the radius-sm/md/lg vars derive from --radius)
  if (spec.radius) {
    const m = /^([\d.]+)\s*(px|rem)?$/u.exec(spec.radius.trim())
    if (m) set('--radius', m[2] === 'rem' ? `${(Number(m[1]) * 16).toFixed(0)}px` : `${m[1]}px`)
  }
}

/** Listen for the parent's theme messages (same-origin only). */
export function initAekThemeBridge(): void {
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return
    const d = e.data as { type?: string; spec?: AekThemeSpec } | null
    if (d && d.type === 'aek-theme' && d.spec) applyAekTheme(d.spec)
  })
  // Mount handshake: ask the embedding console to (re)send its current spec,
  // in case our own load finished after the parent's first post had already
  // been dropped. The parent answers with `{ type: 'aek-theme', spec }`.
  window.parent.postMessage({ type: 'aek-art-theme-request' }, window.location.origin)
}
