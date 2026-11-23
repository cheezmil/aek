# botanical-garden

A fresh and organic theme featuring vibrant garden-inspired colors for lively presentations.

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5F3ED |
| surface | #f1e9e1 |
| text | #B7472A |
| muted | #d39482 |
| accent | #F9A620 |
| accent2 | #4A7C59 |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* botanical-garden — editorial */
.aek-stage {
  --p-bg: #F5F3ED;
  --p-surface: #f1e9e1;
  --p-text: #B7472A;
  --p-muted: #d39482;
  --p-accent: #F9A620;
  --p-accent2: #4A7C59;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```