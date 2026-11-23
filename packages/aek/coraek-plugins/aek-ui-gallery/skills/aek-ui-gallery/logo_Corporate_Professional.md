# Corporate/Professional

Financial legal consulting corporate

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #f0f3f6 |
| text | #003366 |
| muted | #738fab |
| accent | #666666 |
| accent2 | #666666 |

## 关键参数

- 质感类：editorial
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Corporate/Professional — editorial */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #f0f3f6;
  --p-text: #003366;
  --p-muted: #738fab;
  --p-accent: #666666;
  --p-accent2: #666666;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```