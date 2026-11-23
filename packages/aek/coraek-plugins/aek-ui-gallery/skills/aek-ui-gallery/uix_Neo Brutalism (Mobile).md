# Neo Brutalism (Mobile)

Creative tools, collab platforms, Gen Z marketing & e-commerce, portfolio sites, sticker-…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFDF5 |
| surface | #f0eee6 |
| text | #000000 |
| muted | #73726e |
| accent | #FFD93D |
| accent2 | #FF6B6B |

## 关键参数

- 质感类：glass
- 字体：sans
- 圆角：4px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* Neo Brutalism (Mobile) — glass */
.aek-stage {
  --p-bg: #FFFDF5;
  --p-surface: #f0eee6;
  --p-text: #000000;
  --p-muted: #73726e;
  --p-accent: #FFD93D;
  --p-accent2: #FF6B6B;
  --sg-radius: 4px;
  --sg-blur: 16px;
}
```