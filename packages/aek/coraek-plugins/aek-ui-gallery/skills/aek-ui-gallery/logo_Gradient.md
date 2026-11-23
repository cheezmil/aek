# Gradient

Tech apps social media modern brands

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F8F0FF |
| text | #8B00FF |
| muted | #BF73FF |
| accent | #0080FF |
| accent2 | #8B00FF |

## 关键参数

- 质感类：glass
- 字体：sans
- 圆角：12px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* Gradient — glass */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F8F0FF;
  --p-text: #8B00FF;
  --p-muted: #BF73FF;
  --p-accent: #0080FF;
  --p-accent2: #8B00FF;
  --sg-radius: 12px;
  --sg-blur: 16px;
}
```