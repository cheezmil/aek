# ui-ux-pro-max

UI/UX 智库 · HUD 检索

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #080A12 |
| surface | #101426 |
| text | #E8ECFB |
| muted | #7E86A8 |
| accent | #6366F1 |
| accent2 | #22D3EE |

## 关键参数

- 质感类：hud
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* ui-ux-pro-max — hud (dark) */
.aek-stage {
  --p-bg: #080A12;
  --p-surface: #101426;
  --p-text: #E8ECFB;
  --p-muted: #7E86A8;
  --p-accent: #6366F1;
  --p-accent2: #22D3EE;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```