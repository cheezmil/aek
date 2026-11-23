# typeset

Typography carries information, hierarchy, and voice. Improve it inside the established visual worl…

> 来源：Impeccable

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0A0A0F |
| surface | #1B1B20 |
| text | #F0F0F0 |
| muted | #88888B |
| accent | #01CDFE |
| accent2 | #05FFA1 |

## 关键参数

- 质感类：vapor
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* typeset — vapor (dark) */
.aek-stage {
  --p-bg: #0A0A0F;
  --p-surface: #1B1B20;
  --p-text: #F0F0F0;
  --p-muted: #88888B;
  --p-accent: #01CDFE;
  --p-accent2: #05FFA1;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```