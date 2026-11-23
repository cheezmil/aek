/**
 * BQ10: SPA-local i18n for the moved art-gallery panel.
 *
 * The host aek-web `i18n.tsx` drops all `art.*` keys (the panel is the only
 * consumer and it now lives here). This module owns the `art.*` dict
 * (generated into ./art-i18n.ts by scripts/aek/extract-art-i18n.mjs) plus the
 * same `t` / `tf` / `spaceMixed` funnels so the moved panel's `useI18n()` calls
 * keep resolving. The active locale is read from the host's `aek-home.locale`
 * pref via the same-origin `/api/aek/preferences` endpoint (preferences shim).
 */
import { createContext, useContext, type ReactNode } from 'react'
import { ART_I18N, type ArtLocale } from './art-i18n.ts'
import { oneOf, PREF_KEYS, usePref } from './preferences.tsx'

export const LOCALES = ['zh-CN', 'en-US'] as const
export type Locale = ArtLocale

/**
 * CJK↔Latin boundary spacing. One space at each CJK↔(letter/digit) boundary,
 * both directions; CJK punctuation is NOT in the class; pure-EN / pure-CJK
 * strings pass through. Copied verbatim from the host i18n so typography
 * matches the console.
 * @param text - translated (or interpolated) text.
 * @returns the text with CJK↔Latin boundaries spaced.
 */
export function spaceMixed(text: string): string {
  const CJK = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'
  return text
    .replace(new RegExp(`([${CJK}])([A-Za-z0-9])`, 'g'), '$1 $2')
    .replace(new RegExp(`([A-Za-z0-9])([${CJK}])`, 'g'), '$1 $2')
}

/** Values available through {@link useI18n}. */
export interface I18nValue {
  /** Active locale. */
  locale: Locale
  /** Switch the display language (SPA-local). */
  setLocale: (locale: Locale) => void
  /** Translate one key. */
  t: (key: string) => string
  /** Translate one key, interpolating `{name}` placeholders. */
  tf: (key: string, values?: Readonly<Record<string, string | number>>) => string
}

const I18nContext = createContext<I18nValue | undefined>(undefined)

/**
 * Provide the active locale and translators to the SPA tree.
 * @param props - child tree.
 * @returns the provider.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setStored] = usePref<Locale>(PREF_KEYS.locale, 'zh-CN', oneOf(LOCALES))
  const t = (key: string): string => spaceMixed(ART_I18N[locale][key] ?? ART_I18N['zh-CN'][key] ?? key)
  const tf = (key: string, values?: Readonly<Record<string, string | number>>): string =>
    spaceMixed(t(key).replace(/\{(\w+)\}/gu, (match, name: string) =>
      values !== undefined && name in values ? String(values[name]) : match))
  return (
    <I18nContext.Provider value={{ locale, setLocale: setStored, t, tf }}>
      {children}
    </I18nContext.Provider>
  )
}

/**
 * Read the active locale and translators.
 * @returns the i18n value.
 * @throws when used outside {@link I18nProvider}.
 */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (value === undefined) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
