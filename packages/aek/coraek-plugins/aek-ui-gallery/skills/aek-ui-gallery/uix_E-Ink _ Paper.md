# E-Ink / Paper

Reading apps, digital newspapers, minimal journals, distraction-free writing, slow-living…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FDFBF7 |
| surface | #efeeea |
| text | #1A1A1A |
| muted | #807f7d |
| accent | #FFFF00 |
| accent2 | #F5F5F5 |

## 关键参数

- 质感类：glass
- 字体：mono
- 圆角：0px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* E-Ink / Paper — glass */
.aek-stage {
  --p-bg: #FDFBF7;
  --p-surface: #efeeea;
  --p-text: #1A1A1A;
  --p-muted: #807f7d;
  --p-accent: #FFFF00;
  --p-accent2: #F5F5F5;
  --sg-radius: 0px;
  --sg-blur: 16px;
}
```