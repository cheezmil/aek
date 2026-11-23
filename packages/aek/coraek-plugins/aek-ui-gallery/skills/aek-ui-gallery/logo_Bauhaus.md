# Bauhaus

Architecture design schools modern brands

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFF00 |
| surface | #f0f000 |
| text | #000000 |
| muted | #737300 |
| accent | #FF0000 |
| accent2 | #0000FF |

## 关键参数

- 质感类：memphis
- 字体：sans
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Bauhaus — memphis */
.aek-stage {
  --p-bg: #FFFF00;
  --p-surface: #f0f000;
  --p-text: #000000;
  --p-muted: #737300;
  --p-accent: #FF0000;
  --p-accent2: #0000FF;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```