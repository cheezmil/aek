# tech-innovation

A bold and modern theme with high-contrast colors perfect for cutting-edge technology presentations.

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #f2f2f2 |
| text | #1E1E1E |
| muted | #838383 |
| accent | #0066FF |
| accent2 | #00FFFF |

## 关键参数

- 质感类：cyber
- 字体：sans
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* tech-innovation — cyber */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #f2f2f2;
  --p-text: #1E1E1E;
  --p-muted: #838383;
  --p-accent: #0066FF;
  --p-accent2: #00FFFF;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```