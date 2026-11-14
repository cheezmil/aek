/**
 * Shared access to the AEK home stylesheet.
 *
 * `Home.module.css` is compiled by the clientBundle preset with lightningcss:
 * importing it injects one tagged <style> at factory execution and returns the
 * hashed class map. Every surface imports from here so the whole app shares a
 * single stylesheet and a single source of design tokens (`:root` custom
 * properties are deliberately not hashed by CSS Modules).
 *
 * @module @cheezmil/aek-home/src/client/styles
 */
import css from './Home.module.css'

/** The hashed class map for the AEK home surface. */
export { css }

/**
 * Join CSS Modules class names, dropping falsy conditional entries.
 * @param values - class names or falsy placeholders.
 * @returns a className string.
 */
export function cx(...values: readonly (string | false | null | undefined)[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ')
}
