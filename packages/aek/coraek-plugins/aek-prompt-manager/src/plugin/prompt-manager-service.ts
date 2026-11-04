/**
 * `ctx.promptManager` — the in-process face of the `aekpm` command catalog.
 *
 * The webui remote and the agent model tools (phase 2) call these methods
 * directly; nothing here spawns the CLI (the CLI stays the primary
 * human/script face, this service is the host face of the SAME engine —
 * same operations, same results).
 *
 * The engine is the plain-JS `../core.js` / `../platforms.js` /
 * `../project-rules.js` modules (shipped from source; copied into `lib/`
 * at build time so the compiled service finds them module-relative).
 *
 * Tool operations (`patch`/`map`/`apply`/`remove`/`status`) never throw for
 * per-tool engine failures — each tool reports its outcome in the result
 * array, so a batch over `all` surfaces partial success like the CLI.
 * Project-rules operations are single operations and throw
 * {@link PromptManagerError} with a machine-readable `code`, which travels
 * over the typert remote intact.
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@cheezmil/coraek/types'
import type { PromptManagerPluginConfig } from '../config.js'
import { PLATFORMS, UNSUPPORTED, type ToolDef } from '../platforms.js'
import {
  HEAD,
  apply as engineApply,
  currentPlatform,
  isWSL,
  patch as enginePatch,
  unpatch,
  windowsNativeTargets,
  type OperationResult,
  type RemoveResult,
} from '../core.js'
import {
  findProjectAgent,
  generateProjectRules,
  initProjectRules,
  listProjectAgents,
  projectAgentName,
  type PrGenerateResult,
  type PrInitResult,
} from '../project-rules.js'
import { readFile } from 'node:fs/promises'

/** One machine-readable failure code for engine errors. */
export type PromptManagerErrorCode =
  | 'unsupported-tool'
  | 'no-global-prompt-path'
  | 'empty-source'
  | 'malformed-block'
  | 'unsupported-agent'
  | 'not-git-repo'
  | 'engine'

/**
 * Engine failure with a machine-readable `code` (like the skill-manager
 * `SkillsManagerError`): remote callers can branch on `code` without
 * string-matching messages.
 */
export class PromptManagerError extends Error {
  readonly code: PromptManagerErrorCode

  constructor(code: PromptManagerErrorCode, message: string) {
    super(message)
    this.name = 'PromptManagerError'
    this.code = code
  }
}

function codeFor(message: string): PromptManagerErrorCode {
  if (/Unsupported or unknown tool/i.test(message)) return 'unsupported-tool'
  if (/no global prompt path/i.test(message)) return 'no-global-prompt-path'
  if (/Nothing to/i.test(message)) return 'empty-source'
  if (/Malformed managed block/i.test(message)) return 'malformed-block'
  if (/Unsupported project agent/i.test(message)) return 'unsupported-agent'
  if (/不在 git 仓库内|git 仓库/i.test(message)) return 'not-git-repo'
  return 'engine'
}

function toError(error: unknown): PromptManagerError {
  if (error instanceof PromptManagerError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new PromptManagerError(codeFor(message), message)
}

/** Per-tool failure inside a batch result array. */
export interface ToolError {
  toolId: string
  error: { code: PromptManagerErrorCode; message: string }
}

/** One tool outcome: the engine result on success, a tagged error otherwise. */
export type ToolOutcome<T> = T | ToolError
export function isToolError<T>(outcome: ToolOutcome<T>): outcome is ToolError {
  return typeof outcome === 'object' && outcome !== null && 'error' in outcome
}

/** `status` per-tool entry (mirrors the CLI `status` line, structured). */
export interface ToolStatusEntry {
  id: string
  status: 'patched' | 'not-patched' | 'file-missing'
  target: string
  winTargets: readonly string[]
}
export interface StatusReport {
  platform: string
  wsl: boolean
  tools: readonly ToolStatusEntry[]
}

export type { OperationResult, RemoveResult, PrInitResult, PrGenerateResult }

/**
 * `ctx.promptManager` — the in-process face of the aekpm command catalog.
 */
export class PromptManagerService extends Service {
  /** Reserved for the phase-2 `home` config field; unused in v1. */
  readonly #config: PromptManagerPluginConfig

  constructor(ctx: Context, config: PromptManagerPluginConfig) {
    // Registers itself as `ctx.promptManager` and auto-disposes with the
    // owning fiber (nothing here spawns a process or touches the user dir).
    super(ctx, 'promptManager')
    this.#config = config
  }

  /** The live-resolved plugin config (v1: the empty object). */
  get config(): PromptManagerPluginConfig {
    return this.#config
  }

  // ---------- introspection ----------

  /** Supported tools (id/name + the target label), same list the CLI drives. */
  tools(): readonly { id: string; name: string; label: string }[] {
    return PLATFORMS.map(p => ({ id: p.id, name: p.name, label: p.globalPromptLabel(p.id) }))
  }

  /** Known agent ids without a global prompt file (reported unsupported). */
  unsupportedTools(): readonly string[] {
    return UNSUPPORTED
  }

  /** The running platform (`linux`/`mac`/`windows`/`wsl`). */
  platform(): string {
    return currentPlatform()
  }

  /** True when running inside WSL (Linux side of the dual-write). */
  wsl(): boolean {
    return isWSL()
  }

  // ---------- global prompt operations (the aekpm patch/map/apply/remove) ----------

  /**
   * `aekpm patch` — only-patch source: the block is APPENDED to the end of
   * the tool's global prompt file (replaced in place on repeat runs).
   * `toolId` defaults to `all`; per-tool failures stay in the result.
   */
  patch(toolId: string = 'all', force = false): Promise<ToolOutcome<OperationResult>[]> {
    return this.#eachTool(toolId, tool => engineApply(tool, force))
  }

  /**
   * `aekpm apply` — alias of {@link patch} (the CLI keeps both verbs).
   */
  apply(toolId: string = 'all', force = false): Promise<ToolOutcome<OperationResult>[]> {
    return this.patch(toolId, force)
  }

  /**
   * `aekpm map` — global-prompt-mapping source: the managed block is
   * REPLACED in place, preserving surrounding user content.
   */
  map(toolId: string = 'all', force = false): Promise<ToolOutcome<OperationResult>[]> {
    return this.#eachTool(toolId, tool => enginePatch(tool, force))
  }

  /**
   * `aekpm remove` — strip the managed block from the tool's global prompt
   * (no-op with `removed: false` when absent).
   */
  remove(toolId: string = 'all'): Promise<ToolOutcome<RemoveResult>[]> {
    return this.#eachTool(toolId, tool => unpatch(tool))
  }

  /**
   * `aekpm status` — per-tool managed-block state (or one tool when
   * `toolId` is given).
   */
  async status(toolId: string = 'all'): Promise<StatusReport> {
    const tools = toolId === 'all' ? PLATFORMS : [this.#findTool(toolId)]
    const entries: ToolStatusEntry[] = []
    for (const tool of tools) {
      entries.push(await this.#toolState(tool))
    }
    return { platform: currentPlatform(), wsl: isWSL(), tools: entries }
  }

  // ---------- project-rules operations (the aekpm pr init / pr gen) ----------

  /** `aekpm pr init` — create the project-rules source layout (idempotent). */
  async prInit(projectRoot?: string): Promise<PrInitResult> {
    try {
      return await initProjectRules(projectRoot)
    } catch (error) {
      throw toError(error)
    }
  }

  /**
   * `aekpm pr gen [agent]` — generate the project-local prompt files
   * (default `all`). Unknown agent ids throw `unsupported-agent`.
   */
  async prGenerate(agentId: string = 'all', projectRoot?: string): Promise<PrGenerateResult> {
    try {
      findProjectAgent(agentId) // validate up front: a known failure, not an engine surprise
      return await generateProjectRules(agentId, projectRoot)
    } catch (error) {
      throw toError(error)
    }
  }

  /** Project-rule agent ids + display names, in CLI order. */
  projectAgents(): readonly { id: string; name: string }[] {
    return listProjectAgents().map(id => ({ id, name: projectAgentName(id) }))
  }

  // ---------- internals ----------

  /** Resolve one tool id (throws the CLI's own `unsupported-tool` error text). */
  #findTool(toolId: string): ToolDef {
    const tool = PLATFORMS.find(p => p.id === toolId)
    if (!tool) {
      throw new Error(
        `Unsupported or unknown tool "${toolId}". Supported: ${PLATFORMS.map(p => p.id).join(', ')}.`,
      )
    }
    return tool
  }

  /**
   * Run one engine op over the selected tools (or all), keeping per-tool
   * failures in the result array like the CLI's batch loops.
   */
  async #eachTool<T>(
    toolId: string,
    op: (tool: ToolDef) => Promise<T>,
  ): Promise<ToolOutcome<T>[]> {
    const targets = toolId === 'all' ? [...PLATFORMS] : [this.#findTool(toolId)]
    const outcomes: ToolOutcome<T>[] = []
    for (const tool of targets) {
      try {
        outcomes.push(await op(tool))
      } catch (error) {
        const e = toError(error)
        outcomes.push({ toolId: tool.id, error: { code: e.code, message: e.message } })
      }
    }
    return outcomes
  }

  /** One tool's managed-block state, mirroring the CLI `status` reader. */
  async #toolState(tool: ToolDef): Promise<ToolStatusEntry> {
    const target = tool.globalPromptPath(tool.id)
    const winTargets = windowsNativeTargets(tool, tool.id)
    let content: string
    try {
      content = await readFile(target, 'utf8')
    } catch {
      return { id: tool.id, status: 'file-missing', target, winTargets }
    }
    return {
      id: tool.id,
      status: content.includes(HEAD) ? 'patched' : 'not-patched',
      target,
      winTargets,
    }
  }
}
