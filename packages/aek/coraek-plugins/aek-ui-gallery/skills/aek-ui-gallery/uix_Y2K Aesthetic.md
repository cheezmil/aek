# Y2K Aesthetic

Fashion brands, music platforms, Gen Z brands, nostalgia marketing, entertainment, youth-…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #00FFFF |
| surface | #09f0fc |
| text | #9400D3 |
| muted | #5173e7 |
| accent | #FF69B4 |
| accent2 | #C0C0C0 |

## 关键参数

- 质感类：cyber
- 字体：sans
- 圆角：999px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Y2K Aesthetic — cyber */
.aek-stage {
  --p-bg: #00FFFF;
  --p-surface: #09f0fc;
  --p-text: #9400D3;
  --p-muted: #5173e7;
  --p-accent: #FF69B4;
  --p-accent2: #C0C0C0;
  --sg-radius: 999px;
  --sg-blur: 0px;
}
```