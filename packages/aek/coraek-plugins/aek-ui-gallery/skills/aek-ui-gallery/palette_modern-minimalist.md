# modern-minimalist

A clean and contemporary theme with a sophisticated grayscale palette for maximum versatility.

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #f3f4f4 |
| text | #36454F |
| muted | #90999e |
| accent | #708090 |
| accent2 | #D3D3D3 |

## 关键参数

- 质感类：minimal
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* modern-minimalist — minimal */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #f3f4f4;
  --p-text: #36454F;
  --p-muted: #90999e;
  --p-accent: #708090;
  --p-accent2: #D3D3D3;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```