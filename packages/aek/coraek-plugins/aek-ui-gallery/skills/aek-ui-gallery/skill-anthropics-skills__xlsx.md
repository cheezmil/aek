# xlsx

表格 · 扁平网格

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F1F7F2 |
| text | #161A18 |
| muted | #7E8A82 |
| accent | #217346 |
| accent2 | #185C37 |

## 关键参数

- 质感类：flat
- 字体：sans
- 圆角：3px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* xlsx — flat */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F1F7F2;
  --p-text: #161A18;
  --p-muted: #7E8A82;
  --p-accent: #217346;
  --p-accent2: #185C37;
  --sg-radius: 3px;
  --sg-blur: 0px;
}
```