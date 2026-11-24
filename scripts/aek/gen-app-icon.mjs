#!/usr/bin/env node
/**
 * gen-app-icon.mjs — 从 resources/icon.svg（AEK 柑橘切片 logo）生成全部应用图标资产。
 *
 * 背景（BQ15）：resources/ 下的 icon.icns / icon.png / icon.iconset/* 自 cdf732a8
 * （11-05 dsh 基线合并）起一直是 DSH 继承的鲸鱼图标，而同目录的 icon.svg 早已是
 * AEK 品牌 logo（与 static/logo/aek-logo.svg 同源，md5 一致）。本脚本用 macOS
 * 系统工具重新生成光栅资产，不引入任何新依赖：
 *
 *   tile 合成（白圆角底板 + logo scale 7.5）→ qlmanage -t -s 1024（QuickLook 光栅化）
 *   → sips（PNG 归一 + iconset 10 尺寸）→ iconutil -c icns
 *
 * 输出（全部仓库相对，覆盖写）：
 *   apps/aek-desktop/v0/resources/icon.icns        mac CFBundleIconFile（builder）
 *   apps/aek-desktop/v0/resources/icon.png         win/linux builder，1024 RGBA
 *   apps/aek-desktop/v0/resources/icon.iconset/*   iconset 源料（10 尺寸，供审计）
 *   static/logo/aek-logo.icns                      logo 镜像（此前误标为鲸鱼 icns）
 *
 * 用法：
 *   node scripts/aek/gen-app-icon.mjs           重新生成并写入上述四处
 *   node scripts/aek/gen-app-icon.mjs --check   校验磁盘资产与当前源料一致（不落盘；供门禁）
 *
 * 坑：qlmanage 的 QuickLook 缩略输出依系统可能是 webp 或 png（文件扩展名恒为
 * <name>.svg.png）——必须按文件头判定，webp 时用 sips 转 png 再做 iconset。
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 与 shared-logic.mjs 同构：自脚本位置上溯找 pnpm-workspace.yaml（仓库根）。 */
function findProjectRoot() {
  let dir = HERE
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = path.dirname(dir)
    if (up === dir) throw new Error('gen-app-icon: cannot find project root (pnpm-workspace.yaml) above ' + HERE)
    dir = up
  }
}

const ROOT = findProjectRoot()
const RES = path.join(ROOT, 'apps/aek-desktop/v0/resources')
const LOGO_SVG = path.join(RES, 'icon.svg')
const STATIC_ICNS = path.join(ROOT, 'static/logo/aek-logo.icns')
const ICONSET = path.join(RES, 'icon.iconset')
const ICNS_OUT = path.join(RES, 'icon.icns')
const PNG_OUT = path.join(RES, 'icon.png')

/**
 * tile 合成常量：1024 画布上白圆角底板（rx 228 = Big Sur 风格 ~22% 圆角），
 * logo（120 视图框）放大 7.5× 居中 —— 橙色圆占 ~61% 画布，dock 小尺寸下可读。
 * 若改视觉，改这里再重跑本脚本 + 重新打包壳（见 BQ15 归档）。
 */
const TILE = 1024
const TILE_RX = 228
const LOGO_SCALE = 7.5
const LOGO_OFFSET = 62 // (1024 - 120*7.5)/2 ≈ 62
/** 标准 10 文件 iconset（与 resources/icon.iconset 既有布局逐一对齐）：
 *  16 / 16@2x(32) / 32 / 32@2x(64) / 128 / 128@2x(256) / 256 / 256@2x(512) / 512 / 512@2x(1024) */
const ICONSET_SIZES = [16, 32, 128, 256, 512]

function buildTileSvg(logoSvgText) {
  const inner = logoSvgText
    .replace(/^\s*<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
  const defs = (inner.match(/<defs>[\s\S]*?<\/defs>/) ?? [])[0] ?? ''
  const shapes = inner.replace(/<defs>[\s\S]*?<\/defs>/, '')
  return [
    `<svg width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}" xmlns="http://www.w3.org/2000/svg">`,
    defs,
    `<rect x="0" y="0" width="${TILE}" height="${TILE}" rx="${TILE_RX}" ry="${TILE_RX}" fill="#ffffff"/>`,
    `<g transform="translate(${LOGO_OFFSET},${LOGO_OFFSET}) scale(${LOGO_SCALE})">`,
    shapes.trim(),
    '</g>',
    '</svg>',
  ].join('\n')
}

function isPng(file) {
  const head = readFileSync(file).subarray(0, 2)
  return head[0] === 0x89 && head[1] === 0x50 // PNG magic
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'pipe' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status}): ${r.stderr?.toString().trim()}`)
  return r
}

function md5(file) {
  return crypto.createHash('md5').update(readFileSync(file)).digest('hex')
}

/**
 * 光栅化 tile → master 1024 PNG + iconset 10 尺寸 + icns，全部写到 outDir（不落仓库）。
 * @returns {{ icns: string, png: string, iconset: string }}
 */
function generate(outDir) {
  if (!existsSync(LOGO_SVG)) throw new Error('gen-app-icon: missing logo source ' + LOGO_SVG)
  const tileSvg = buildTileSvg(readFileSync(LOGO_SVG, 'utf8'))
  const work = mkdtempSync(path.join(os.tmpdir(), 'aek-icon-'))
  const tileFile = path.join(work, 'tile.svg')
  writeFileSync(tileFile, tileSvg)

  // 1) QuickLook 光栅化 1024（输出名 <basename>.png，内容可能 png/webp）
  run('qlmanage', ['-t', '-s', String(TILE), '-o', work, tileFile])
  const rendered = path.join(work, 'tile.svg.png')
  if (!existsSync(rendered)) throw new Error('gen-app-icon: qlmanage produced no thumbnail')
  let master = rendered
  if (!isPng(rendered)) {
    master = path.join(work, 'tile.png') // webp 中间态：sips 归一到 png
    run('sips', ['-s', 'format', 'png', rendered, '--out', master])
  }

  // 2) iconset 10 尺寸（sips 缩图）
  const iconsetDir = path.join(outDir, 'icon.iconset')
  mkdirSync(iconsetDir, { recursive: true })
  for (const size of ICONSET_SIZES) {
    // 每档两个文件：icon_NxN.png（N×N）+ icon_NxN@2x.png（2N×2N，@2x 档供 Retina）
    run('sips', ['-z', String(size), String(size), master, '--out', path.join(iconsetDir, `icon_${size}x${size}.png`)])
    run('sips', ['-z', String(size * 2), String(size * 2), master, '--out', path.join(iconsetDir, `icon_${size}x${size}@2x.png`)])
  }

  // 3) icns
  const icnsOut = path.join(outDir, 'icon.icns')
  run('iconutil', ['-c', 'icns', '-o', icnsOut, iconsetDir])

  // 4) master 1024 png 放 outDir（供拷 resources/icon.png）
  const pngOut = path.join(outDir, 'icon.png')
  cpSync(master, pngOut)
  rmSync(work, { recursive: true, force: true })
  return { icns: icnsOut, png: pngOut, iconset: iconsetDir }
}

function md5Dir(dir) {
  const files = readdirSync(dir).sort()
  const h = crypto.createHash('md5')
  for (const f of files) h.update(f + ':' + md5(path.join(dir, f)) + ';')
  return h.digest('hex')
}

const checkMode = process.argv.includes('--check')
const tmp = mkdtempSync(path.join(os.tmpdir(), checkMode ? 'aek-icon-check-' : 'aek-icon-gen-'))

try {
  const out = generate(tmp)

  if (checkMode) {
    let mismatch = 0
    const pairs = [
      [out.icns, ICNS_OUT],
      [out.png, PNG_OUT],
      [out.icns, STATIC_ICNS],
    ]
    for (const [a, b] of pairs) {
      if (!existsSync(b)) { console.error(`gen-app-icon --check: missing ${path.relative(ROOT, b)}（先跑不带 --check 的生成）`); mismatch++; continue }
      const same = md5(a) === md5(b)
      console.log(`${same ? 'ok' : 'MISMATCH'} ${path.relative(ROOT, b)}${same ? '' : `（磁盘 ${md5(b)} ≠ 重生成 ${md5(a)}）`}`)
      if (!same) mismatch++
    }
    // iconset 目录逐文件比对
    if (existsSync(ICONSET) && statSync(ICONSET).isDirectory()) {
      const same = md5Dir(out.iconset) === md5Dir(ICONSET)
      console.log(`${same ? 'ok' : 'MISMATCH'} ${path.relative(ROOT, ICONSET)}/`);
      if (!same) mismatch++
    } else {
      console.error(`gen-app-icon --check: missing ${path.relative(ROOT, ICONSET)}/`); mismatch++
    }
    process.exitCode = mismatch ? 1 : 0
  } else {
    cpSync(out.icns, ICNS_OUT)
    cpSync(out.png, PNG_OUT)
    rmSync(ICONSET, { recursive: true, force: true })
    cpSync(out.iconset, ICONSET, { recursive: true })
    cpSync(out.icns, STATIC_ICNS)
    console.log(`gen-app-icon: ok — 已刷新 ${['icon.icns', 'icon.png', 'icon.iconset/（10 尺寸）', path.relative(ROOT, STATIC_ICNS)].join('、')}`)
    console.log(`  icns md5 ${md5(ICNS_OUT)}`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
