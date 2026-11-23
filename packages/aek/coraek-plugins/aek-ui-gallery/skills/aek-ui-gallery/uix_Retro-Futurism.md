# Retro-Futurism

Gaming, entertainment, music platforms, tech brands, artistic projects, nostalgic, cyberp…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #00FFFF |
| surface | #02f1f2 |
| text | #1A1A2E |
| muted | #0e818c |
| accent | #0080FF |
| accent2 | #FF006E |

## 关键参数

- 质感类：cyber
- 字体：pixel
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Retro-Futurism — cyber */
.aek-stage {
  --p-bg: #00FFFF;
  --p-surface: #02f1f2;
  --p-text: #1A1A2E;
  --p-muted: #0e818c;
  --p-accent: #0080FF;
  --p-accent2: #FF006E;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```