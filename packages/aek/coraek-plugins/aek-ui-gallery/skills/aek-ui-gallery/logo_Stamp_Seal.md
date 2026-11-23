# Stamp/Seal

Artisan coffee postal craft brands

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #000080 |
| surface | #18188c |
| text | #f4f4f5 |
| muted | #8686c0 |
| accent | #8B0000 |
| accent2 | #8B0000 |

## 关键参数

- 质感类：bento
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* Stamp/Seal — bento (dark) */
.aek-stage {
  --p-bg: #000080;
  --p-surface: #18188c;
  --p-text: #f4f4f5;
  --p-muted: #8686c0;
  --p-accent: #8B0000;
  --p-accent2: #8B0000;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```