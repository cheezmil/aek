# desert-rose

A soft and sophisticated theme with dusty, muted tones perfect for elegant presentations.

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #E8D5C4 |
| surface | #e0cbbc |
| text | #5D2E46 |
| muted | #9c797f |
| accent | #B87D6D |
| accent2 | #D4A5A5 |

## 关键参数

- 质感类：organic
- 字体：sans
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* desert-rose — organic */
.aek-stage {
  --p-bg: #E8D5C4;
  --p-surface: #e0cbbc;
  --p-text: #5D2E46;
  --p-muted: #9c797f;
  --p-accent: #B87D6D;
  --p-accent2: #D4A5A5;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```