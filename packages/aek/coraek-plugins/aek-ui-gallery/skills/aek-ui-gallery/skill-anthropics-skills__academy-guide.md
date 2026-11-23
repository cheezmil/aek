# academy-guide

学院社论 · 衬线纸感

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FBFAF6 |
| surface | #F2EFE6 |
| text | #23211D |
| muted | #8C8779 |
| accent | #B4532A |
| accent2 | #6E5B3E |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：2px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* academy-guide — editorial */
.aek-stage {
  --p-bg: #FBFAF6;
  --p-surface: #F2EFE6;
  --p-text: #23211D;
  --p-muted: #8C8779;
  --p-accent: #B4532A;
  --p-accent2: #6E5B3E;
  --sg-radius: 2px;
  --sg-blur: 0px;
}
```