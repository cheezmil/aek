# Kinetic Brutalism (Mobile)

Immersive storytelling apps, brand flagship mobile, music/culture platforms, sports apps,…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAFAFA |
| surface | #ececec |
| text | #09090B |
| muted | #757577 |
| accent | #DFE104 |
| accent2 | #27272A |

## 关键参数

- 质感类：neubrutal
- 字体：sans
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Kinetic Brutalism (Mobile) — neubrutal */
.aek-stage {
  --p-bg: #FAFAFA;
  --p-surface: #ececec;
  --p-text: #09090B;
  --p-muted: #757577;
  --p-accent: #DFE104;
  --p-accent2: #27272A;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```