# Crest/Heraldic

Universities sports teams luxury brands

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFD700 |
| surface | #f2ce08 |
| text | #1E3A8A |
| muted | #83814c |
| accent | #8B0000 |
| accent2 | #8B0000 |

## 关键参数

- 质感类：editorial
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Crest/Heraldic — editorial */
.aek-stage {
  --p-bg: #FFD700;
  --p-surface: #f2ce08;
  --p-text: #1E3A8A;
  --p-muted: #83814c;
  --p-accent: #8B0000;
  --p-accent2: #8B0000;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```