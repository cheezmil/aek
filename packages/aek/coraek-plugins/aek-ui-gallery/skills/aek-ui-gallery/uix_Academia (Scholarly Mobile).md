# Academia (Scholarly Mobile)

Knowledge management apps, deep reading tools, ritual-heavy personal brands, lore-heavy R…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #E8DFD4 |
| surface | #dcd3c8 |
| text | #1C1714 |
| muted | #78716a |
| accent | #251E19 |
| accent2 | #3D332B |

## 关键参数

- 质感类：cyber
- 字体：serif
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Academia (Scholarly Mobile) — cyber */
.aek-stage {
  --p-bg: #E8DFD4;
  --p-surface: #dcd3c8;
  --p-text: #1C1714;
  --p-muted: #78716a;
  --p-accent: #251E19;
  --p-accent2: #3D332B;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```