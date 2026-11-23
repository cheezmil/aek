#!/usr/bin/env -S npx tsx
/**
 * BQ11 轮 (m00001 任务 1) — 风格画廊「使用方法」记录落盘（skill 随插件包发行）。
 *
 * 把画廊里每一个条目（57 skill + 348 扫描样式 + 2 基础样式）的「使用方法」
 * 文档（spec.ts 的 usageDoc()，与 Stage 复制按钮同源同文本）镜像进两个位置：
 *
 *   ① 仓库内插件包（发行源，git 跟踪）：
 *      packages/aek/coraek-plugins/aek-ui-gallery/skills/aek-ui-gallery/<id>.md
 *      随 @cheezmil/aek-ui-gallery 一起 publish（package.json files 已含 skills/）。
 *      aek-skill-manager 的 aek-system-skills.yml 声明 aek-ui-gallery 为可 seed 的
 *      包 skill，aeksm bootstrap / self-check 从包内 bundle seed 进 hub registry。
 *
 *   ② 运行中 app 的 hub 货架（Stage 面板 facts.skillPath 的兄弟目录）：
 *      <slot home>/skill-manager/aek-system-skill/aek-ui-gallery/<id>.md
 *      Stage.tsx 的 ART_SHELF 从 facts.skillPath（= aek-system-skill/aek-usage）
 *      推导兄弟货架路径，所以运行 app 要在此处找到 .md 才能显示/复制。
 *      声明在 aek-system-skills.yml 里让 aeksm doctor / bootstrap 的 quarantine
 *      不把它当未声明项移进 .backups/。
 *
 * 两个镜像内容完全一致（同一次 galleryItems() 生成），都是当前条目集的幂等镜像：
 * 内容无变化的文件不重写；目录里出现「当前条目集之外」的 *.md 会被删掉并报告。
 *
 * 用法：
 *   pnpm exec tsx scripts/aek/seed-art-gallery-usage.mjs [--dry-run]
 *
 * .mjs（不是 .ts）：本脚本 import 的 spec.ts / data 是 client 面 TS 文件，
 * host 聚合 tsc（tsconfig.host.json 的 scripts 通配 glob，只收 .ts）看不到它们；
 * 放成 .mjs 即不进 host 程序，与仓库 89 个 scripts/aek/*.mjs 同款，tsx 直跑。
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSlot, slotHome } from '../../packages/aek/base/coraek/slots.mjs'
import { galleryItems, usageDoc } from '../../packages/aek/coraek-plugins/aek-ui-gallery/src/web/gallery/spec.ts'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SHELF_NAME = 'aek-ui-gallery'

/** Filesystem-safe item id: skill-anthropics-skills::x → skill-anthropics-skills__x */
const sanitize = (id) => id.replace(/::/g, '__').replace(/[:/\\]/g, '_')

/**
 * Mirror the current item set into one directory (idempotent: no-op writes for
 * unchanged files, remove stale *.md not in the set, regenerate README index).
 * SKILL.md is hand-maintained (aeksm whitelist / quarantine evidence) and never
 * regenerated here. Returns { written, unchanged, stale } for reporting.
 */
function mirror(outDir, wanted, items) {
  let dirExists = true
  try {
    if (!statSync(outDir).isDirectory()) dirExists = false
  } catch {
    dirExists = false
  }

  const staleExisting = dirExists
    ? readdirSync(outDir).filter((n) => n.endsWith('.md') && n !== 'README.md' && n !== 'SKILL.md')
    : []
  const stale = staleExisting.filter((name) => !wanted.has(name))

  const counters = { written: 0, unchanged: 0, stale: stale.length }
  if (process.argv.includes('--dry-run')) {
    for (const name of stale) counters.stale = counters.stale // keep count
    return { ...counters, staleNames: stale }
  }

  mkdirSync(outDir, { recursive: true })
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
      counters.unchanged += 1
      continue
    }
    writeFileSync(file, content, 'utf8')
    counters.written += 1
  }
  for (const name of stale) rmSync(join(outDir, name), { force: true })

  // README index (regenerated every run — the one file NOT named after an item).
  const index = [
    '# AEK 风格画廊 — 使用方法记录',
    '',
    '本目录是 AEK 风格画廊（aek-ui-gallery 插件）全部条目的「使用方法」记录。它有两个镜像，',
    '内容完全一致（同一次 galleryItems() 生成）：',
    '  ① 仓库内插件包 skills/aek-ui-gallery/（发行源，随 @cheezmil/aek-ui-gallery publish），',
    '  ② hub 货架 aek-system-skill/aek-ui-gallery/（运行中 app 的 Stage 面板在此显示/复制）。',
    '由仓库脚本 scripts/aek/seed-art-gallery-usage.mjs 生成（与 Stage 复制按钮同源同文本）。',
    `条目 = ${items.length}（按 Skill ${items.filter((i) => i.kind === 'skill').length} + 按 UI 样式 ${items.filter((i) => i.kind === 'style').length}），一个条目一个文件，文件名 = 条目 id（:: → __，: → _）。`,
    '复制某条目 = 打开同名文件；它只描述这一个 UI 的配色 / 参数 / 应用 CSS，不含别的东西。',
    'SKILL.md 是本 skill 的定义（aeksm 白名单 / quarantine 依据），不由 seeder 管理。',
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
  return counters
}

const main = () => {
  const dryRun = process.argv.includes('--dry-run')
  const { styles, skills } = galleryItems()
  const items = [...styles, ...skills]

  const wanted = new Map() // filename → content (trailing whitespace stripped per line —
  // the repo pre-commit whitespace hook rejects trailing spaces in tracked files)
  for (const item of items) {
    wanted.set(`${sanitize(item.id)}.md`, usageDoc(item).split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n'))
  }

  const targets = [
    { label: 'repo', dir: join(REPO_ROOT, 'packages/aek/coraek-plugins/aek-ui-gallery/skills', SHELF_NAME) },
    { label: `shelf(${resolveSlot()})`, dir: join(slotHome(resolveSlot()), 'skill-manager', 'aek-system-skill', SHELF_NAME) },
  ]

  for (const { label, dir } of targets) {
    if (dryRun) {
      const r = mirror(dir, wanted, items)
      console.log(`[seed-art-gallery-usage][${label}] out=${dir} items=${items.length} stale_to_remove=${r.stale ? r.staleNames.join(', ') : '(none)'}`)
      continue
    }
    const r = mirror(dir, wanted, items)
    console.log(`[seed-art-gallery-usage][${label}] out=${dir} items=${items.length} written=${r.written} unchanged=${r.unchanged} stale_removed=${r.stale}`)
  }
}

main()
