# polish

Polish is refinement, never concealed redesign. Preserve the incumbent visual world, content, behav…

> 来源：Impeccable

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F1F1F1 |
| text | #1A1A1A |
| muted | #818181 |
| accent | #FFCE5C |
| accent2 | #FF71CE |

## 关键参数

- 质感类：memphis
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* polish — memphis */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F1F1F1;
  --p-text: #1A1A1A;
  --p-muted: #818181;
  --p-accent: #FFCE5C;
  --p-accent2: #FF71CE;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```