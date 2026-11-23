# Vintage/Retro

Craft brands heritage products artisan goods

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5DEB3 |
| surface | #e9d5ad |
| text | #2F4F4F |
| muted | #888f7c |
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
/* Vintage/Retro — retro */
.aek-stage {
  --p-bg: #F5DEB3;
  --p-surface: #e9d5ad;
  --p-text: #2F4F4F;
  --p-muted: #888f7c;
  --p-accent: #8B4513;
  --p-accent2: #8B4513;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```