# Analog Meditation

Philosophy: Quiet visual contemplation through texture and breathing room. Visual expression: Paper grain, in…

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5F5DC |
| surface | #E8E8D0 |
| text | #1A1A1A |
| muted | #7D7D71 |
| accent | #8B4513 |
| accent2 | #228B22 |

## 关键参数

- 质感类：organic
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Analog Meditation — organic */
.aek-stage {
  --p-bg: #F5F5DC;
  --p-surface: #E8E8D0;
  --p-text: #1A1A1A;
  --p-muted: #7D7D71;
  --p-accent: #8B4513;
  --p-accent2: #228B22;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```