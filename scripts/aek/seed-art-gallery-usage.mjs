#!/usr/bin/env -S npx tsx
/**
 * BL 轮 (m05632 任务 D/E) — 风格画廊「使用方法」记录落盘。
 *
 * 把画廊里每一个条目（57 skill + 348 扫描样式 + 2 基础样式）的「使用方法」
 * 文档（spec.ts 的 usageDoc()，与 Stage 复制按钮同源同文本）写到系统 skill
 * 货架：
 *
 *   <aek home>/skill-manager/aek-system-skill/aek-webui-art-gallery/<id>.md
 *
 * 货架目录名 aek-webui-art-gallery 已声明在 aek-skill-manager 包的
 * aek-system-skills.yml（seed: false），aeksm doctor / bootstrap 的
 * quarantine 不会把它当未声明项移进 .backups/。
 *
 * 用法：
 *   pnpm exec tsx scripts/aek/seed-art-gallery-usage.mjs [--dry-run]
 *
 * .mjs（不是 .ts）：本脚本 import 的 spec.ts / data 是 client 面 TS 文件，
 * host 聚合 tsc（tsconfig.host.json 的 scripts 通配 glob，只收 .ts）看不到它们；
 * 放成 .mjs 即不进 host 程序，与仓库 89 个 scripts/aek/*.mjs 同款，tsx 直跑。
 *
 * 幂等：内容无变化的文件不重写；货架里出现「当前条目集之外」的 *.md
 * （画廊条目被上游数据删掉后遗留的记录）会被删掉并报告，货架始终 =
 * 当前 galleryItems() 的镜像。
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveSlot, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { galleryItems, usageDoc } from '../../apps/aek-web/src/webui-art-gallery/spec.ts'

/** Filesystem-safe item id: skill-anthropics-skills::x → skill-anthropics-skills__x */
const sanitize = (id) => id.replace(/::/g, '__').replace(/[:/\\]/g, '_')

const main = () => {
  const dryRun = process.argv.includes('--dry-run')
  const slot = resolveSlot()
  const outDir = join(slotHome(slot), 'skill-manager', 'aek-system-skill', 'aek-webui-art-gallery')
  const { styles, skills } = galleryItems()
  const items = [...styles, ...skills]

  const wanted = new Map() // filename → content
  for (const item of items) wanted.set(`${sanitize(item.id)}.md`, usageDoc(item))

  let dirExists = true
  try {
    if (!statSync(outDir).isDirectory()) dirExists = false
  } catch {
    dirExists = false
  }

  const staleExisting = dirExists ? readdirSync(outDir).filter((n) => n.endsWith('.md') && n !== 'README.md') : []
  const stale = staleExisting.filter((name) => !wanted.has(name))

  if (dryRun) {
    console.log(`[seed-art-gallery-usage] slot=${slot} out=${outDir} dir=${dirExists ? 'exists' : 'missing'}`)
    console.log(`[seed-art-gallery-usage] items=${items.length} (styles=${styles.length}, skills=${skills.length})`)
    for (const name of [...wanted.keys()].sort()) console.log(`[seed-art-gallery-usage]   ${name}`)
    console.log(`[seed-art-gallery-usage] stale to remove=${stale.length ? stale.join(', ') : '(none)'}`)
    return
  }

  mkdirSync(outDir, { recursive: true })

  let written = 0
  let unchanged = 0
  const sorted = [...wanted.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [name, content] of sorted) {
    const file = join(outDir, name)
    let prev = null
    try {
      prev = readFileSync(file, 'utf8')
    } catch {
      prev = null
    }
    if (prev === content) {
      unchanged += 1
      continue
    }
    writeFileSync(file, content, 'utf8')
    written += 1
  }
  for (const name of stale) rmSync(join(outDir, name), { force: true })

  // README index (regenerated every run — the one file NOT named after an item).
  const index = [
    '# AEK 风格画廊 — 使用方法记录',
    '',
    '本目录是 AEK 风格画廊（webui-art-gallery）全部条目的「使用方法」记录，由仓库脚本',
    'scripts/aek/seed-art-gallery-usage.mjs 从 galleryItems() 生成（与 Stage 复制按钮同源同文本）。',
    `条目 = ${items.length}（按 Skill ${skills.length} + 按 UI 样式 ${styles.length}），一个条目一个文件，文件名 = 条目 id（:: → __，: → _）。`,
    '复制某条目 = 打开同名文件；它只描述这一个 UI 的配色 / 参数 / 应用 CSS，不含别的东西。',
    '',
    '## 文件清单',
    '',
  ]
  const byId = [...items].sort((a, b) => a.id.localeCompare(b.id))
  for (const item of byId) {
    index.push(`- ${sanitize(item.id)}.md — ${item.spec.name}（${item.kind === 'skill' ? `skill · ${item.repoName ?? item.repoId ?? ''}` : 'style'}）`)
  }
  index.push('')
  writeFileSync(join(outDir, 'README.md'), index.join('\n'), 'utf8')

  console.log(`[seed-art-gallery-usage] slot=${slot} out=${outDir}`)
  console.log(`[seed-art-gallery-usage] items=${items.length} written=${written} unchanged=${unchanged} stale_removed=${stale.length}${stale.length ? ` (${stale.join(', ')})` : ''}`)
}

main()
