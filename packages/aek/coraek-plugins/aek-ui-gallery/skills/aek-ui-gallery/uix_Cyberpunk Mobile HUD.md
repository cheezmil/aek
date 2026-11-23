# Cyberpunk Mobile HUD

Gaming dashboards, crypto/cyberpunk apps, sci-fi companion tools, hacker OS skins, data-h…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #00FF88 |
| surface | #01f081 |
| text | #0A0A0F |
| muted | #067845 |
| accent | #FF00FF |
| accent2 | #00D4FF |

## 关键参数

- 质感类：glass
- 字体：mono
- 圆角：12px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* Cyberpunk Mobile HUD — glass */
.aek-stage {
  --p-bg: #00FF88;
  --p-surface: #01f081;
  --p-text: #0A0A0F;
  --p-muted: #067845;
  --p-accent: #FF00FF;
  --p-accent2: #00D4FF;
  --sg-radius: 12px;
  --sg-blur: 16px;
}
```