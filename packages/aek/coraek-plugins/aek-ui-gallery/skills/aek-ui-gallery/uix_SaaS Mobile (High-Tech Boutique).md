# SaaS Mobile (High-Tech Boutique)

B2B SaaS mobile dashboards, fintech apps, developer tool mobile companions, marketing ana…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAFAFA |
| surface | #ececee |
| text | #0F172A |
| muted | #797d88 |
| accent | #0052FF |
| accent2 | #4D7CFF |

## 关键参数

- 质感类：glass
- 字体：mono
- 圆角：12px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* SaaS Mobile (High-Tech Boutique) — glass */
.aek-stage {
  --p-bg: #FAFAFA;
  --p-surface: #ececee;
  --p-text: #0F172A;
  --p-muted: #797d88;
  --p-accent: #0052FF;
  --p-accent2: #4D7CFF;
  --sg-radius: 12px;
  --sg-blur: 16px;
}
```