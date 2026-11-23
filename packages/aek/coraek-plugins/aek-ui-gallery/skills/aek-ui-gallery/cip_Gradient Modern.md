# Gradient Modern

Modern gradient-based visual style

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #22D3EE |
| surface | #21c8e1 |
| text | #18181b |
| muted | #1d6c7a |
| accent | #F97316 |
| accent2 | #EC4899 |

## 关键参数

- 质感类：aurora
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Gradient Modern — aurora */
.aek-stage {
  --p-bg: #22D3EE;
  --p-surface: #21c8e1;
  --p-text: #18181b;
  --p-muted: #1d6c7a;
  --p-accent: #F97316;
  --p-accent2: #EC4899;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```