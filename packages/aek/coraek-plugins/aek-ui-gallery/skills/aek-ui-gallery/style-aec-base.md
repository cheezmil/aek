# AEK 基础样式

aek-web index.css :root · 浅色默认

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #f6f7f9 |
| surface | #ffffff |
| text | #18181b |
| muted | #a1a1aa |
| accent | #ea580c |
| accent2 | #c2410c |

## 关键参数

- 质感类：layer
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* AEK 基础样式 — layer */
.aek-stage {
  --p-bg: #f6f7f9;
  --p-surface: #ffffff;
  --p-text: #18181b;
  --p-muted: #a1a1aa;
  --p-accent: #ea580c;
  --p-accent2: #c2410c;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```