# Split/Fragmented

Creative agencies art design studios

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0000FF |
| surface | #1212FF |
| text | #F0F0F0 |
| muted | #8484F7 |
| accent | #FF0000 |
| accent2 | #00FF00 |

## 关键参数

- 质感类：glitch
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* Split/Fragmented — glitch (dark) */
.aek-stage {
  --p-bg: #0000FF;
  --p-surface: #1212FF;
  --p-text: #F0F0F0;
  --p-muted: #8484F7;
  --p-accent: #FF0000;
  --p-accent2: #00FF00;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```