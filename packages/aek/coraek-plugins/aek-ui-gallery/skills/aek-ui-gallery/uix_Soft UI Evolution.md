# Soft UI Evolution

Modern enterprise apps, SaaS platforms, health/wellness, modern business tools, professio…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #90EE90 |
| surface | #89e189 |
| text | #18181b |
| muted | #4e7850 |
| accent | #FFB6C1 |
| accent2 | #FFB6C1 |

## 关键参数

- 质感类：neu
- 字体：sans
- 圆角：2px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Soft UI Evolution — neu */
.aek-stage {
  --p-bg: #90EE90;
  --p-surface: #89e189;
  --p-text: #18181b;
  --p-muted: #4e7850;
  --p-accent: #FFB6C1;
  --p-accent2: #FFB6C1;
  --sg-radius: 2px;
  --sg-blur: 0px;
}
```