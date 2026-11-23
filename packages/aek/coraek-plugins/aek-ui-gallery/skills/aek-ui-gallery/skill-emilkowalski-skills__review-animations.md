# review-animations

动效评审 · 批注

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #FFFBEB |
| text | #1A1710 |
| muted | #877F6C |
| accent | #F59E0B |
| accent2 | #0EA5E9 |

## 关键参数

- 质感类：annotate
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* review-animations — annotate */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #FFFBEB;
  --p-text: #1A1710;
  --p-muted: #877F6C;
  --p-accent: #F59E0B;
  --p-accent2: #0EA5E9;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```