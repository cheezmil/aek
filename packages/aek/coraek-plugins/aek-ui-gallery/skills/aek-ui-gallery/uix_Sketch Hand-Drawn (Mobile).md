# Sketch Hand-Drawn (Mobile)

Low-fidelity prototyping, creative brands, children/picturebook apps, education tools, jo…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FDFBF7 |
| surface | #f1efeb |
| text | #2D2D2D |
| muted | #8b8a88 |
| accent | #2D5DA1 |
| accent2 | #FF4D4D |

## 关键参数

- 质感类：neubrutal
- 字体：hand
- 圆角：4px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Sketch Hand-Drawn (Mobile) — neubrutal */
.aek-stage {
  --p-bg: #FDFBF7;
  --p-surface: #f1efeb;
  --p-text: #2D2D2D;
  --p-muted: #8b8a88;
  --p-accent: #2D5DA1;
  --p-accent2: #FF4D4D;
  --sg-radius: 4px;
  --sg-blur: 0px;
}
```