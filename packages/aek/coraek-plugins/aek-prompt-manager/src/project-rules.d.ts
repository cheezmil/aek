/**
 * Sidecar declarations for the plain-JS `project-rules.js` engine module.
 * Keep in sync with the JS exports.
 */

export const PR_ROOT_DIR: string
export const AGENTS_DIR: string
export const SCRIPTS_DIR: string
export const BACKUP_DIR: string
export const ALL_AGENT_FILE: string

export function targetGroupDir(targetRelPath: string): string

export interface ProjectAgent {
  displayName: string
  targets: (projectRoot: string) => string[]
}

/** `all` + every project-rule agent id. */
export const SUPPORTED_PROJECT_IDS: readonly string[]
export function listProjectAgents(): string[]
export function prRoot(projectRoot: string): string
export function prAgentsDir(projectRoot: string): string
export function prScriptsDir(projectRoot: string): string
export function prBackupDir(projectRoot: string): string
export function prAllFile(projectRoot: string): string
export function prAgentFile(projectRoot: string, agentId: string): string
export function prScriptFile(projectRoot: string, agentId: string): string

/** Resolve one project-rule agent; throws on an unknown id. */
export function findProjectAgent(id: string): ProjectAgent
export function projectAgentName(id: string): string
export function projectAgentTargets(agentId: string, projectRoot: string): string[]
export function groupAgents(agentId: string): string[]

export interface PrFileEntry {
  path: string
  /** true = the file was created by this call; false = it already existed. */
  created: boolean
}
export interface PrInitResult {
  root: string
  files: readonly PrFileEntry[]
}
export interface PrWriteEntry {
  target: string
  replaced: boolean
  content: string
  backup?: string | null
}
export interface PrGenerateResult {
  agentId: string
  generated: number
  writes: readonly PrWriteEntry[]
  root: string
}

/**
 * Create the `.aek/prompt-manager/project-rules` source layout under the
 * project (idempotent: existing files are kept; requires a `.git` marker in
 * the project root itself).
 */
export function initProjectRules(projectRoot?: string): Promise<PrInitResult>
/**
 * Generate the project-local prompt files for one agent (or `all`),
 * auto-initializing the source layout first.
 */
export function generateProjectRules(agentId?: string, projectRoot?: string): Promise<PrGenerateResult>
