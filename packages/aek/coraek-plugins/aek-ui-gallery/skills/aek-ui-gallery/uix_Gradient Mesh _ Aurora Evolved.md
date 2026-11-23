# Gradient Mesh / Aurora Evolved

Hero sections, backgrounds, creative brands, music platforms, fashion, lifestyle, premium…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFF00 |
| surface | #f0f60f |
| text | #0066FF |
| muted | #73ab8c |
| accent | #00FFFF |
| accent2 | #FF00FF |

## 关键参数

- 质感类：mesh
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Gradient Mesh / Aurora Evolved — mesh */
.aek-stage {
  --p-bg: #FFFF00;
  --p-surface: #f0f60f;
  --p-text: #0066FF;
  --p-muted: #73ab8c;
  --p-accent: #00FFFF;
  --p-accent2: #FF00FF;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```