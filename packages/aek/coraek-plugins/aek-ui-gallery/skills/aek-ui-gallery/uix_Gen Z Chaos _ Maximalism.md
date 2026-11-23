# Gen Z Chaos / Maximalism

Gen Z lifestyle brands, music artists, creative portfolios, viral marketing, fashion

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFF00 |
| surface | #f0f00f |
| text | #0000FF |
| muted | #73738c |
| accent | #FF00FF |
| accent2 | #00FF00 |

## 关键参数

- 质感类：neubrutal
- 字体：sans
- 圆角：999px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Gen Z Chaos / Maximalism — neubrutal */
.aek-stage {
  --p-bg: #FFFF00;
  --p-surface: #f0f00f;
  --p-text: #0000FF;
  --p-muted: #73738c;
  --p-accent: #FF00FF;
  --p-accent2: #00FF00;
  --sg-radius: 999px;
  --sg-blur: 0px;
}
```