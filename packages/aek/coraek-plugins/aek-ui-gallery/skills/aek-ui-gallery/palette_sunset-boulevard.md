# sunset-boulevard

A warm and vibrant theme inspired by golden hour sunsets, perfect for energetic and creative presen…

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #E9C46A |
| surface | #ddbc69 |
| text | #264653 |
| muted | #7e7f5d |
| accent | #E76F51 |
| accent2 | #F4A261 |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* sunset-boulevard — editorial */
.aek-stage {
  --p-bg: #E9C46A;
  --p-surface: #ddbc69;
  --p-text: #264653;
  --p-muted: #7e7f5d;
  --p-accent: #E76F51;
  --p-accent2: #F4A261;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```