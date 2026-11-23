# Biomimetic / Organic 2.0

Sustainability tech, biotech, advanced health, meditation, generative art platforms

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #00FFFF |
| surface | #00f2f3 |
| text | #001E3C |
| muted | #008394 |
| accent | #00FF41 |
| accent2 | #FF7F50 |

## 关键参数

- 质感类：glass
- 字体：sans
- 圆角：12px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* Biomimetic / Organic 2.0 — glass */
.aek-stage {
  --p-bg: #00FFFF;
  --p-surface: #00f2f3;
  --p-text: #001E3C;
  --p-muted: #008394;
  --p-accent: #00FF41;
  --p-accent2: #FF7F50;
  --sg-radius: 12px;
  --sg-blur: 16px;
}
```