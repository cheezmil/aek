# Tech/Digital

Technology startups software apps

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #00D4FF |
| surface | #01c9f1 |
| text | #18181b |
| muted | #0d6d82 |
| accent | #0080FF |
| accent2 | #0080FF |

## 关键参数

- 质感类：pixel
- 字体：pixel
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Tech/Digital — pixel */
.aek-stage {
  --p-bg: #00D4FF;
  --p-surface: #01c9f1;
  --p-text: #18181b;
  --p-muted: #0d6d82;
  --p-accent: #0080FF;
  --p-accent2: #0080FF;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```