# Memphis Design

Creative agencies, music sites, youth brands, event promotion, artistic portfolios, enter…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFCE5C |
| surface | #f1c358 |
| text | #18181b |
| muted | #806a38 |
| accent | #FF71CE |
| accent2 | #86CCCA |

## 关键参数

- 质感类：cyber
- 字体：serif
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Memphis Design — cyber */
.aek-stage {
  --p-bg: #FFCE5C;
  --p-surface: #f1c358;
  --p-text: #18181b;
  --p-muted: #806a38;
  --p-accent: #FF71CE;
  --p-accent2: #86CCCA;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```