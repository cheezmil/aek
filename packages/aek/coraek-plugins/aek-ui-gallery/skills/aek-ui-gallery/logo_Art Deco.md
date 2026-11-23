# Art Deco

Luxury hotels fashion high-end products

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFD700 |
| surface | #f0ca00 |
| text | #000000 |
| muted | #736100 |
| accent | #1C1C1C |
| accent2 | #1C1C1C |

## 关键参数

- 质感类：editorial
- 字体：sans
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Art Deco — editorial */
.aek-stage {
  --p-bg: #FFD700;
  --p-surface: #f0ca00;
  --p-text: #000000;
  --p-muted: #736100;
  --p-accent: #1C1C1C;
  --p-accent2: #1C1C1C;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```