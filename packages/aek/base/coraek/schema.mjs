/**
 * Data-schema migrations for a slot's data root: `<home>/.schema-version` plus
 * an ordered table of transforms.
 *
 * WHY THIS EXISTS
 *
 * Adding a directory is nobody's problem — every subsystem creates what it
 * needs (`SkillHomeService.ensure()` makes `skills/` + `collections/` +
 * `registry.yaml`, aek-websearch mkdirs its own tree). What no subsystem can
 * fix is a file that ALREADY EXISTS in an older shape: a registry row whose
 * `source` lacks the fields the update check reads, a manifest that predates a
 * folder it now needs to know about. Those survive every upgrade because
 * nothing rewrites them, and the damage is silent — the skill simply never
 * reports an update, the folder simply never appears in `paths show`.
 *
 * That is what this module is for, and it is the only mechanism that reaches
 * every user: `promote.mjs` / `migrate-data-root.mjs` / `relocate.mjs` are
 * contributor tools (they live in `scripts/`, which the packaged app does not
 * ship, and they need a `next` slot). A migration that ships inside
 * `@cheezmil/coraek` and runs at backend boot reaches everyone, including a
 * machine that has never seen this repository.
 *
 * MODEL
 *
 * A step is a PURE function of the data root: it returns the bytes it would
 * write, never touching disk. The runner does the writing, which buys three
 * properties for free:
 *
 *   - `apply: false` is a real dry run (same code path, no writes) — the CLI's
 *     default, and what `schema --json` reports from;
 *   - every written file is backed up first, so a step that throws mid-way is
 *     rolled back to the exact pre-run bytes;
 *   - a step is trivially unit-testable — call it with a temp home and compare
 *     strings.
 *
 * Steps must be IDEMPOTENT: run against data they already migrated, they must
 * return zero writes. The version file is only advanced after every pending
 * step succeeded, so a failed migration retries on the next boot instead of
 * being skipped forever.
 *
 * The version file is `<home>/.schema-version` and holds a bare integer.
 * ABSENT or unreadable means "predates versioning" and is treated as 0, which
 * is how a legacy install gets migrated instead of skipped. Version 1 is the
 * implicit baseline: "data written before versioning existed".
 *
 * This is NOT the manifest's `version:` field. `aek.yaml`'s version describes
 * the manifest format (`paths.mjs` validates it); this one describes the
 * CONTENT of the data directories. They move independently.
 *
 * @module @cheezmil/coraek/schema
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { aekBackupsPath, resolveAekHome } from './home.mjs'
import { DEFAULT_DIRS, manifestFor, renderManifest, resolveDir } from './paths.mjs'
import { pruneBackups, snapshotStamp } from './backups.mjs'

/** File inside a data root holding the integer schema version. */
export const SCHEMA_FILE = '.schema-version'

/**
 * Version this build expects. Bump it when you add a step — the step must then
 * be tagged with that same number, and the two are checked against each other
 * below so a forgotten bump cannot ship.
 */
export const SCHEMA_VERSION = 3

/**
 * What a step produces for one file.
 * @typedef {object} FileWrite
 * @property {string} file - absolute path.
 * @property {string | null} before - current contents, null when absent.
 * @property {string | null} after - desired contents, null when the file should be removed.
 * @property {string} reason - one line, shown in the plan.
 */

/**
 * What a step sees.
 * @typedef {object} StepContext
 * @property {string} home - absolute data root of the slot.
 * @property {string} container - absolute container dir (`~/.aek`).
 * @property {(name: string) => string} dir - resolve a manifest-named folder inside the slot.
 * @property {(file: string) => string | null} read - file contents, null when absent.
 */

/**
 * One ordered transform.
 * @typedef {object} Step
 * @property {number} version - the schema version this step produces.
 * @property {string} id - stable identifier, used in logs and tests.
 * @property {string} title - one line for the plan output.
 * @property {(ctx: StepContext) => FileWrite[]} run - pure: returns writes, touches nothing.
 */

/** @param {string} file @returns {string | null} */
function readIfExists(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * Canonical `source` keys the update check reads, in the order they are written.
 * `type` and `url` are always present on a healthy row; the rest are nullable
 * anchors that differ per source kind (ADR-0016).
 */
const SOURCE_KEYS = ['url', 'subpath', 'ref', 'upstream_commit', 'upstream_tree', 'baseline_hash']

/**
 * `skill-manager/registry.yaml` rows written by the port carry a legacy
 * `source.repo` and none of the fields the update check reads.
 *
 * Effect today: that skill can never report an update — `has update` keys on
 * `upstream_tree`/`baseline_hash`, both absent, so the answer is permanently
 * "no". Measured on a real install: 1 of 34 rows (`aek-skill-manager`,
 * `repo: shenysun/skills-manager`).
 *
 * Text-level on purpose. `registry.yaml` is a full YAML document (flow lists,
 * quoted strings, nested maps) and this package carries no YAML dependency; a
 * hand-rolled parse that half-understands the file is exactly how a migration
 * corrupts a registry. Instead this rewrites ONLY the one block shape it fully
 * understands — a `source:` mapping with `repo:` — and leaves every other byte
 * (comments, ordering, unrelated keys) untouched. Rows it does not recognise
 * are skipped, never guessed at.
 *
 * `repo` is KEPT: it is provenance, and an unknown key is harmless to the
 * engine. Only missing canonical fields are added, and an existing `url:`
 * (even `url: null`) is replaced rather than duplicated.
 *
 * @type {Step}
 */
const registrySourceNormalize = {
  version: 2,
  id: 'registry-source-normalize',
  title: 'registry.yaml：补全 source 的 url / subpath / ref / upstream_* / baseline_hash',
  run({ dir, read }) {
    const file = join(dir('skill-manager'), 'registry.yaml')
    const text = read(file)
    if (text === null) return []

    const lines = text.split('\n')
    /** @type {string[]} */
    const out = []
    /** @type {string[]} */
    const repaired = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      out.push(line)
      const source = /^(\s+)source:\s*$/u.exec(line)
      if (!source) continue

      // The block is every following line indented deeper than `source:`
      // (blank lines included — they may sit between keys).
      const sourceIndent = source[1].length
      let end = i + 1
      while (end < lines.length && (lines[end].trim() === '' || lines[end].length - lines[end].trimStart().length > sourceIndent)) end++
      const block = lines.slice(i + 1, end)
      i = end - 1

      const repoLine = block.find(l => /^\s+repo:\s*\S/u.test(l))
      if (!repoLine) {
        out.push(...block)
        continue
      }
      const repo = repoLine.replace(/^\s+repo:\s*/u, '').trim().replace(/^['"]|['"]$/gu, '')
      const realUrl = block.some(l => /^\s+url:\s*(?!null\s*$)\S/u.test(l))
      if (realUrl || !/^[\w.-]+\/[\w.-]+$/u.test(repo)) {
        // Either it already knows its URL (never overwrite a real one with a
        // guess), or the shorthand is not `owner/name` — nothing to derive.
        out.push(...block)
        continue
      }

      const pad = ' '.repeat(repoLine.length - repoLine.trimStart().length)
      const present = new Set(
        block
          .map(l => /^\s+([\w-]+):/u.exec(l)?.[1])
          .filter((key) => typeof key === 'string'),
      )
      const values = { url: `https://github.com/${repo}` }

      for (const extra of block) {
        const key = /^\s+([\w-]+):/u.exec(extra)?.[1]
        // Replace an existing (null) `url:` in place: two `url` keys would make
        // the document invalid, and YAML would silently take the last one.
        if (key === 'url') continue
        if (extra === repoLine) {
          out.push(`${pad}url: ${values.url}`)
          for (const name of SOURCE_KEYS.slice(1)) {
            if (!present.has(name)) out.push(`${pad}${name}: null`)
          }
        }
        out.push(extra)
      }
      repaired.push(repo)
    }

    if (repaired.length === 0) return []
    return [{
      file,
      before: text,
      after: out.join('\n'),
      reason: `补全 ${String(repaired.length)} 行的规范字段：${repaired.join(', ')}`,
    }]
  },
}

/**
 * `aek.yaml` is the document that says WHERE each folder lives. Two ways an
 * install can be out of step with the code, both fixed here:
 *
 * 1. **No manifest at all.** Installs that predate `paths.mjs` never had one;
 *    `manifestFor()` then falls back to the historical defaults, so nothing is
 *    broken — but `paths show` prints "没有 aek.yaml，按历史默认布局运行",
 *    `relocate.mjs` cannot move a slot, and the tools that read the manifest
 *    silently skip it. Writing the default is therefore a behavioural fix, and
 *    safe: the default manifest declares exactly the layout already in use.
 *
 * 2. **A manifest missing folders.** `DEFAULT_DIRS` grows with the code; the
 *    `dirs:` table was written once, at creation. `normaliseManifest()` merges
 *    the defaults in, so a missing key still resolves correctly and nothing
 *    breaks — which is exactly why nobody ever notices. What is lost is the
 *    document itself: a user cannot see, and so cannot move, a folder they were
 *    never told about.
 *
 * Appending `key: key` NEVER changes behaviour: an absent key already resolves
 * to exactly that. Comments, ordering and existing overrides are preserved —
 * the missing keys are appended to the end of the `dirs:` block by text edit,
 * not by re-rendering the document (which would drop the user's comments).
 *
 * Detecting "what the file says" has to read the TEXT: `manifest.dirs` is
 * already merged with the defaults, so it can never report a missing key.
 *
 * @type {Step}
 */
const manifestAlign = {
  version: 3,
  id: 'manifest-align',
  title: 'aek.yaml：缺清单则生成默认清单，否则补全 dirs 表里代码已知的目录',
  run({ container, read }) {
    const file = join(container, 'aek.yaml')
    const text = read(file)
    if (text === null) {
      // No manifest: declare the layout the app is already using. Defaults are
      // identity mappings, so this moves nothing.
      return [{
        file,
        before: null,
        after: renderManifest(),
        reason: `生成默认清单（${String(Object.keys(DEFAULT_DIRS).length)} 个目录，均为同名默认值）`,
      }]
    }

    const lines = text.split('\n')
    const start = lines.findIndex(l => /^dirs:\s*$/u.test(l))
    if (start < 0) return []
    let end = start + 1
    while (end < lines.length && (lines[end].trim() === '' || /^\s+/u.test(lines[end]))) end++

    /** @type {Set<string>} */
    const declared = new Set()
    for (let i = start + 1; i < end; i++) {
      const key = /^\s+([\w.-]+):/u.exec(lines[i])?.[1]
      if (key !== undefined) declared.add(key)
    }
    const missing = Object.keys(DEFAULT_DIRS).filter(name => !declared.has(name))
    if (missing.length === 0) return []

    // Append after the last real entry, reusing its indentation — the default
    // manifest indents two spaces and so does every file written by hand.
    let lastEntry = start
    for (let i = end - 1; i > start; i--) {
      if (/^\s+\S/u.test(lines[i])) {
        lastEntry = i
        break
      }
    }
    const indent = /^(\s+)/u.exec(lines[lastEntry])?.[1] ?? '  '
    lines.splice(lastEntry + 1, 0, ...missing.map(name => `${indent}${name}: ${name}`))

    return [{
      file,
      before: text,
      after: lines.join('\n'),
      reason: `补 ${String(missing.length)} 项：${missing.join(', ')}`,
    }]
  },
}

/** Ordered transforms. Sorted by `version`, each exactly one more than the last. */
export const STEPS = [registrySourceNormalize, manifestAlign]

// A step tagged with a version this build does not claim would never run, and a
// gap in the chain would skip data forever. Both are programming errors, so
// they fail loudly at import time rather than silently at some user's boot.
STEPS.forEach((step, index) => {
  const expected = index + 2
  if (step.version !== expected) {
    throw new Error(`schema: step ${step.id} 的 version 应为 ${String(expected)}，实际 ${String(step.version)}`)
  }
})
if (STEPS.length > 0 && STEPS[STEPS.length - 1].version !== SCHEMA_VERSION) {
  throw new Error(`schema: SCHEMA_VERSION=${String(SCHEMA_VERSION)} 与最后一个 step 的 version ${String(STEPS[STEPS.length - 1].version)} 不一致`)
}

/**
 * Version recorded in a data root. Absent, unreadable or non-numeric all mean
 * "predates versioning" — a legacy install to migrate, not an error.
 * @param {string} home - absolute data root.
 * @returns {number} the version, 0 when unknown.
 */
export function readSchemaVersion(home) {
  const raw = readIfExists(join(home, SCHEMA_FILE))
  if (raw === null) return 0
  const value = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

/**
 * Context handed to every step.
 * @param {string} home - absolute data root.
 * @returns {StepContext} the context.
 */
export function stepContext(home) {
  const manifest = manifestFor(home)
  return {
    home,
    container: manifest?.container ?? dirname(home),
    dir: (name) => (manifest ? resolveDir(manifest.dirs, home, name) : join(home, name)),
    read: readIfExists,
  }
}

/**
 * @typedef {object} StepReport
 * @property {number} version
 * @property {string} id
 * @property {string} title
 * @property {'done' | 'pending' | 'noop' | 'error'} state
 * @property {number} writes
 * @property {string} [error]
 */

/**
 * What a migration run WOULD do. Read-only, always.
 * @param {string} home - absolute data root.
 * @returns {{ home: string, version: number, target: number, pending: { version: number, id: string, title: string }[], writes: FileWrite[], steps: StepReport[], consistent: boolean }} the plan.
 */
export function planSchema(home) {
  const version = readSchemaVersion(home)
  const ctx = stepContext(home)
  /** @type {StepReport[]} */
  const steps = []
  /** @type {FileWrite[]} */
  const writes = []
  let consistent = true

  for (const step of STEPS) {
    if (step.version <= version) {
      steps.push({ version: step.version, id: step.id, title: step.title, state: 'done', writes: 0 })
      continue
    }
    try {
      const produced = step.run(ctx)
      steps.push({
        version: step.version,
        id: step.id,
        title: step.title,
        state: produced.length === 0 ? 'noop' : 'pending',
        writes: produced.length,
      })
      writes.push(...produced)
    } catch (error) {
      // A step that cannot even INSPECT its target is reported, not fatal: the
      // rest of the plan is still true, and the caller decides what to do.
      consistent = false
      steps.push({
        version: step.version,
        id: step.id,
        title: step.title,
        state: 'error',
        writes: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    home,
    version,
    target: SCHEMA_VERSION,
    pending: steps.filter(s => s.state === 'pending').map(({ version: v, id, title }) => ({ version: v, id, title })),
    writes,
    steps,
    consistent,
  }
}

/**
 * Run pending migrations.
 *
 * Ordering matters: the version file is written LAST, so a crash between two
 * writes leaves version < target and the next boot redoes the whole set.
 * Re-running is safe because steps are idempotent, and idempotence is exactly
 * what the selftest asserts.
 *
 * @param {string} home - absolute data root.
 * @param {object} [options] - behaviour.
 * @param {boolean} [options.apply] - false plans only (default), true writes.
 * @param {boolean} [options.stamp] - record the version even when no step had
 *   anything to do. This is how a FRESH install says "I am at v3" without
 *   pretending to have migrated anything. Defaults to `apply`.
 * @param {number} [options.keepBackups] - snapshots to keep in `backups/`.
 * @returns {{ home: string, version: number, target: number, changed: boolean, steps: StepReport[], written: string[], snapshot: string | null, error: string | null, pruned: number }} the outcome.
 */
export function applySchema(home, options = {}) {
  const apply = options.apply === true
  const stamp = options.stamp ?? apply
  const plan = planSchema(home)

  if (apply && plan.writes.length > 0) {
    const snapshot = aekBackupsPath(`${snapshotStamp()}-pre-schema-v${String(SCHEMA_VERSION)}`)
    /** @type {FileWrite[]} */
    const done = []
    try {
      mkdirSync(snapshot, { recursive: true })
      for (const write of plan.writes) {
        // Mirror the source path under the snapshot so a human can tell which
        // file `__`-joined blob came from without a manifest.
        if (write.before !== null) {
          writeFileSync(join(snapshot, write.file.replace(/^[/\\]/u, '').split(/[/\\]/u).join('__')), write.before, 'utf8')
        }
        if (write.after === null) {
          rmSync(write.file, { force: true })
        } else {
          mkdirSync(dirname(write.file), { recursive: true })
          writeFileSync(write.file, write.after, 'utf8')
        }
        done.push(write)
      }
    } catch (error) {
      // Restore what this run already changed. A half-migrated registry is
      // worse than an unmigrated one: the version file still says "old", so
      // the next boot would re-run against half-written data.
      for (const write of done.reverse()) {
        try {
          if (write.before === null) rmSync(write.file, { force: true })
          else writeFileSync(write.file, write.before, 'utf8')
        } catch { /* best effort: report, do not mask */ }
      }
      // The snapshot describes a migration that did not happen. Keeping it
      // would make `backups/` claim a state this data root never reached.
      try { rmSync(snapshot, { recursive: true, force: true }) } catch { /* best effort */ }
      return {
        home,
        version: plan.version,
        target: SCHEMA_VERSION,
        changed: false,
        steps: plan.steps,
        written: [],
        snapshot: null,
        error: error instanceof Error ? error.message : String(error),
        pruned: 0,
      }
    }

    writeSchemaVersion(home, SCHEMA_VERSION)
    const prune = pruneBackups(aekBackupsPath(), { keep: options.keepBackups, apply: true })
    return {
      home,
      version: plan.version,
      target: SCHEMA_VERSION,
      changed: true,
      steps: plan.steps,
      written: plan.writes.map(w => w.file),
      snapshot,
      error: null,
      pruned: prune.removed.length,
    }
  }

  if (apply && stamp && plan.version !== SCHEMA_VERSION) {
    // Nothing to change, but this build is newer than the data. Recording the
    // version now is what stops every future boot from re-planning steps that
    // provably had nothing to do.
    writeSchemaVersion(home, SCHEMA_VERSION)
  }

  return {
    home,
    version: plan.version,
    target: SCHEMA_VERSION,
    changed: false,
    steps: plan.steps,
    written: [],
    snapshot: null,
    error: plan.consistent ? null : '有步骤无法检查目标文件（见 steps.error）',
    pruned: 0,
  }
}

/**
 * Write the version file.
 * @param {string} home - absolute data root.
 * @param {number} version - the version to record.
 */
export function writeSchemaVersion(home, version) {
  try {
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, SCHEMA_FILE), `${String(version)}\n`, 'utf8')
  } catch { /* a read-only data root is not a crash: the next boot retries */ }
}

/**
 * Boot hook: migrate a slot, never throw, never block.
 *
 * Called from `aek web` before the runtime is spawned, so the host that reads
 * these files starts against migrated data. A migration failure must not stop
 * the app — the version file is unchanged, so the next launch retries, and the
 * user gets a working (if unmigrated) app instead of a shell that will not
 * boot. That trade is deliberate: silencing a migration is recoverable, a
 * launcher that refuses to start is not.
 *
 * @param {object} [options] - behaviour.
 * @param {string} [options.home] - data root; defaults to the resolved slot.
 * @param {(line: string) => void} [options.log] - sink for the one-line report.
 * @returns {ReturnType<typeof applySchema> | null} the outcome, or null when it threw.
 */
export function migrateOnBoot(options = {}) {
  const log = options.log ?? ((line) => { process.stderr.write(`${line}\n`) })
  try {
    const home = options.home ?? resolveAekHome()
    const result = applySchema(home, { apply: true })
    if (result.written.length > 0) {
      log(`[aek] data schema v${String(result.version)} → v${String(result.target)}: 迁移 ${String(result.written.length)} 个文件（快照 ${basename(result.snapshot ?? '')}）`)
    }
    if (result.error !== null) log(`[aek] data schema 迁移未完成：${result.error}`)
    return result
  } catch (error) {
    log(`[aek] data schema 迁移异常，已跳过：${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/** Re-exported so callers do not import `backups.mjs` just to bound a snapshot set. */
export { pruneBackups } from './backups.mjs'
