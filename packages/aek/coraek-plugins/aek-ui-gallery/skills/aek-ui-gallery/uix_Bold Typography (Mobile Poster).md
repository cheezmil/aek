# Bold Typography (Mobile Poster)

Creative brand heroes, reading-focused apps, event/exhibition pages, editorial mobile exp…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAFAFA |
| surface | #ececec |
| text | #0A0A0A |
| muted | #767676 |
| accent | #FF3D00 |
| accent2 | #1A1A1A |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：72px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Bold Typography (Mobile Poster) — editorial */
.aek-stage {
  --p-bg: #FAFAFA;
  --p-surface: #ececec;
  --p-text: #0A0A0A;
  --p-muted: #767676;
  --p-accent: #FF3D00;
  --p-accent2: #1A1A1A;
  --sg-radius: 72px;
  --sg-blur: 0px;
}
```