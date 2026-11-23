# Dark Mode (OLED)

Night-mode apps, coding platforms, entertainment, eye-strain prevention, OLED devices, lo…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #39FF14 |
| surface | #36f013 |
| text | #000000 |
| muted | #1a7309 |
| accent | #0080FF |
| accent2 | #0A0E27 |

## 关键参数

- 质感类：cyber
- 字体：sans
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Dark Mode (OLED) — cyber */
.aek-stage {
  --p-bg: #39FF14;
  --p-surface: #36f013;
  --p-text: #000000;
  --p-muted: #1a7309;
  --p-accent: #0080FF;
  --p-accent2: #0A0E27;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```