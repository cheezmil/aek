# Retro Vintage

Nostalgic retro-inspired visual identity

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #DEB887 |
| surface | #d4b284 |
| text | #2F4F4F |
| muted | #7e7e68 |
| accent | #CA8A04 |
| accent2 | #8B4513 |

## 关键参数

- 质感类：retro
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Retro Vintage — retro */
.aek-stage {
  --p-bg: #DEB887;
  --p-surface: #d4b284;
  --p-text: #2F4F4F;
  --p-muted: #7e7e68;
  --p-accent: #CA8A04;
  --p-accent2: #8B4513;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```