# Material 3 Expressive (Mobile)

Android, Wear OS, and Pixel-aligned products using Material 3 components

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFBFE |
| surface | #f1eef1 |
| text | #1C1B1F |
| muted | #828083 |
| accent | #6750A4 |
| accent2 | #7D5260 |

## 关键参数

- 质感类：pixel
- 字体：pixel
- 圆角：999px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Material 3 Expressive (Mobile) — pixel */
.aek-stage {
  --p-bg: #FFFBFE;
  --p-surface: #f1eef1;
  --p-text: #1C1B1F;
  --p-muted: #828083;
  --p-accent: #6750A4;
  --p-accent2: #7D5260;
  --sg-radius: 999px;
  --sg-blur: 0px;
}
```