# Neumorphism (Mobile)

Minimal hardware controls, smart home apps, aesthetic utility tools, health monitors, bra…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #E0E5EC |
| surface | #d6dce3 |
| text | #3D4852 |
| muted | #868f97 |
| accent | #6C63FF |
| accent2 | #6B7280 |

## 关键参数

- 质感类：glass
- 字体：mono
- 圆角：999px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* Neumorphism (Mobile) — glass */
.aek-stage {
  --p-bg: #E0E5EC;
  --p-surface: #d6dce3;
  --p-text: #3D4852;
  --p-muted: #868f97;
  --p-accent: #6C63FF;
  --p-accent2: #6B7280;
  --sg-radius: 999px;
  --sg-blur: 16px;
}
```