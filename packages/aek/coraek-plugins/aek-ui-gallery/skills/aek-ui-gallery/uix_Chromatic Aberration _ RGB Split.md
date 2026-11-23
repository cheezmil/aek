# Chromatic Aberration / RGB Split

Music platforms, gaming, tech brands, creative portfolios, nightlife, entertainment, vide…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #00FF00 |
| surface | #00f000 |
| text | #000000 |
| muted | #007300 |
| accent | #FF0000 |
| accent2 | #0000FF |

## 关键参数

- 质感类：retro
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Chromatic Aberration / RGB Split — retro */
.aek-stage {
  --p-bg: #00FF00;
  --p-surface: #00f000;
  --p-text: #000000;
  --p-muted: #007300;
  --p-accent: #FF0000;
  --p-accent2: #0000FF;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```