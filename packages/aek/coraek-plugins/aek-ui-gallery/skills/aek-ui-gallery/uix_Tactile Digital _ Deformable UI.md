# Tactile Digital / Deformable UI

Modern mobile apps, playful brands, entertainment, gaming UI, consumer products, interact…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #87CEEB |
| surface | #80c3df |
| text | #18181b |
| muted | #4a6a79 |
| accent | #C0C0C0 |
| accent2 | #C0C0C0 |

## 关键参数

- 质感类：clay
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Tactile Digital / Deformable UI — clay */
.aek-stage {
  --p-bg: #87CEEB;
  --p-surface: #80c3df;
  --p-text: #18181b;
  --p-muted: #4a6a79;
  --p-accent: #C0C0C0;
  --p-accent2: #C0C0C0;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```