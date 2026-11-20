/**
 * Add-view source detection (the badge beside the source input): a display-
 * side mirror of the aeksm engine's source parsing rules
 * (`source-service.ts` — local path / zip·tar archive / `owner/repo` / git
 * URL / generic http(s)). The engine stays the authority; this only names
 * what the input looks like so the operator sees which install path they
 * are about to take.
 */

export type SourceKind =
  | 'empty'
  | 'local-dir'
  | 'zip-archive'
  | 'owner-repo'
  | 'git-repo'
  | 'http-url'

/** Archive suffixes the engine's extractZipArchive face understands. */
const ARCHIVE_SUFFIXES = ['.zip', '.tar.gz', '.tgz', '.tar']

/** Git-host domains (the engine's git-host check, display side). */
const GIT_HOSTS = ['github.com', 'gitlab.com', 'gitee.com', 'codeberg.org', 'git.sr.ht']

/** `owner/repo`: exactly two clean segments, no archive suffix (a local
 *  subpath like `owner/repo/sub` stays a local directory). */
function isOwnerRepo(text: string): boolean {
  if (ARCHIVE_SUFFIXES.some(suffix => text.toLowerCase().endsWith(suffix))) return false
  const segments = text.split('/')
  if (segments.length !== 2) return false
  return segments.every(
    segment =>
      segment.length > 0
      && segment.length < 64
      && !segment.includes(' ')
      && !segment.includes('\\')
      && !segment.startsWith('.')
      && !segment.includes(':'),
  )
}

/**
 * Name the source a string input describes. Unrecognized non-archive,
 * non-repo text falls back to `local-dir` (the engine reads it as a local
 * path and reports the error if it is not one).
 */
export function detectSourceKind(input: string): SourceKind {
  const text = input.trim()
  if (text === '') return 'empty'
  if (/^https?:\/\//i.test(text)) {
    let host = ''
    let path = ''
    try {
      const url = new URL(text)
      host = url.hostname.toLowerCase()
      path = url.pathname
    } catch {
      return 'http-url'
    }
    const isGitHost = GIT_HOSTS.some(candidate => host === candidate || host.endsWith(`.${candidate}`))
    const repoSegments = path.replace(/\.git$/i, '').split('/').filter(Boolean)
    if (isGitHost && repoSegments.length === 2) return 'git-repo'
    return 'http-url'
  }
  const lower = text.toLowerCase()
  if (ARCHIVE_SUFFIXES.some(suffix => lower.endsWith(suffix))) return 'zip-archive'
  if (isOwnerRepo(text)) return 'owner-repo'
  return 'local-dir'
}
