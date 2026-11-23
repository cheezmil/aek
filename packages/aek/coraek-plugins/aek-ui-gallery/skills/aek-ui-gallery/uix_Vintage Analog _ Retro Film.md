# Vintage Analog / Retro Film

Photography portfolios, music/vinyl brands, vintage fashion, nostalgia marketing, film in…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5E6C8 |
| surface | #e8dabe |
| text | #18181b |
| muted | #7b7569 |
| accent | #D4A574 |
| accent2 | #E8B4B8 |

## 关键参数

- 质感类：retro
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Vintage Analog / Retro Film — retro */
.aek-stage {
  --p-bg: #F5E6C8;
  --p-surface: #e8dabe;
  --p-text: #18181b;
  --p-muted: #7b7569;
  --p-accent: #D4A574;
  --p-accent2: #E8B4B8;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```