# Enterprise SaaS (Mobile)

B2B backend management, productivity tools, government and finance mobile apps, SaaS comp…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #f1f1f2 |
| text | #0F172A |
| muted | #7b7f8a |
| accent | #7C3AED |
| accent2 | #4F46E5 |

## 关键参数

- 质感类：minimal
- 字体：sans
- 圆角：999px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Enterprise SaaS (Mobile) — minimal */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #f1f1f2;
  --p-text: #0F172A;
  --p-muted: #7b7f8a;
  --p-accent: #7C3AED;
  --p-accent2: #4F46E5;
  --sg-radius: 999px;
  --sg-blur: 0px;
}
```