# Financial Dashboard

Financial reporting, accounting dashboards, portfolio tracking, budget monitoring, bankin…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F3F4F6 |
| surface | #e4e8ed |
| text | #003366 |
| muted | #6d8aa7 |
| accent | #22C55E |
| accent2 | #EF4444 |

## 关键参数

- 质感类：dash
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Financial Dashboard — dash */
.aek-stage {
  --p-bg: #F3F4F6;
  --p-surface: #e4e8ed;
  --p-text: #003366;
  --p-muted: #6d8aa7;
  --p-accent: #22C55E;
  --p-accent2: #EF4444;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```