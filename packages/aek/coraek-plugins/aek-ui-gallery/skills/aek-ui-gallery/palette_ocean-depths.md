# ocean-depths

A professional and calming maritime theme that evokes the serenity of deep ocean waters.

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F1FAEE |
| surface | #e4ede3 |
| text | #1A2332 |
| muted | #7b8487 |
| accent | #2D8B8B |
| accent2 | #A8DADC |

## 关键参数

- 质感类：layer
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* ocean-depths — layer */
.aek-stage {
  --p-bg: #F1FAEE;
  --p-surface: #e4ede3;
  --p-text: #1A2332;
  --p-muted: #7b8487;
  --p-accent: #2D8B8B;
  --p-accent2: #A8DADC;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```