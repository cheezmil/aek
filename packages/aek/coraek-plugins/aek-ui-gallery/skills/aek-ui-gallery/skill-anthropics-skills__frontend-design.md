# frontend-design

前端设计 · 大标题冲击

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0F0F0F |
| surface | #1A1A1A |
| text | #FAFAF8 |
| muted | #9A9A96 |
| accent | #D97757 |
| accent2 | #C8A98A |

## 关键参数

- 质感类：hero
- 字体：sans
- 圆角：14px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* frontend-design — hero (dark) */
.aek-stage {
  --p-bg: #0F0F0F;
  --p-surface: #1A1A1A;
  --p-text: #FAFAF8;
  --p-muted: #9A9A96;
  --p-accent: #D97757;
  --p-accent2: #C8A98A;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```