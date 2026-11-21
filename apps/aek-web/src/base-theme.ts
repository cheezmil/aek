/**
 * BQ round (m10857 item 5): the base appearance of the whole webui —
 * `light` (default) / `dark` / `auto` (follow the OS color scheme). The
 * value is persisted through the settings layer (`aek-home.baseTheme`,
 * rendered by the settings page from settings-schema.ts); this module
 * applies it as the `.dark` class on `<html>`, which index.css's dark
 * palette table targets and Tailwind's `dark:` variant already knows.
 *
 * @module @cheezmil/aek-web/src/base-theme
 */
import { useEffect } from 'react'

import { usePref } from './preferences.tsx'

export type BaseTheme = 'light' | 'dark' | 'auto'

/** usePref parser — anything not one of the three states falls back. */
export function parseBaseTheme(raw: unknown): BaseTheme | undefined {
  return raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : undefined
}

function setDark(on: boolean): void {
  document.documentElement.classList.toggle('dark', on)
}

/** Apply a base theme to the document; returns a cleanup function. */
export function applyBaseTheme(theme: BaseTheme): () => void {
  if (theme !== 'auto') {
    setDark(theme === 'dark')
    return () => { setDark(false) }
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  setDark(mq.matches)
  const onChange = (e: MediaQueryListEvent): void => { setDark(e.matches) }
  mq.addEventListener('change', onChange)
  return () => {
    mq.removeEventListener('change', onChange)
    setDark(false)
  }
}

/**
 * Read the persisted `aek-home.baseTheme` setting (default `light`) and
 * keep the document in sync with it — including live OS-scheme changes
 * while in `auto` mode. Call once at the console root (Home.tsx).
 */
export function useBaseTheme(): void {
  const [theme] = usePref<BaseTheme>('aek-home.baseTheme', 'light', parseBaseTheme)
  useEffect(() => applyBaseTheme(theme), [theme])
}
