/**
 * AEK command namespace — the single source of truth for operator-facing
 * command names used by `scripts/aek/*.mjs`.
 *
 * Every plugin in `packages/` is operated ONLY through `aek`-prefixed
 * commands. `dsh` and `dsh-*` are the copied upstream's command surface and
 * are rejected here by code, not by a note in AGENTS.md.
 *
 * The package-side twin of this module lives at
 * `packages/aek/base/coraek/src/command-namespace.ts`; the two share the same
 * rule constants and the spec suite asserts their behaviour stays in sync.
 *
 * @module scripts/aek/command-namespace
 */

/** The only legal prefix for an AEK operator-facing command. */
export const AEK_COMMAND_PREFIX = 'aek'

/** Legacy prefixes that must never operate an AEK plugin. */
export const FORBIDDEN_COMMAND_PREFIXES = Object.freeze(['dsh'])

/** Human-readable rejection reason, reused by the CLI and the static gate. */
export const FORBIDDEN_COMMAND_HINT =
  'use `aek web` / `aek <profile>` or an aek* plugin CLI (aekws, aekpm, aeksm)'

/**
 * Reduce a command line, a bin name, or a path to its bare first token.
 * @param {string} commandLine e.g. `dsh plugin install`, `/usr/bin/dsh-pack-x`, `aek web`
 * @returns {string} e.g. `dsh`, `dsh-pack-x`, `aek`
 */
export function commandName(commandLine) {
  const first = (commandLine ?? '').trim().split(/\s+/)[0] ?? ''
  // A scoped npm name (@deepseek-ai/dsh-desktop) is a package selector, not a
  // command. Only strip a filesystem path prefix such as /usr/bin/dsh-helper.
  if (first.startsWith('@')) return first
  return first.split(/[\\/]/).pop() ?? first
}

/**
 * True when the command belongs to the forbidden legacy namespace.
 * @param {string} commandLine
 * @returns {boolean}
 */
export function isForbiddenDshCommand(commandLine) {
  const bare = commandName(commandLine).toLowerCase()
  return FORBIDDEN_COMMAND_PREFIXES.some(
    prefix => bare === prefix || bare.startsWith(`${prefix}-`),
  )
}

/**
 * True when the command belongs to the AEK namespace (`aek`, `aekws`, `aekpm`, ...).
 * @param {string} commandLine
 * @returns {boolean}
 */
export function isAekCommand(commandLine) {
  return commandName(commandLine).toLowerCase().startsWith(AEK_COMMAND_PREFIX)
}

/**
 * Build the error text for a rejected invocation.
 * @param {string} commandLine
 * @returns {string}
 */
export function forbiddenCommandMessage(commandLine) {
  return `aek: dsh-prefixed commands are forbidden by code (got ${JSON.stringify(commandLine)}); ${FORBIDDEN_COMMAND_HINT}`
}

/**
 * Assert an operator-facing command is legal. Throws on any legacy or
 * non-AEK prefix.
 * @param {string} commandLine
 * @returns {void}
 * @throws {Error}
 */
export function assertAekCommand(commandLine) {
  if (isForbiddenDshCommand(commandLine)) {
    throw new Error(forbiddenCommandMessage(commandLine))
  }
  if (!isAekCommand(commandLine)) {
    throw new Error(
      `aek: commands must use the ${JSON.stringify(AEK_COMMAND_PREFIX)} prefix (got ${JSON.stringify(commandLine)})`,
    )
  }
}
