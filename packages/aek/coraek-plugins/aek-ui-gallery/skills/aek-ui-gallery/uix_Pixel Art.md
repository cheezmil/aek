# Pixel Art

Indie games, retro tools, creative portfolios, nostalgia marketing, Web3/NFT

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #000000 |
| surface | #181819 |
| text | #f4f4f5 |
| muted | #868687 |
| accent | #0080FF |
| accent2 | #FF006E |

## 关键参数

- 质感类：retro
- 字体：pixel
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* Pixel Art — retro (dark) */
.aek-stage {
  --p-bg: #000000;
  --p-surface: #181819;
  --p-text: #f4f4f5;
  --p-muted: #868687;
  --p-accent: #0080FF;
  --p-accent2: #FF006E;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```