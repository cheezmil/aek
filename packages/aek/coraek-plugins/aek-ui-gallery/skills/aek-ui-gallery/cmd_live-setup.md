# live-setup

One-time live-mode project setup. Loaded from [live.md](live.md) only when impeccable live reports …

> 来源：Impeccable

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0A0A0F |
| surface | #1B1B20 |
| text | #F0F0F0 |
| muted | #88888B |
| accent | #FF0000 |
| accent2 | #FFA500 |

## 关键参数

- 质感类：hud
- 字体：mono
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* live-setup — hud (dark) */
.aek-stage {
  --p-bg: #0A0A0F;
  --p-surface: #1B1B20;
  --p-text: #F0F0F0;
  --p-muted: #88888B;
  --p-accent: #FF0000;
  --p-accent2: #FFA500;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```