# doc-coauthoring

协同写作 · 文档流

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F6F5F2 |
| text | #1C1B19 |
| muted | #8A857B |
| accent | #3B6EA5 |
| accent2 | #7A5C3E |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：4px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* doc-coauthoring — editorial */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F6F5F2;
  --p-text: #1C1B19;
  --p-muted: #8A857B;
  --p-accent: #3B6EA5;
  --p-accent2: #7A5C3E;
  --sg-radius: 4px;
  --sg-blur: 0px;
}
```