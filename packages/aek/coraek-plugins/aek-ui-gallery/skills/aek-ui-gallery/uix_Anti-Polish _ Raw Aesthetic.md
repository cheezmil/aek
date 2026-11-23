# Anti-Polish / Raw Aesthetic

Creative portfolios, artist sites, indie brands, handmade products, authentic storytellin…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAFAF8 |
| surface | #ededeb |
| text | #1A1A1A |
| muted | #7f7f7e |
| accent | #C4A77D |
| accent2 | #4A4A4A |

## 关键参数

- 质感类：neubrutal
- 字体：serif
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Anti-Polish / Raw Aesthetic — neubrutal */
.aek-stage {
  --p-bg: #FAFAF8;
  --p-surface: #ededeb;
  --p-text: #1A1A1A;
  --p-muted: #7f7f7e;
  --p-accent: #C4A77D;
  --p-accent2: #4A4A4A;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```