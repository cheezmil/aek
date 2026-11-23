# docx

Word 文档 · 扁平官方

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F3F6FA |
| text | #1B1F24 |
| muted | #7A848F |
| accent | #2B579A |
| accent2 | #1B3F72 |

## 关键参数

- 质感类：flat
- 字体：sans
- 圆角：4px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* docx — flat */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F3F6FA;
  --p-text: #1B1F24;
  --p-muted: #7A848F;
  --p-accent: #2B579A;
  --p-accent2: #1B3F72;
  --sg-radius: 4px;
  --sg-blur: 0px;
}
```