# Swiss Modernism 2.0

Corporate sites, architecture, editorial, SaaS, museums, professional services, documenta…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #f0f0f0 |
| text | #000000 |
| muted | #737373 |
| accent | #F5F5F5 |
| accent2 | #F5F5F5 |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Swiss Modernism 2.0 — editorial */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #f0f0f0;
  --p-text: #000000;
  --p-muted: #737373;
  --p-accent: #F5F5F5;
  --p-accent2: #F5F5F5;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```