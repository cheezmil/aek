# Glassmorphism

Modern SaaS, financial dashboards, high-end corporate, lifestyle apps, modal overlays, na…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #20B2AA |
| surface | #35b9b2 |
| text | #f4f4f5 |
| muted | #95d6d3 |
| accent | #0080FF |
| accent2 | #FF1493 |

## 关键参数

- 质感类：glass
- 字体：sans
- 圆角：0px
- 毛玻璃：15px
- 深色底：否

## 应用 CSS

```css
/* Glassmorphism — glass */
.aek-stage {
  --p-bg: #20B2AA;
  --p-surface: #35b9b2;
  --p-text: #f4f4f5;
  --p-muted: #95d6d3;
  --p-accent: #0080FF;
  --p-accent2: #FF1493;
  --sg-radius: 0px;
  --sg-blur: 15px;
}
```