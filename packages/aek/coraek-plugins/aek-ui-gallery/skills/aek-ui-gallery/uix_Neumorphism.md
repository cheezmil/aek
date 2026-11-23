# Neumorphism

Health/wellness apps, meditation platforms, fitness trackers, minimal interaction UIs

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5F5F5 |
| surface | #e8e8e8 |
| text | #18181b |
| muted | #7b7b7d |
| accent | #F5E0E8 |
| accent2 | #E8E8E8 |

## 关键参数

- 质感类：neu
- 字体：mono
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Neumorphism — neu */
.aek-stage {
  --p-bg: #F5F5F5;
  --p-surface: #e8e8e8;
  --p-text: #18181b;
  --p-muted: #7b7b7d;
  --p-accent: #F5E0E8;
  --p-accent2: #E8E8E8;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```