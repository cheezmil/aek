# Warm Organic

Warm natural organic visual aesthetics

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5F5DC |
| surface | #e9ebd4 |
| text | #2F4F4F |
| muted | #889a8e |
| accent | #8B4513 |
| accent2 | #228B22 |

## 关键参数

- 质感类：organic
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Warm Organic — organic */
.aek-stage {
  --p-bg: #F5F5DC;
  --p-surface: #e9ebd4;
  --p-text: #2F4F4F;
  --p-muted: #889a8e;
  --p-accent: #8B4513;
  --p-accent2: #228B22;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```