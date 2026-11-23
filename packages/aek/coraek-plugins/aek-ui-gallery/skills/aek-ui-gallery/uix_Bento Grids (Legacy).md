# Bento Grids (Legacy)

Product features, dashboards, personal sites, marketing summaries, galleries

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #f1f1f2 |
| text | #1D1D1F |
| muted | #838384 |
| accent | #F5F5F7 |
| accent2 | #F5F5F7 |

## 关键参数

- 质感类：minimal
- 字体：sans
- 圆角：20px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Bento Grids (Legacy) — minimal */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #f1f1f2;
  --p-text: #1D1D1F;
  --p-muted: #838384;
  --p-accent: #F5F5F7;
  --p-accent2: #F5F5F7;
  --sg-radius: 20px;
  --sg-blur: 0px;
}
```