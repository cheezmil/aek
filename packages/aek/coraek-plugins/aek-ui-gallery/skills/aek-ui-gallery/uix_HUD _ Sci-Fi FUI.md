# HUD / Sci-Fi FUI

Sci-fi games, space tech, cybersecurity, movie props, immersive dashboards

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #00FFFF |
| surface | #03f3f3 |
| text | #333333 |
| muted | #1c8f8f |
| accent | #0080FF |
| accent2 | #FF0000 |

## 关键参数

- 质感类：neubrutal
- 字体：mono
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* HUD / Sci-Fi FUI — neubrutal */
.aek-stage {
  --p-bg: #00FFFF;
  --p-surface: #03f3f3;
  --p-text: #333333;
  --p-muted: #1c8f8f;
  --p-accent: #0080FF;
  --p-accent2: #FF0000;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```