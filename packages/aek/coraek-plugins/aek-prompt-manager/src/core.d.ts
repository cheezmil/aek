/**
 * Sidecar declarations for the plain-JS `core.js` engine module. Keep in
 * sync with the JS exports. The engine stays JavaScript (shipped from
 * source, run directly by the `aekpm` bin); the Coraek host half imports it
 * through this declaration file.
 */
import type { ToolDef } from './platforms.js'

export const HEAD: string
export const HEAD_SHARED: string
export const END_SHARED: string
export const END: string
export const HEAD_SYS: string
export const END_SYS: string
export const SYS_PROMPT_DIR_NAME: string
export const PLATFORM_FILES: readonly string[]
export function PLATFORM_FILE(name: string): string
export const MAPPING_SOURCE: string
export const ONLY_PATCH_SOURCE: string
export function sourceRoot(source: string): string
export function aekDir(): string
export const MAPPING_ROOT: string
export const ONLY_PATCH_ROOT: string
export function toolDirNameFor(toolId: string): string
export function sharedDir(source: string): string
export function toolDir(source: string, toolId: string): string
export function sysPromptDir(source: string): string
export function currentPlatform(): string
export function readPlatformBundle(dir: string, platform: string): Promise<string>
export function buildBlock(toolId: string, sharedContent?: string, toolContent?: string, sysPromptContent?: string): string
export function mergeBlock(
  fileContent: string,
  toolId: string,
  sharedContent: string,
  toolContent: string,
  fileHeader?: string,
  sysPromptContent?: string,
): { content: string; replaced: boolean }
export function isWSL(): boolean
export function windowsNativeTargets(tool: ToolDef, toolId: string): string[]
export function windowsNativeTarget(tool: ToolDef, toolId: string): string

export interface PatchWrite {
  path: string
}
export interface OperationResult {
  toolId: string
  source: string
  target: string
  replaced: boolean
  writes: readonly PatchWrite[]
  platform: string
  winTarget: string
  winTargets: readonly string[]
  shared: boolean
  tool: boolean
}
export interface RemoveResult {
  toolId: string
  target: string
  removed: boolean
  winTargets: readonly string[]
}

/**
 * "patch" mode = global-prompt-mapping source: the managed block is
 * REPLACED in place on repeat runs.
 */
export function patch(tool: ToolDef, force?: boolean): Promise<OperationResult>
/**
 * "apply" mode = only-patch source: block APPENDED to end of file
 * (replaced in place when a block already exists).
 */
export function apply(tool: ToolDef, force?: boolean): Promise<OperationResult>
/** Remove the managed block from the tool's global prompt file. */
export function unpatch(tool: ToolDef): Promise<RemoveResult>
