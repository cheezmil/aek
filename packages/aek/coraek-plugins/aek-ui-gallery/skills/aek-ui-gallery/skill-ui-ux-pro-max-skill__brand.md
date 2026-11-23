# brand

品牌 · 社论版式

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F5F5FA |
| text | #151419 |
| muted | #7F7D8C |
| accent | #6366F1 |
| accent2 | #C9A227 |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：2px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* brand — editorial */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F5F5FA;
  --p-text: #151419;
  --p-muted: #7F7D8C;
  --p-accent: #6366F1;
  --p-accent2: #C9A227;
  --sg-radius: 2px;
  --sg-blur: 0px;
}
```