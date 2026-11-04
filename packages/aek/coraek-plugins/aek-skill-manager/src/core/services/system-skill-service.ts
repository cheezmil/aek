import path from 'node:path'
import { createHash } from 'node:crypto'
import type { RegistryEntry } from '../model/index.js'
import type { FileSystemPort } from '../ports/filesystem.js'
import { SkillsManagerError } from '../../shared/errors.js'
import { parseSkillMarkdownMetadata } from '../../shared/validation.js'
import type { RegistryService } from './registry-service.js'
import type { DistributeService } from './distribute-service.js'
import type { ViewService } from './view-service.js'

/** A bundled system skill source: a package root carrying `skills/<name>/SKILL.md`. */
export type SystemSkillBundle = {
  /** Package root carrying `skills/<name>/`. */
  root: string
  /** Package version; the release tag is `v<version>`. */
  version: string
  /** The skill name (directory name inside skills/). */
  skillName: string
  /** Canonical upstream repo URL — the seeded entry's update source. */
  repoUrl: string
}

export type SystemSkillSeedStatus =
  | 'seeded'       // hub had no skill; the bundled copy became it
  | 'refreshed'    // hub copy was exactly what we last seeded; replaced with the bundle
  | 'up-to-date'   // hub copy already matches the bundle
  | 'user-managed' // hub copy was hand-edited or installed from elsewhere — foreign, not ours to touch

export type SystemSkillSeedResult = {
  skill: string
  status: SystemSkillSeedStatus
  /** Fingerprint of whichever copy is canonical after the call. */
  fingerprint: string
}

/** Compare date-versioned release tags segment by segment. */
function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const [main, suffix = ''] = value.replace(/^v/, '').split('-')
    return { parts: main.split('.').map(n => Number(n) || 0), suffix: Number(suffix) || 0 }
  }
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < Math.max(left.parts.length, right.parts.length); i += 1) {
    const delta = (left.parts[i] || 0) - (right.parts[i] || 0)
    if (delta !== 0) return delta
  }
  return left.suffix - right.suffix
}

/**
 * Seed and refresh the hub's system skills from copies bundled inside npm packages.
 * Each AEK package may carry one or more skills under its `skills/` directory.
 * This runs alongside ManagerSkillService during bootstrap and self-check.
 */
export class SystemSkillService {
  constructor(
    private readonly fs: FileSystemPort,
    private readonly registry: RegistryService,
    private readonly distribute: DistributeService,
    private readonly views: ViewService,
  ) {}

  bundledDir(bundle: SystemSkillBundle): string {
    return path.join(bundle.root, 'skills', bundle.skillName)
  }

  /**
   * Seed all bundled system skills into the hub. Called during bootstrap.
   * Returns an array of results — one per bundled skill.
   */
  seedAll(bundles: SystemSkillBundle[]): SystemSkillSeedResult[] {
    return bundles.map(bundle => this.seed(bundle))
  }

  /**
   * Self-check: refresh a single system skill when we still own it.
   * Called on every CLI run (like ManagerSkillService.selfCheck).
   */
  selfCheck(bundle: SystemSkillBundle): SystemSkillSeedResult | null {
    if (!this.registry.skillExists(bundle.skillName)) return null
    return this.seed(bundle)
  }

  seed(bundle: SystemSkillBundle): SystemSkillSeedResult {
    const bundledDir = this.bundledDir(bundle)
    if (this.fs.kind(path.join(bundledDir, 'SKILL.md')) !== 'file') {
      throw new SkillsManagerError('system_skill_bundle_missing', `Bundled system skill not found at ${bundledDir}.`)
    }
    const fingerprint = this.distribute.fingerprintDir(bundledDir)
    if (!this.registry.skillExists(bundle.skillName)) {
      return this.layDown(bundle, bundledDir, fingerprint)
    }
    const hubFingerprint = this.distribute.fingerprint(bundle.skillName)
    // For system skills, compare normalized fingerprints (exclude metadata block)
    // because the frontmatter mirror adds metadata after seeding.
    const bundledNormalized = this.normalizedFingerprint(bundledDir)
    const hubNormalized = this.normalizedFingerprint(this.registry.skillDir(bundle.skillName))
    if (hubNormalized === bundledNormalized) {
      return { skill: bundle.skillName, status: 'up-to-date', fingerprint: hubFingerprint }
    }
    const entry = this.registry.getEntry(bundle.skillName)
    if (!this.oursToRefresh(entry, hubFingerprint, bundle.version)) {
      return { skill: bundle.skillName, status: 'user-managed', fingerprint: hubFingerprint }
    }
    this.layDown(bundle, bundledDir, fingerprint, entry)
    return { skill: bundle.skillName, status: 'refreshed', fingerprint }
  }

  /**
   * Decide whether the hub copy is ours to refresh.
   *
   * We refresh when:
   *   - baseline_hash matches (we seeded it and nobody touched it), OR
   *   - the previous source was `local` (manual placement in aek-system-skill/)
   *     with no baseline — safe to overwrite because it was never "user-managed".
   *
   * We do NOT refresh when baseline_hash differs (user edited the content) or
   * when the bundle version is older than the seeded ref.
   */
  private oursToRefresh(entry: RegistryEntry | undefined, hubFingerprint: string, bundleVersion: string): boolean {
    // Already-owned: baseline matches and bundle is not older than what we seeded
    if (entry?.source?.baseline_hash === hubFingerprint) {
      const seededRef = entry.source.ref?.replace(/^v/, '')
      if (seededRef && compareVersions(bundleVersion, seededRef) < 0) return false
      return true
    }
    // Migration: previously seeded from local aek-system-skill/ (no baseline)
    // → safe to overwrite because the user never claimed ownership
    if (entry?.source?.type === 'local' && !entry.source.baseline_hash) {
      return true
    }
    return false
  }

  private layDown(bundle: SystemSkillBundle, bundledDir: string, fingerprint: string, existing?: RegistryEntry): SystemSkillSeedResult {
    const metadata = parseSkillMarkdownMetadata(this.fs.readText(path.join(bundledDir, 'SKILL.md')))
    const hubDir = this.registry.skillDir(bundle.skillName)
    if (this.fs.kind(hubDir) !== 'missing') this.fs.removeTree(hubDir)
    this.fs.makeDirectory(hubDir)
    this.fs.copyDirectoryContents(bundledDir, hubDir)
    const source = {
      type: 'git' as const,
      url: bundle.repoUrl,
      subpath: `skills/${bundle.skillName}`,
      ref: `v${bundle.version}`,
      upstream_commit: null,
      upstream_tree: null,
      baseline_hash: fingerprint,
    }
    // ensureEntry triggers frontmatter mirror which modifies the hub SKILL.md.
    // Recompute baseline AFTER mirror so it reflects the actual hub state.
    this.registry.ensureEntry(bundle.skillName, {
      ...(existing || {}),
      title: String(metadata.title || bundle.skillName),
      description: String(metadata.description || ''),
      source,
    })
    const postMirrorFingerprint = this.distribute.fingerprintDir(hubDir)
    const updatedSource = { ...source, baseline_hash: postMirrorFingerprint }
    this.registry.editSafeFields(bundle.skillName, { source: updatedSource } as any)
    this.views.rebuildCollections()
    return { skill: bundle.skillName, status: existing ? 'refreshed' : 'seeded', fingerprint: postMirrorFingerprint }
  }

  /**
   * Compute a normalized fingerprint that excludes metadata differences.
   * The frontmatter mirror adds metadata after seeding, so bundled source
   * and hub copy will never match byte-for-byte. This compares content
   * without the metadata block.
   */
  private normalizedFingerprint(dir: string): string {
    const crypto = createHash('sha256')
    const files = this.distribute.listTreeFiles(dir)
    for (const relative of files.sort()) {
      const full = path.join(dir, relative)
      const content = this.fs.readText(full)
      // For SKILL.md, strip the metadata block from frontmatter and normalize
      let normalized = content
      if (relative.endsWith('SKILL.md')) {
        const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
        if (match) {
          const [, frontmatter, body] = match
          // Remove metadata block (including nested lines)
          const lines = frontmatter.split('\n')
          const filtered: string[] = []
          let inMetadata = false
          for (const line of lines) {
            if (line === 'metadata:' || line.startsWith('metadata:')) {
              inMetadata = true
              continue
            }
            if (inMetadata) {
              // Check if this is a nested line (starts with spaces)
              if (line.match(/^\s+/)) continue
              inMetadata = false
            }
            filtered.push(line)
          }
          const newFrontmatter = filtered.join('\n')
          normalized = '---\n' + newFrontmatter + '\n---\n' + body.replace(/^\n+/, '')
        }
      }
      crypto.update(relative)
      crypto.update('\0')
      crypto.update(normalized)
    }
    return 'sha256:' + crypto.digest('hex')
  }
}
