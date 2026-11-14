/**
 * Path display formatting for the AEK console (Q round, 2026-11-12).
 *
 * The host reports ABSOLUTE paths (`/Users/<user>/.aek/...` or
 * `C:\Users\<user>\.aek\...`). The user asked for the home prefix to show
 * as `~/` on macOS / Linux and as `%USERPROFILE%` (with BACKSLASHES) on
 * Windows, switchable to "full" in the settings. The display form is a
 * rendering concern only: copy buttons ALWAYS copy the raw absolute path.
 *
 * The home directory and platform come from the host facts
 * (`/api/aek/console/facts`), never from the client machine: the console
 * may run in a browser on machine A against a host on machine B.
 *
 * @module @cheezmil/aek-home/src/client/paths
 */

/** The two display styles the settings expose. */
export type PathStyle = 'abbreviated' | 'full'

/**
 * Render one host-absolute path in the user's chosen display style.
 * @param absPath - the raw path from the host (`undefined` passes through).
 * @param home - the host's home directory (`os.homedir()`).
 * @param platform - the host platform (`darwin` / `win32` / `linux`).
 * @param style - the display style.
 * @returns the display string.
 */
export function formatDisplayPath(
  absPath: string | undefined,
  home: string | undefined,
  platform: string | undefined,
  style: PathStyle,
): string {
  if (absPath === undefined || absPath.length === 0 || style === 'full') return absPath ?? ''
  if (home === undefined || home.length === 0) return absPath
  if (platform === 'win32') {
    // Windows: home is `C:\Users\<user>`; show `%USERPROFILE%\rest` with
    // backslashes, normalizing any forward slashes the host slipped in.
    const separator = home.endsWith('\\') ? '' : '\\'
    let rest = ''
    if (absPath.startsWith(home + separator)) {
      rest = absPath.slice(home.length + separator.length)
    } else if (absPath.startsWith(home + '/')) {
      rest = absPath.slice(home.length + 1)
    } else {
      return absPath
    }
    return `%USERPROFILE%\\${rest.split('/').join('\\')}`
  }
  // posix: home is `/Users/<user>` or `/home/<user>`; show `~/rest`.
  return absPath.startsWith(home + '/') ? `~${absPath.slice(home.length)}` : absPath
}

/**
 * A short-lived validator for the stored setting value.
 * @param raw - untrusted host value. @returns a valid style, or undefined.
 */
export function parsePathStyle(raw: unknown): PathStyle | undefined {
  return raw === 'abbreviated' || raw === 'full' ? raw : undefined
}
