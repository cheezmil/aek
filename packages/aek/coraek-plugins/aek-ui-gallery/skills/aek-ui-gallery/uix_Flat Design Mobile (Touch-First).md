# Flat Design Mobile (Touch-First)

Cross-platform apps (iOS+Android parity), information-dense dashboards, system UI, brand …

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #f1f1f2 |
| text | #111827 |
| muted | #7c8088 |
| accent | #10B981 |
| accent2 | #3B82F6 |

## 关键参数

- 质感类：minimal
- 字体：sans
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Flat Design Mobile (Touch-First) — minimal */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #f1f1f2;
  --p-text: #111827;
  --p-muted: #7c8088;
  --p-accent: #10B981;
  --p-accent2: #3B82F6;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```