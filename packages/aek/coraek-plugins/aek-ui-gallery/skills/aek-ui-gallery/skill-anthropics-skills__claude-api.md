# claude-api

API 参考 · 终端文档

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #141413 |
| surface | #1F1E1D |
| text | #F0EEE6 |
| muted | #9A958C |
| accent | #D97757 |
| accent2 | #8A8F98 |

## 关键参数

- 质感类：terminal
- 字体：mono
- 圆角：4px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* claude-api — terminal (dark) */
.aek-stage {
  --p-bg: #141413;
  --p-surface: #1F1E1D;
  --p-text: #F0EEE6;
  --p-muted: #9A958C;
  --p-accent: #D97757;
  --p-accent2: #8A8F98;
  --sg-radius: 4px;
  --sg-blur: 0px;
}
```