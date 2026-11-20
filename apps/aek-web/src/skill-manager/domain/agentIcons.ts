/**
 * Agent brand-icon resolution for the Skill Manager rail (BH round, Plan C).
 *
 * The reference (xingkongliang/skills-manager) ships 51 per-agent brand
 * glyphs (MIT) under `public/agent-icons/`. We copy those assets into
 * `src/assets/agent-icons/` and let Vite emit them (`import.meta.glob` with
 * `?url` → hashed asset URLs, relative-safe under `base: './'`).
 *
 * The reference keys its table by a snake_case tool key; the aeksm agent
 * catalog (agent-catalog.json) is kebab-case. `resolveAgentIconKey` bridges
 * the two: normalize kebab → snake, then apply a small alias table for the
 * few ids whose snake form is not a reference key (e.g. `dsh` →
 * `deepseek_harness`, `roo` → `roo_code`). Ids with no brand glyph resolve
 * to `null` and the `AgentIcon` component falls back to a globe mark.
 *
 * aek-web is light-theme only, so the reference's dark-mode monochrome
 * invert is a no-op here and is intentionally omitted.
 */

/** Reference table: snake_case agent key → icon file name (51 entries). */
const AGENT_ICON_FILES: Readonly<Record<string, string>> = {
  adal: 'adal.png',
  amp: 'amp.svg',
  antigravity: 'antigravity.png',
  augment: 'augment.svg',
  bob: 'bob.png',
  claude_code: 'claude_code.svg',
  cline: 'cline.png',
  codebuddy: 'codebuddy.svg',
  codex: 'codex.svg',
  command_code: 'command_code.svg',
  continue: 'continue.png',
  cortex: 'cortex.png',
  crush: 'crush.png',
  cursor: 'cursor.png',
  deepagents: 'deepagents.png',
  deepseek_harness: 'deepseek_harness.svg',
  droid: 'droid.svg',
  firebender: 'firebender.svg',
  gemini_cli: 'gemini_cli.svg',
  github_copilot: 'github_copilot.png',
  gitlab_duo: 'gitlab_duo.svg',
  goose: 'goose.png',
  grok: 'grok.svg',
  hermes: 'hermes.png',
  iflow: 'iflow.png',
  junie: 'junie.png',
  kilo_code: 'kilo_code.svg',
  kimi: 'kimi.svg',
  kiro: 'kiro.svg',
  kode: 'kode.png',
  mcpjam: 'mcpjam.png',
  mistral_vibe: 'mistral_vibe.svg',
  mux: 'mux.png',
  neovate: 'neovate.png',
  omp_agent: 'oh_my_pi.svg',
  openclaw: 'openclaw.svg',
  opencode: 'opencode.png',
  openhands: 'openhands.png',
  pi: 'pi.svg',
  pochi: 'pochi.png',
  qoder: 'qoder.svg',
  qwen_code: 'qwen_code.png',
  replit: 'replit.png',
  roo_code: 'roo_code.svg',
  trae: 'trae.svg',
  trae_cn: 'trae_cn.svg',
  warp: 'warp.svg',
  windsurf: 'windsurf.svg',
  workbuddy: 'workbuddy.png',
  zencoder: 'zencoder.png',
  zcode: 'zcode.svg',
}

/**
 * aeksm catalog ids whose snake-normalized form is not a reference key,
 * mapped to the reference key that does own their brand glyph.
 */
const AGENT_ICON_ALIASES: Readonly<Record<string, string>> = {
  dsh: 'deepseek_harness',
  hermes_agent: 'hermes',
  iflow_cli: 'iflow',
  kilo: 'kilo_code',
  kimi_code_cli: 'kimi',
  kiro_cli: 'kiro',
  qoder_cn: 'qoder',
  roo: 'roo_code',
}

/**
 * Eager glob of every brand glyph as an asset URL, keyed by file name.
 * `query: '?url'` makes Vite emit each file and hand back its (relative,
 * `base: './'`-safe) URL instead of inlining it.
 */
const ICON_URLS: ReadonlyMap<string, string> = new Map(
  Object.entries(
    import.meta.glob<string>('../../assets/agent-icons/*', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(entry => [entry[0].split('/').pop() as string, entry[1]] as [string, string]),
)

/** Normalize an aeksm agent id (kebab-case) to the reference snake form. */
export function normalizeAgentIconKey(agentId: string): string {
  return agentId.trim().toLowerCase().replace(/-/g, '_')
}

/**
 * Resolve an aeksm agent id to a reference icon key.
 * @param agentId - an aeksm catalog agent id.
 * @returns the reference key that owns a glyph, or `null` when the agent
 *          has no brand icon (the caller then renders the globe fallback).
 */
export function resolveAgentIconKey(agentId: string): string | null {
  const snake = normalizeAgentIconKey(agentId)
  const candidate = AGENT_ICON_ALIASES[snake] ?? snake
  return candidate in AGENT_ICON_FILES ? candidate : null
}

/**
 * The asset URL for an agent's brand glyph.
 * @param agentId - an aeksm catalog agent id.
 * @returns the hashed asset URL, or `null` when the agent has no glyph.
 */
export function agentIconUrl(agentId: string): string | null {
  const key = resolveAgentIconKey(agentId)
  if (key === null) return null
  const file = AGENT_ICON_FILES[key]
  return file ? (ICON_URLS.get(file) ?? null) : null
}

/** @param agentId - an aeksm catalog agent id. @returns whether a glyph exists. */
export function hasAgentIcon(agentId: string): boolean {
  return agentIconUrl(agentId) !== null
}
