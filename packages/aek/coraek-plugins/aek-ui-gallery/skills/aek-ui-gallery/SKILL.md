---
name: aek-ui-gallery
description: AEK 风格画廊（UI 风格 / shadcn 组件）全部条目「使用方法」记录货架：每个条目一个 .md，含配色、参数与应用 CSS。
---
# AEK 风格画廊 — 使用方法记录

本目录是 AEK 风格画廊全部条目的「使用方法」记录，与画廊 Stage 面板复制按钮同源同文本
（仓库脚本 `scripts/aek/seed-art-gallery-usage.mjs` 从 `galleryItems()` 生成，幂等镜像）。

## 条目

- 条目 = 405（按 Skill 57 + 按 UI 样式 348），一个条目一个文件，文件名 = 条目 id（`::` → `__`，`:` → `_`）。
- 前缀：`cip_*` = 按 UI 样式条目；`cmd_*` / `comp_*` 等 = 按 Skill 条目；`style-*` = 基础样式。
- 完整文件清单见 `README.md`。

## 用法

复制某个 UI 的使用方法 = 打开本目录下的同名 `.md`；它只描述这一个 UI 的配色 / 参数 /
应用 CSS，不含别的东西。给 Agent 用时把对应文件内容贴给它即可。
