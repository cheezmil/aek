# Hero-Centric Design

SaaS landing pages, product launches, service landing pages, B2B platforms, tech companies

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0D0D0D |
| surface | #1E1E1E |
| text | #F0F0F0 |
| muted | #8A8A8A |
| accent | #00FF00 |
| accent2 | #FF00FF |

## 关键参数

- 质感类：cyber
- 字体：sans
- 圆角：0px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* Hero-Centric Design — cyber (dark) */
.aek-stage {
  --p-bg: #0D0D0D;
  --p-surface: #1E1E1E;
  --p-text: #F0F0F0;
  --p-muted: #8A8A8A;
  --p-accent: #00FF00;
  --p-accent2: #FF00FF;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```