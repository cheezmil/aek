# Nature Distilled

Wellness brands, sustainable products, artisan goods, organic food, spa/beauty, home decor

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5F0E1 |
| surface | #efe6d5 |
| text | #8B4513 |
| muted | #bb9270 |
| accent | #B5651D |
| accent2 | #C67B5C |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Nature Distilled — editorial */
.aek-stage {
  --p-bg: #F5F0E1;
  --p-surface: #efe6d5;
  --p-text: #8B4513;
  --p-muted: #bb9270;
  --p-accent: #B5651D;
  --p-accent2: #C67B5C;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```