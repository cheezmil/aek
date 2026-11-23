# Vintage Badge

Breweries coffee shops craft brands

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #D4AF37 |
| surface | #d7b64a |
| text | #f4f4f5 |
| muted | #e6d5a0 |
| accent | #8B4513 |
| accent2 | #8B4513 |

## 关键参数

- 质感类：retro
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Vintage Badge — retro */
.aek-stage {
  --p-bg: #D4AF37;
  --p-surface: #d7b64a;
  --p-text: #f4f4f5;
  --p-muted: #e6d5a0;
  --p-accent: #8B4513;
  --p-accent2: #8B4513;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```