#!/usr/bin/env node
/**
 * Inspect / run the data-schema migrations for an AEK data root.
 *
 * The engine lives in `@cheezmil/coraek/schema` and runs by itself at backend
 * boot (`aek web` → `migrateOnBoot`), which is what reaches every user. This
 * CLI is the human/CI face of the same engine: "what would change", "do it now
 * without restarting the app", "why did nothing happen".
 *
 *   node scripts/aek/schema.mjs                 # plan, read-only (default)
 *   node scripts/aek/schema.mjs apply           # same as --yes
 *   node scripts/aek/schema.mjs --yes           # run pending steps
 *   node scripts/aek/schema.mjs --json          # machine-readable plan
 *   node scripts/aek/schema.mjs --slot next     # the other slot
 *   node scripts/aek/schema.mjs --home <dir>    # an explicit data root (tests)
 *
 * Refuses to write while a slot is running: the app rewrites `registry.yaml`
 * and the manifest itself, and a migration racing those writes would be
 * rebuilding bytes it read a moment ago. `--no-running-check` exists for the
 * selftest and says so.
 */
import { applySchema, planSchema, readSchemaVersion, SCHEMA_FILE, SCHEMA_VERSION, STEPS } from '../../packages/aek/base/coraek/schema.mjs'
import { resolveAekHome } from '../../packages/aek/base/coraek/home.mjs'
import { slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { runningProcesses } from './slot-ops.mjs'

const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const APPLY = argv.includes('--yes') || argv.includes('apply')
const NO_RUNNING_CHECK = argv.includes('--no-running-check')

/**
 * @param {string} name @returns {string | undefined}
 */
function valueOf(name) {
  const at = argv.indexOf(name)
  return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : undefined
}

const slotAt = valueOf('--slot')
if (slotAt !== undefined && slotAt !== 'aek' && slotAt !== 'next') {
  process.stderr.write(`[schema] --slot 只接受 aek / next，收到 ${slotAt}\n`)
  process.exit(2)
}
const home = valueOf('--home') ?? (slotAt !== undefined ? slotHome(slotAt) : resolveAekHome())
const keepAt = valueOf('--keep-backups')
const keepBackups = keepAt === undefined ? undefined : Number(keepAt)
if (keepAt !== undefined && (!Number.isInteger(keepBackups) || keepBackups < 1)) {
  process.stderr.write(`[schema] --keep-backups 需要一个 ≥1 的整数，收到 ${keepAt}\n`)
  process.exit(2)
}

if (APPLY && !NO_RUNNING_CHECK) {
  const busy = runningProcesses()
  if (busy.length > 0) {
    process.stderr.write('[schema] 有槽在运行，迁移会和 app 的写入抢同一个文件。先停下再跑：\n')
    for (const line of busy) process.stderr.write(`  ${line}\n`)
    process.stderr.write('  node scripts/aek/slots.mjs --stop-all\n')
    process.exit(1)
  }
}

if (APPLY) {
  const result = applySchema(home, { apply: true, keepBackups })
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ ...result, steps: result.steps, stepsTable: STEPS.map(s => s.id) }, null, 2))
    process.exit(result.error === null ? 0 : 1)
  }
  console.log(`数据根 ${home}`)
  console.log(`版本   v${String(result.version)} → v${String(result.target)}`)
  for (const step of result.steps) {
    const mark = step.state === 'done' ? '已是最新' : step.state === 'noop' ? '无需改动' : step.state === 'error' ? `失败：${step.error ?? ''}` : '已执行'
    console.log(`  v${String(step.version)} ${step.id}  ${mark}`)
  }
  for (const file of result.written) console.log(`  写入 ${file}`)
  if (result.snapshot !== null) console.log(`  快照 ${result.snapshot}${result.pruned > 0 ? `（清理 ${String(result.pruned)} 份旧快照）` : ''}`)
  if (result.error !== null) {
    process.stderr.write(`[schema] 未完成：${result.error}\n`)
    process.exit(1)
  }
  if (!result.changed) console.log('  没有需要迁移的内容')
  process.exit(0)
}

const plan = planSchema(home)
if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ ...plan, recorded: readSchemaVersion(home), file: SCHEMA_FILE, target: SCHEMA_VERSION }, null, 2))
  process.exit(plan.consistent ? 0 : 1)
}

console.log(`数据根 ${home}`)
console.log(`版本   v${String(plan.version)}（${plan.version === 0 ? `没有 ${SCHEMA_FILE}，按「早于版本化」处理` : `记录在 ${SCHEMA_FILE}`}）→ 目标 v${String(plan.target)}`)
for (const step of plan.steps) {
  const mark = step.state === 'done' ? '已应用' : step.state === 'noop' ? '无需改动' : step.state === 'error' ? `失败：${step.error ?? ''}` : `待执行 ${String(step.writes)} 个文件`
  console.log(`  v${String(step.version)} ${step.id}  ${mark}`)
}
for (const write of plan.writes) console.log(`    ${write.file}\n      ${write.reason}`)
if (plan.pending.length === 0 && plan.consistent) console.log('没有待迁移项。')
if (plan.writes.length > 0) console.log('预览模式，未写入。加 --yes 执行（或让 app 下次启动自动跑）。')
process.exit(plan.consistent ? 0 : 1)
