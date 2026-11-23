# forest-canopy

A natural and grounded theme featuring earth tones inspired by dense forest environments.

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAF9F6 |
| surface | #eeefea |
| text | #2D4A2B |
| muted | #899986 |
| accent | #A4AC86 |
| accent2 | #7D8471 |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* forest-canopy — editorial */
.aek-stage {
  --p-bg: #FAF9F6;
  --p-surface: #eeefea;
  --p-text: #2D4A2B;
  --p-muted: #899986;
  --p-accent: #A4AC86;
  --p-accent2: #7D8471;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```