# AEK 基础样式 · 深色

aek-web index.css .dark

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #131519 |
| surface | #1b1e24 |
| text | #e8eaef |
| muted | #6e717c |
| accent | #f8843c |
| accent2 | #e06a26 |

## 关键参数

- 质感类：layer
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* AEK 基础样式 · 深色 — layer (dark) */
.aek-stage {
  --p-bg: #131519;
  --p-surface: #1b1e24;
  --p-text: #e8eaef;
  --p-muted: #6e717c;
  --p-accent: #f8843c;
  --p-accent2: #e06a26;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```