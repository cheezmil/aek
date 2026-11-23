# User Behavior Analytics

Conversion funnel analysis, user journey tracking, engagement analytics, cohort analysis,…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #3B82F6 |
| surface | #4e8df6 |
| text | #f4f4f5 |
| muted | #a1c1f5 |
| accent | #2196F3 |
| accent2 | #FFEB3B |

## 关键参数

- 质感类：neubrutal
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* User Behavior Analytics — neubrutal (dark) */
.aek-stage {
  --p-bg: #3B82F6;
  --p-surface: #4e8df6;
  --p-text: #f4f4f5;
  --p-muted: #a1c1f5;
  --p-accent: #2196F3;
  --p-accent2: #FFEB3B;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```