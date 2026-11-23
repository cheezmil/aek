# Legal/Financial

Law firms banks financial services

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #003366 |
| surface | #184674 |
| text | #f4f4f5 |
| muted | #869db5 |
| accent | #1E3A8A |
| accent2 | #1E3A8A |

## 关键参数

- 质感类：tactile
- 字体：sans
- 圆角：999px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* Legal/Financial — tactile (dark) */
.aek-stage {
  --p-bg: #003366;
  --p-surface: #184674;
  --p-text: #f4f4f5;
  --p-muted: #869db5;
  --p-accent: #1E3A8A;
  --p-accent2: #1E3A8A;
  --sg-radius: 999px;
  --sg-blur: 0px;
}
```