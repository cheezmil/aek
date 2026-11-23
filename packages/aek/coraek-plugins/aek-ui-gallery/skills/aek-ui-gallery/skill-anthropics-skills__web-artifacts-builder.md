# web-artifacts-builder

Web Artifact · 玻璃拟态

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F7F4F0 |
| text | #1A1714 |
| muted | #8A837A |
| accent | #D97757 |
| accent2 | #6366F1 |

## 关键参数

- 质感类：glass
- 字体：sans
- 圆角：24px
- 毛玻璃：18px
- 深色底：否

## 应用 CSS

```css
/* web-artifacts-builder — glass */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F7F4F0;
  --p-text: #1A1714;
  --p-muted: #8A837A;
  --p-accent: #D97757;
  --p-accent2: #6366F1;
  --sg-radius: 24px;
  --sg-blur: 18px;
}
```