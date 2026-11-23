# Trust & Authority

Healthcare/medical landing pages, financial services, enterprise software, premium/luxury…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F59E0B |
| surface | #f5a722 |
| text | #f4f4f5 |
| muted | #f4cd8c |
| accent | #059669 |
| accent2 | #059669 |

## 关键参数

- 质感类：cinema
- 字体：sans
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Trust & Authority — cinema */
.aek-stage {
  --p-bg: #F59E0B;
  --p-surface: #f5a722;
  --p-text: #f4f4f5;
  --p-muted: #f4cd8c;
  --p-accent: #059669;
  --p-accent2: #059669;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```