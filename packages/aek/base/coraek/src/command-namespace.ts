/**
 * AEK command namespace guard — package-side twin of
 * `scripts/aek/command-namespace.mjs`.
 *
 * AEK plugins are operated ONLY through `aek`-prefixed commands. `dsh` and
 * `dsh-*` are the copied upstream's operator surface; rejecting them here is
 * enforcement in code, not a convention documented in a note.
 *
 * Keep the rule constants in sync with the launcher-side module. The spec
 * suite imports both and asserts identical behaviour on the same inputs.
 *
 * @module @cheezmil/coraek/command-namespace
 */

/** The only legal prefix for an AEK operator-facing command. */
export const AEK_COMMAND_PREFIX = 'aek'

/** Legacy prefixes that must never operate an AEK plugin. */
export const FORBIDDEN_COMMAND_PREFIXES = ['dsh'] as const

/** Human-readable rejection hint shared with the launcher. */
export const FORBIDDEN_COMMAND_HINT =
  'use `aek web` / `aek <profile>` or an aek* plugin CLI (aekws, aekpm, aeksm)'

/** Raised when an operator-facing command is outside the AEK namespace. */
export class CommandNamespaceError extends Error {
  readonly command: string

  constructor(command: string, reason: string) {
    super(`aek: ${reason} (got ${JSON.stringify(command)})`)
    this.name = 'CommandNamespaceError'
    this.command = command
  }
}

/**
 * Reduce a command line, a bin name, or a path to its bare first token.
 * @param commandLine - e.g. `dsh plugin install`, `/usr/bin/dsh-pack-x`, `aek web`
 * @returns e.g. `dsh`, `dsh-pack-x`, `aek`
 */
export function commandName(commandLine: string): string {
  const first = (commandLine ?? '').trim().split(/\s+/)[0] ?? ''
  // A scoped npm name (@deepseek-ai/dsh-desktop) is a package selector, not a
  // command. Only strip a filesystem path prefix such as /usr/bin/dsh-helper.
  if (first.startsWith('@')) return first
  return first.split(/[\\/]/).pop() ?? first
}

/**
 * True when the command belongs to the forbidden legacy namespace.
 * @param commandLine - the operator-facing command to inspect
 */
export function isForbiddenDshCommand(commandLine: string): boolean {
  const bare = commandName(commandLine).toLowerCase()
  return FORBIDDEN_COMMAND_PREFIXES.some(
    prefix => bare === prefix || bare.startsWith(`${prefix}-`),
  )
}

/**
 * True when the command belongs to the AEK namespace (`aek`, `aekws`, `aekpm`, ...).
 * @param commandLine - the operator-facing command to inspect
 */
export function isAekCommand(commandLine: string): boolean {
  return commandName(commandLine).toLowerCase().startsWith(AEK_COMMAND_PREFIX)
}

/**
 * The operator-facing error message for a refused legacy command.
 * @param commandLine - the refused command
 */
export function forbiddenCommandMessage(commandLine: string): string {
  return `aek: ${commandName(commandLine)} is not an AEK command — ${FORBIDDEN_COMMAND_HINT}`
}

/**
 * Assert an operator-facing command is legal.
 * @param commandLine - the operator-facing command to inspect
 * @throws {CommandNamespaceError} on any legacy or non-AEK prefix
 */
export function assertAekCommand(commandLine: string): void {
  if (isForbiddenDshCommand(commandLine)) {
    throw new CommandNamespaceError(
      commandLine,
      `dsh-prefixed commands are forbidden by code; ${FORBIDDEN_COMMAND_HINT}`,
    )
  }
  if (!isAekCommand(commandLine)) {
    throw new CommandNamespaceError(
      commandLine,
      `commands must use the ${JSON.stringify(AEK_COMMAND_PREFIX)} prefix`,
    )
  }
}
