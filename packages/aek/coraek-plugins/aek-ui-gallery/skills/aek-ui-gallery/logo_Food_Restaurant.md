# Food/Restaurant

Restaurants cafes food delivery

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #DC2626 |
| surface | #de3b3b |
| text | #f4f4f5 |
| muted | #e99798 |
| accent | #CA8A04 |
| accent2 | #CA8A04 |

## 关键参数

- 质感类：layer
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* Food/Restaurant — layer (dark) */
.aek-stage {
  --p-bg: #DC2626;
  --p-surface: #de3b3b;
  --p-text: #f4f4f5;
  --p-muted: #e99798;
  --p-accent: #CA8A04;
  --p-accent2: #CA8A04;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```