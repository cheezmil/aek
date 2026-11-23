# improve-animations

动效优化 · 弹性

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F6F6FB |
| text | #14142B |
| muted | #7D7D96 |
| accent | #6366F1 |
| accent2 | #0EA5E9 |

## 关键参数

- 质感类：motion
- 字体：sans
- 圆角：16px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* improve-animations — motion */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F6F6FB;
  --p-text: #14142B;
  --p-muted: #7D7D96;
  --p-accent: #6366F1;
  --p-accent2: #0EA5E9;
  --sg-radius: 16px;
  --sg-blur: 0px;
}
```