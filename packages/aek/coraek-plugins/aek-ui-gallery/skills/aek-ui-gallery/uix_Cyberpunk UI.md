# Cyberpunk UI

Gaming platforms, tech products, crypto apps, sci-fi applications, developer tools, enter…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #00FFFF |
| surface | #01f0f0 |
| text | #0D0D0D |
| muted | #077a7a |
| accent | #00FF00 |
| accent2 | #FF00FF |

## 关键参数

- 质感类：cyber
- 字体：mono
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Cyberpunk UI — cyber */
.aek-stage {
  --p-bg: #00FFFF;
  --p-surface: #01f0f0;
  --p-text: #0D0D0D;
  --p-muted: #077a7a;
  --p-accent: #00FF00;
  --p-accent2: #FF00FF;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```