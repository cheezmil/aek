# banner-design

Banner · Memphis 波普

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFDF7 |
| surface | #FFF8E8 |
| text | #1A1712 |
| muted | #877F6A |
| accent | #6366F1 |
| accent2 | #F59E0B |

## 关键参数

- 质感类：memphis
- 字体：sans
- 圆角：10px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* banner-design — memphis */
.aek-stage {
  --p-bg: #FFFDF7;
  --p-surface: #FFF8E8;
  --p-text: #1A1712;
  --p-muted: #877F6A;
  --p-accent: #6366F1;
  --p-accent2: #F59E0B;
  --sg-radius: 10px;
  --sg-blur: 0px;
}
```