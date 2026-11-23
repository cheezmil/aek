# apple-design

Apple HIG · 毛玻璃

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5F5F7 |
| surface | #FFFFFF |
| text | #1D1D1F |
| muted | #86868B |
| accent | #007AFF |
| accent2 | #5E5CE6 |

## 关键参数

- 质感类：apple
- 字体：sans
- 圆角：18px
- 毛玻璃：24px
- 深色底：否

## 应用 CSS

```css
/* apple-design — apple */
.aek-stage {
  --p-bg: #F5F5F7;
  --p-surface: #FFFFFF;
  --p-text: #1D1D1F;
  --p-muted: #86868B;
  --p-accent: #007AFF;
  --p-accent2: #5E5CE6;
  --sg-radius: 18px;
  --sg-blur: 24px;
}
```