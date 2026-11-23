# Micro-interactions

Mobile apps, touchscreen UIs, productivity tools, user-friendly, consumer apps, interacti…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F59E0B |
| surface | #f5a722 |
| text | #f4f4f5 |
| muted | #f4cd8c |
| accent | #22C55E |
| accent2 | #22C55E |

## 关键参数

- 质感类：clay
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Micro-interactions — clay */
.aek-stage {
  --p-bg: #F59E0B;
  --p-surface: #f5a722;
  --p-text: #f4f4f5;
  --p-muted: #f4cd8c;
  --p-accent: #22C55E;
  --p-accent2: #22C55E;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```