import path from 'node:path'
import type { DoctorReport, SkillHome } from '../model/index.js'
import { isBrokenSymlink, type FileSystemPort } from '../ports/filesystem.js'
import type { GitPort } from '../ports/git.js'
import { RegistryService } from './registry-service.js'
import { DistributeService } from './distribute-service.js'
import { CatalogService } from './catalog-service.js'
import { CostLedgerService } from './cost-ledger-service.js'
import { SecurityScanService } from './security-scan.js'
import { inspectSkillTree } from '../../shared/skill-tree.js'
import { fileURLToPath } from 'node:url'
import { loadSystemSkillManifest, SYSTEM_SKILL_SHELF_DIR } from '../../shared/system-skill-manifest.js'
import { listUndefinedSystemSkills } from './system-skill-guard.js'

const CATALOG_STALE_DAYS = 90

export class DoctorService {
  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort,
    private readonly home: SkillHome,
    private readonly registry: RegistryService,
    private readonly distribute: DistributeService,
    private readonly catalog: CatalogService,
    private readonly costLedger: CostLedgerService,
    private readonly security: SecurityScanService,
  ) {}

  check(): DoctorReport {
    const warnings: string[] = []
    if (this.fs.kind(this.home.registryFile) !== 'file') warnings.push(`Missing registry: ${this.home.registryFile}`)
    if (this.fs.kind(this.home.skillsDir) !== 'directory') warnings.push(`Missing skills directory: ${this.home.skillsDir}`)
    const leftover = this.distribute.leftoverViewWarning()
    if (leftover) warnings.push(leftover)
    const doubleNested = this.findDoubleNestedSkills()
    if (doubleNested.length > 0) {
      warnings.push(`${doubleNested.length} skill(s) have a redundant nested copy (<skill>/<skill>/SKILL.md): ${doubleNested.join(', ')}; remove the inner directory (it is never discovered and breaks the refresh fingerprint)`)
    }
    const undefinedSystem = this.findUndefinedSystemSkills()
    if (undefinedSystem.length > 0) {
      warnings.push(`${undefinedSystem.length} undeclared system skill(s) in ${SYSTEM_SKILL_SHELF_DIR}/ (no package in system-skills.yml): ${undefinedSystem.join(', ')}; run \`aeksm bootstrap\` to back them up into .backups/`)
    }
    warnings.push(...this.distribute.archivedDistributedWarnings())
    const brokenLinks = [...this.findBrokenLinks([this.home.collectionsDir]), ...this.distribute.runtimeBrokenLinks()].sort()
    const gitStatus = this.git.statusShort(this.home.root)
    const distribution = this.distribute.status()
    if (distribution.outdated > 0) warnings.push(`${distribution.outdated} distributed skill(s) are outdated versus the hub`)
    if (distribution.foreign > 0) warnings.push(`${distribution.foreign} unmanaged file(s) in consumer runtime skill directories`)
    const catalog = this.catalog.snapshotInfo()
    if (catalog.ageDays > CATALOG_STALE_DAYS) {
      warnings.push(`Agent catalog snapshot is ${catalog.ageDays} days old (upstream ${catalog.commit.slice(0, 10)}); run \`aeksm catalog refresh\` to update`)
    }
    const importedWithoutSource = Object.entries(this.registry.load().skills || {})
      .filter(([, entry]) => entry.imported && !entry.source?.url)
      .map(([skill, entry]) => ({ skill, importedAt: entry.imported_at ?? null }))
      .sort((a, b) => a.skill.localeCompare(b.skill))
    if (importedWithoutSource.length > 0) {
      warnings.push(`${importedWithoutSource.length} imported skill(s) have no managed source and may be stale; supply one with \`aeksm edit <skill> --source-url <url>\` to enable updates`)
    }
    // The account, not an illness: the ledger is always attached untouched, and
    // resident cost earns a warning only when scattered duplicates exist.
    const residentCost = this.costLedger.ledger()
    const { scattered } = residentCost.suggestions
    if (scattered.length > 0) {
      warnings.push(`${scattered.length} scattered skill(s) distributed across several runtime paths; run \`aeksm cost\` for the resident-cost account and consolidation hints`)
    }
    // Same pattern for security: rollup always present; warn only on high.
    // Scan set matches `audit security` with no args (non-archived hub skills).
    const security = this.security.hubSummary(this.registry.listSkills().map(skill => skill.name))
    if (security.high > 0) {
      const skillNoun = security.skillsWithHigh.length === 1 ? 'skill' : 'skills'
      const findingNoun = security.high === 1 ? 'finding' : 'findings'
      warnings.push(
        `${security.high} high-severity security ${findingNoun} across ${security.skillsWithHigh.length} ${skillNoun}; run \`aeksm audit security --strict\` (CI example: examples/github-actions/audit-security.yml)`,
      )
    }
    return {
      skillHome: this.home.root,
      skillCount: this.registry.listCanonicalSkills().length,
      distribution,
      brokenLinks,
      warnings,
      gitStatus,
      catalog,
      importedWithoutSource,
      residentCost,
      security,
    }
  }

  /** Report hub skills carrying a redundant `<skill>/<skill>/SKILL.md` layer. */
  private findDoubleNestedSkills(): string[] {
    return this.registry.listSkills()
      .filter(skill => inspectSkillTree(this.fs, this.registry.skillDir(skill.name), skill.name).kind !== 'clean')
      .map(skill => skill.name)
      .sort()
  }

  /** Read-only check; the manifest is a shipped asset, so a missing one is
   *  reported by bootstrap and must not make `doctor` crash. */
  private findUndefinedSystemSkills(): string[] {
    try {
      const manifest = loadSystemSkillManifest(path.dirname(fileURLToPath(import.meta.url)))
      return listUndefinedSystemSkills(this.fs, this.home.root, manifest)
    } catch {
      return []
    }
  }

  private findBrokenLinks(roots: string[]) {
    const broken: string[] = []
    const walk = (dir: string) => {
      if (this.fs.kind(dir) !== 'directory') return
      for (const entry of this.fs.readDirectory(dir)) {
        const full = path.join(dir, entry.name)
        if (entry.kind === 'directory') walk(full)
        if (entry.kind === 'symlink' && isBrokenSymlink(this.fs, full)) broken.push(full)
      }
    }
    for (const root of roots) walk(root)
    return broken.sort()
  }
}
