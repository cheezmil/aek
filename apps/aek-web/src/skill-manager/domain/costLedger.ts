/**
 * The resident-cost ledger's UI domain (ADR-0018): pure derivations over the
 * wire shape of GET /api/cost — the top cost line's visibility, the `≈`-style
 * display form, and a skill's per-path footprint for the preview's 接入
 * expansion. The ledger itself never enters /api/state (US24): the strip and
 * the preview lazy-load it and pass it through these helpers only.
 */

export type CostSkillLine = {
  skill: string
  tokens: number
  nameTokens: number
  descriptionTokens: number
  /** True when the SKILL.md carries no description — counted name-only (US15). */
  incomplete?: boolean
  /** True when the hub entry is archived but still distributed (US11). */
  archived?: boolean
}

export type CostPathGroup = {
  runtimeDir: string
  kind: 'user' | 'project'
  /** The agent family this path serves — noted, so shared paths never double-count (US4). */
  agents: string[]
  tokens: number
  skills: CostSkillLine[]
}

export type CostLedger = {
  method: 'char-approx'
  totalTokens: number
  /** Unmanaged (foreign) entries in known runtime roots: counted as present, never itemized (US6). */
  unmanaged: number
  paths: CostPathGroup[]
  suggestions: {
    archived: Array<{ skill: string; runtimeDir: string; tokens: number; command: string }>
    topDescriptions: Array<{ skill: string; runtimeDir: string; tokens: number; command: string }>
    scattered: Array<{ skill: string; runtimeDirs: string[]; commands: string[] }>
  }
  errors: Array<{ skill: string; runtimePath: string; reason: string }>
}

/** The top cost line appears once any physical path carries a distribution —
 *  an undistributed library has zero residency and needs no line (US21). */
export function showCostLine(ledger: CostLedger | null): boolean {
  return ledger !== null && ledger.paths.length > 0
}

/**
 * The display caliber of the resident cost (BM + BQ12 rounds): an agent
 * session only ever carries ONE directory's catalog, so the strip's
 * headline is `max` (what the heaviest session actually pays); `avg` and
 * `total` (the portfolio inventory across all agent runtime dirs) are the
 * reference figures the caliber line must keep visible.
 */
export function costCaliber(ledger: CostLedger): { total: number; dirs: number; avg: number; max: number } {
  let max = 0
  for (const group of ledger.paths) {
    if (group.tokens > max) max = group.tokens
  }
  const dirs = ledger.paths.length
  const avg = dirs > 0 ? Math.round(ledger.totalTokens / dirs) : 0
  return { total: ledger.totalTokens, dirs, avg, max }
}

/** `≈`-prefixed magnitude with `1.2k`-style abbreviation (US13) — the same
 *  display contract as src/core/services/cost-ledger-service.ts's
 *  formatApproxTokens (mirrored, not imported: the web tier bundles no node
 *  deps); change both together so neither surface drifts. */
export function formatApproxTokens(tokens: number): string {
  if (tokens < 1000) return `≈${tokens}`
  const thousands = tokens / 1000
  if (thousands < 100) {
    const abbreviated = thousands.toFixed(1)
    return `≈${abbreviated.endsWith('.0') ? abbreviated.slice(0, -2) : abbreviated}k`
  }
  return `≈${Math.round(thousands)}k`
}

/** This skill's resident tokens in one agent context (the N round: each
 *  library row shows what the skill itself occupies): the ledger counts the
 *  session-catalog line — `name` + the normalized, 500-char-capped
 *  description — per physical directory, so every line for a skill agrees
 *  and one first line is the number. Null when the skill is not in the
 *  ledger (undistributed, ledger not loaded yet, or a 0-count error entry). */
export function skillResidentTokens(ledger: CostLedger | null, skill: string): number | null {
  if (ledger === null) return null
  for (const group of ledger.paths) {
    for (const line of group.skills) {
      if (line.skill === skill) return line.tokens
    }
  }
  return null
}

/** This skill's resident tokens on this physical runtime path (US23): the
 *  preview's 接入 rows carry runtime paths, the ledger groups by their
 *  directory — null when the entry was not counted (ledger not loaded yet,
 *  unknown skill, or an error entry the ledger counted as 0). */
export function footprintOf(ledger: CostLedger | null, skill: string, runtimePath: string): number | null {
  if (ledger === null) return null
  const separator = runtimePath.lastIndexOf('/')
  const runtimeDir = separator === -1 ? runtimePath : runtimePath.slice(0, separator)
  const line = ledger.paths
    .find(group => group.runtimeDir === runtimeDir)
    ?.skills.find(candidate => candidate.skill === skill)
  return line === undefined ? null : line.tokens
}
