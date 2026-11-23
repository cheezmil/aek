# Neubrutalism

Gen Z brands, startups, creative agencies, Figma-style apps, Notion-style interfaces, tec…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFEB3B |
| surface | #f0dd37 |
| text | #000000 |
| muted | #736a1b |
| accent | #2196F3 |
| accent2 | #FF5252 |

## 关键参数

- 质感类：neubrutal
- 字体：sans
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Neubrutalism — neubrutal */
.aek-stage {
  --p-bg: #FFEB3B;
  --p-surface: #f0dd37;
  --p-text: #000000;
  --p-muted: #736a1b;
  --p-accent: #2196F3;
  --p-accent2: #FF5252;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```