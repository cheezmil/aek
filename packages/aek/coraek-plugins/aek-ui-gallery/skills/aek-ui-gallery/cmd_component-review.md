# component-review

Use this checkpoint on comp-led builds once every raster region has its plate and the plates gate h…

> 来源：Impeccable

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F0F0F0 |
| text | #000000 |
| muted | #737373 |
| accent | #2196F3 |
| accent2 | #FFEB3B |

## 关键参数

- 质感类：neubrutal
- 字体：mono
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* component-review — neubrutal */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F0F0F0;
  --p-text: #000000;
  --p-muted: #737373;
  --p-accent: #2196F3;
  --p-accent2: #FFEB3B;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```