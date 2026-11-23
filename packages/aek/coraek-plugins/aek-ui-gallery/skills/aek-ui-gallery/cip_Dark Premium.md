# Dark Premium

Dark sophisticated premium aesthetics

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #f1f1f1 |
| text | #0F0F0F |
| muted | #7b7b7b |
| accent | #D4AF37 |
| accent2 | #1A1A1A |

## 关键参数

- 质感类：cinema
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Dark Premium — cinema */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #f1f1f1;
  --p-text: #0F0F0F;
  --p-muted: #7b7b7b;
  --p-accent: #D4AF37;
  --p-accent2: #1A1A1A;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```