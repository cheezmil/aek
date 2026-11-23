# golden-hour

A rich and warm autumnal palette that creates an inviting and sophisticated atmosphere.

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #D4B896 |
| surface | #ccb190 |
| text | #4A403A |
| muted | #887663 |
| accent | #F4A900 |
| accent2 | #C1666B |

## 关键参数

- 质感类：cinema
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* golden-hour — cinema */
.aek-stage {
  --p-bg: #D4B896;
  --p-surface: #ccb190;
  --p-text: #4A403A;
  --p-muted: #887663;
  --p-accent: #F4A900;
  --p-accent2: #C1666B;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```