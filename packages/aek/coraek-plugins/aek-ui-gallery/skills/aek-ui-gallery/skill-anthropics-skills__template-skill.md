# template-skill

模板骨架 · 虚线占位

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #FAFAFA |
| text | #1A1A1A |
| muted | #8C8C8C |
| accent | #9CA3AF |
| accent2 | #6B7280 |

## 关键参数

- 质感类：sketch
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* template-skill — sketch */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #FAFAFA;
  --p-text: #1A1A1A;
  --p-muted: #8C8C8C;
  --p-accent: #9CA3AF;
  --p-accent2: #6B7280;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```