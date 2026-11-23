# Claymorphism

Educational apps, children's apps, SaaS platforms, creative tools, fun-focused, onboardin…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #98FF98 |
| surface | #90f191 |
| text | #18181b |
| muted | #528053 |
| accent | #ADD8E6 |
| accent2 | #E6E6FA |

## 关键参数

- 质感类：neubrutal
- 字体：sans
- 圆角：4px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Claymorphism — neubrutal */
.aek-stage {
  --p-bg: #98FF98;
  --p-surface: #90f191;
  --p-text: #18181b;
  --p-muted: #528053;
  --p-accent: #ADD8E6;
  --p-accent2: #E6E6FA;
  --sg-radius: 4px;
  --sg-blur: 0px;
}
```