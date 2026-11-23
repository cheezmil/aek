# hallmark

反 AI 味 · 结构多样

> 来源：Hallmark

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F8F6FD |
| text | #14101F |
| muted | #7E7793 |
| accent | #8B5CF6 |
| accent2 | #1F1B2E |

## 关键参数

- 质感类：boldmin
- 字体：sans
- 圆角：2px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* hallmark — boldmin */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F8F6FD;
  --p-text: #14101F;
  --p-muted: #7E7793;
  --p-accent: #8B5CF6;
  --p-accent2: #1F1B2E;
  --sg-radius: 2px;
  --sg-blur: 0px;
}
```