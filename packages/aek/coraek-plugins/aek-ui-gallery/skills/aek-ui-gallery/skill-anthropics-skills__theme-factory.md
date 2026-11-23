# theme-factory

主题工厂 · 多彩

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F5F3FF |
| text | #17141F |
| muted | #7C7890 |
| accent | #FF6B6B |
| accent2 | #4ECDC4 |

## 关键参数

- 质感类：vibrant
- 字体：sans
- 圆角：16px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* theme-factory — vibrant */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F5F3FF;
  --p-text: #17141F;
  --p-muted: #7C7890;
  --p-accent: #FF6B6B;
  --p-accent2: #4ECDC4;
  --sg-radius: 16px;
  --sg-blur: 0px;
}
```