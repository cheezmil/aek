# Terminal CLI (Mobile)

Developer tools, Web3/blockchain apps, geek-culture apps, ARG games, sci-fi/noir gaming c…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #33FF00 |
| surface | #30f000 |
| text | #050505 |
| muted | #1a7603 |
| accent | #FFB000 |
| accent2 | #FF3333 |

## 关键参数

- 质感类：cyber
- 字体：mono
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Terminal CLI (Mobile) — cyber */
.aek-stage {
  --p-bg: #33FF00;
  --p-surface: #30f000;
  --p-text: #050505;
  --p-muted: #1a7603;
  --p-accent: #FFB000;
  --p-accent2: #FF3333;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```