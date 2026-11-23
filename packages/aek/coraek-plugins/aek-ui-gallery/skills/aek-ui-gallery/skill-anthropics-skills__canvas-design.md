# canvas-design

画布艺术 · 有机曲线

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FDFBF7 |
| surface | #F5F0E8 |
| text | #241F1A |
| muted | #8A7F70 |
| accent | #C96442 |
| accent2 | #3A5A40 |

## 关键参数

- 质感类：organic
- 字体：serif
- 圆角：22px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* canvas-design — organic */
.aek-stage {
  --p-bg: #FDFBF7;
  --p-surface: #F5F0E8;
  --p-text: #241F1A;
  --p-muted: #8A7F70;
  --p-accent: #C96442;
  --p-accent2: #3A5A40;
  --sg-radius: 22px;
  --sg-blur: 0px;
}
```