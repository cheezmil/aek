# arctic-frost

A cool and crisp winter-inspired theme that conveys clarity, precision, and professionalism.

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAFAFA |
| surface | #eff2f5 |
| text | #4A6FA5 |
| muted | #99aecb |
| accent | #D4E4F7 |
| accent2 | #C0C0C0 |

## 关键参数

- 质感类：glass
- 字体：sans
- 圆角：12px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* arctic-frost — glass */
.aek-stage {
  --p-bg: #FAFAFA;
  --p-surface: #eff2f5;
  --p-text: #4A6FA5;
  --p-muted: #99aecb;
  --p-accent: #D4E4F7;
  --p-accent2: #C0C0C0;
  --sg-radius: 12px;
  --sg-blur: 16px;
}
```